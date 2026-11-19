import {
  type ConstDirectiveNode,
  type DocumentNode,
  type FieldDefinitionNode,
  GraphQLError,
  type InputValueDefinitionNode,
  Kind,
  type ObjectTypeDefinitionNode,
  OperationTypeNode,
} from "graphql";
import type { SupergraphState } from "../supergraph/state.js";
import { createQueryRootTypeInaccessibleError } from "../subgraph/validation/rules/query-root-type-inaccessible-rule.js";
import { enrichErrorWithSubgraphName } from "../subgraph/validation/validate-subgraph.js";
import { extractLinkImplementations } from "../utils/link/index.js";
import {
  buildSchemaCoordinateTagRegister,
  createTagDirectiveNameExtractionStrategy,
  isArgumentExcludedByFilter,
  isExcludedByExcludeFilter,
  isExcludedByFilter,
  type SchemaContractFilter,
} from "./tag-extraction.js";

type GraphInfo = {
  name: string;
  /** Normalized root type name (Query, Mutation, Subscription) to the name used in the subgraph */
  localRootTypeNames: Map<string, string>;
  /** The node that gets `@inaccessible` when the root query type is excluded, if it is a type definition */
  rootQueryDefinition: ObjectTypeDefinitionNode | null;
  /** Fields of types annotated with `@external` (Federation v1), by the type names used in the subgraph */
  fieldsOfExternalTypes: Set<string>;
  /**
   * Types declared in the subgraph that are not part of the supergraph (for example federation's own types).
   * They are not in the supergraph state, but the filter applying `@inaccessible` to them still makes the supergraph use the spec.
   */
  typesMissingInSupergraph: TypeMissingInSupergraph[];
};

type TypeMissingInSupergraph = {
  name: string;
  /** Scalars and unions are excluded by `include` too */
  isLeaf: boolean;
  /** Fields, arguments and enum values */
  children: Array<{
    name: string;
    /** For an argument, the schema coordinate of its field */
    argumentOf?: string;
    external: boolean;
  }>;
};

/** Where `@tag` is left as it is by the filter */
type TagsLeftByFilter = {
  /** Whether any subgraph has `@tag` the filter does not remove */
  any: boolean;
  /** `@tag` on scalar and union type extensions */
  byTypeName: Map<string, Set<string>>;
};

/**
 * Prepares an already composed supergraph state for deriving schema contracts from it.
 *
 * The returned function applies a contract's tag filter to the state,
 * making the same decisions `applyTagFilterOnSubgraphs` makes for each subgraph:
 * elements excluded by the filter get `@inaccessible`, and `@tag` is removed.
 *
 * It mutates the state, and returns a function that puts it back the way it was,
 * so several contracts can be derived from one composition, one after another.
 */
export function createSupergraphStateContractFilter(
  services: ReadonlyArray<{ name: string; typeDefs: DocumentNode }>,
  state: SupergraphState,
) {
  // The decisions are made with the same tag register as the subgraph filter,
  // which is keyed by the type names used in each subgraph (root types can be renamed).
  const register = buildSchemaCoordinateTagRegister(
    services.map((service) => service.typeDefs),
  );
  const typeDefsByName = new Map(
    services.map((service) => [service.name, service.typeDefs]),
  );
  const graphs = new Map<string, GraphInfo>();
  const supergraphTypeNames = new Set([
    ...state.objectTypes.keys(),
    ...state.interfaceTypes.keys(),
    ...state.inputObjectTypes.keys(),
    ...state.enumTypes.keys(),
    ...state.scalarTypes.keys(),
    ...state.unionTypes.keys(),
  ]);
  const tagsLeftByFilter: TagsLeftByFilter = {
    any: false,
    byTypeName: new Map(),
  };

  for (const [graphId, subgraphState] of state.subgraphs) {
    const typeDefs = typeDefsByName.get(subgraphState.graph.name);

    if (!typeDefs) {
      throw new Error(`Could not find subgraph ${subgraphState.graph.name}`);
    }

    graphs.set(
      graphId,
      describeGraph(
        subgraphState.graph.name,
        typeDefs,
        supergraphTypeNames,
        tagsLeftByFilter,
      ),
    );
  }

  return function applyTagFilter(filter: SchemaContractFilter): {
    errors: GraphQLError[];
    restore(): void;
  } {
    const undo: Array<() => void> = [];

    function set<T extends object, K extends keyof T>(
      obj: T,
      key: K,
      value: T[K],
    ) {
      const previous = obj[key];
      if (previous === value) {
        return;
      }
      obj[key] = value;
      undo.push(() => {
        obj[key] = previous;
      });
    }

    const errors: GraphQLError[] = [];
    let appliedInaccessible = false;
    let hasRemainingTags = tagsLeftByFilter.any;

    function markInaccessible(element: object) {
      appliedInaccessible = true;

      // Arguments of interface fields have no `@inaccessible` in the supergraph,
      // but applying it in a subgraph still makes the supergraph use the spec.
      if (hasInaccessibleFlag(element)) {
        set(element, "inaccessible", true);
      }
    }

    function setTags(element: { tags: Set<string> }, tags: Set<string>) {
      if (tags.size > 0) {
        hasRemainingTags = true;
      }

      if (element.tags.size > 0 || tags.size > 0) {
        set(element, "tags", tags);
      }
    }

    function localTypeName(graphId: string, typeName: string) {
      return graphs.get(graphId)!.localRootTypeNames.get(typeName) ?? typeName;
    }

    function tagsOf(coordinate: string) {
      return register.get(coordinate) ?? emptyTags;
    }

    function isExcluded(tags: Set<string>) {
      return isExcludedByFilter(tags, filter);
    }

    function isExcludedByExclude(tags: Set<string>) {
      return isExcludedByExcludeFilter(tags, filter);
    }

    function isArgumentExcluded(fieldCoordinate: string, argName: string) {
      return isArgumentExcludedByFilter(
        tagsOf(`${fieldCoordinate}(${argName}:)`),
        () => tagsOf(fieldCoordinate),
        filter,
      );
    }

    /**
     * Whether all fields (or enum values) of a type are excluded, by the type name used in subgraphs.
     * A type gets `@inaccessible` when that is true in every subgraph that has it.
     */
    const allChildrenExcluded = new Map<string, boolean>();
    /** Supergraph types by the type names used in subgraphs */
    const typesByLocalName = new Map<string, Set<object>>();

    function trackChildren(
      graphId: string,
      typeName: string,
      type: object,
      someAccessible: boolean,
    ) {
      const local = localTypeName(graphId, typeName);
      const rootQueryName =
        graphs.get(graphId)!.localRootTypeNames.get("Query") ?? "Query";

      // The root query type can't be made inaccessible, even when none of its fields are part of the contract.
      if (local === rootQueryName) {
        return;
      }

      allChildrenExcluded.set(
        local,
        (allChildrenExcluded.get(local) ?? true) && !someAccessible,
      );

      let types = typesByLocalName.get(local);
      if (!types) {
        types = new Set();
        typesByLocalName.set(local, types);
      }
      types.add(type);
    }

    for (const objectType of [
      ...state.objectTypes.values(),
      ...state.interfaceTypes.values(),
    ]) {
      const someAccessibleInGraph = new Set<string>();

      for (const field of objectType.fields.values()) {
        for (const arg of field.args.values()) {
          for (const graphId of arg.byGraph.keys()) {
            if (
              isArgumentExcluded(
                `${localTypeName(graphId, objectType.name)}.${field.name}`,
                arg.name,
              )
            ) {
              markInaccessible(arg);
            }
          }

          setTags(arg, emptyTags);
        }

        let remainingTags = emptyTags;

        for (const [graphId, fieldInGraph] of field.byGraph) {
          const typeInGraph = objectType.byGraph.get(graphId);

          // `@inaccessible` can't be applied to an external field,
          // so a subgraph where the field is external leaves it, and its `@tag`, as it is.
          if (
            fieldInGraph.external ||
            (!!typeInGraph &&
              "external" in typeInGraph &&
              typeInGraph.external) ||
            graphs
              .get(graphId)!
              .fieldsOfExternalTypes.has(
                `${localTypeName(graphId, objectType.name)}.${field.name}`,
              )
          ) {
            const fieldTags = getFieldTagsInGraph(
              state,
              graphId,
              objectType.name,
              field.name,
            );

            if (fieldTags?.size) {
              remainingTags = new Set([...remainingTags, ...fieldTags]);
            }

            continue;
          }

          if (
            isExcluded(
              tagsOf(
                `${localTypeName(graphId, objectType.name)}.${field.name}`,
              ),
            )
          ) {
            markInaccessible(field);
          } else {
            someAccessibleInGraph.add(graphId);
          }
        }

        setTags(field, remainingTags);
      }

      for (const graphId of objectType.byGraph.keys()) {
        if (
          isExcludedByExclude(tagsOf(localTypeName(graphId, objectType.name)))
        ) {
          markInaccessible(objectType);

          const graph = graphs.get(graphId)!;
          if (objectType.name === "Query" && graph.rootQueryDefinition) {
            errors.push(
              enrichErrorWithSubgraphName(
                createQueryRootTypeInaccessibleError(graph.rootQueryDefinition),
                graph.name,
              ),
            );
          }
        }

        trackChildren(
          graphId,
          objectType.name,
          objectType,
          someAccessibleInGraph.has(graphId),
        );
      }

      setTags(objectType, emptyTags);
    }

    for (const inputObjectType of state.inputObjectTypes.values()) {
      const someAccessibleInGraph = new Set<string>();

      for (const field of inputObjectType.fields.values()) {
        for (const graphId of field.byGraph.keys()) {
          if (isExcluded(tagsOf(`${inputObjectType.name}.${field.name}`))) {
            markInaccessible(field);
          } else {
            someAccessibleInGraph.add(graphId);
          }
        }

        setTags(field, emptyTags);
      }

      if (isExcludedByExclude(tagsOf(inputObjectType.name))) {
        markInaccessible(inputObjectType);
      }

      for (const graphId of inputObjectType.byGraph.keys()) {
        trackChildren(
          graphId,
          inputObjectType.name,
          inputObjectType,
          someAccessibleInGraph.has(graphId),
        );
      }

      setTags(inputObjectType, emptyTags);
    }

    for (const enumType of state.enumTypes.values()) {
      const someAccessibleInGraph = new Set<string>();

      for (const value of enumType.values.values()) {
        for (const graphId of value.byGraph.keys()) {
          if (isExcluded(tagsOf(`${enumType.name}.${value.name}`))) {
            markInaccessible(value);
          } else {
            someAccessibleInGraph.add(graphId);
          }
        }

        setTags(value, emptyTags);
      }

      if (isExcludedByExclude(tagsOf(enumType.name))) {
        // An excluded enum is not tracked, it is inaccessible already.
        markInaccessible(enumType);
      } else {
        for (const graphId of enumType.byGraph.keys()) {
          trackChildren(
            graphId,
            enumType.name,
            enumType,
            someAccessibleInGraph.has(graphId),
          );
        }
      }

      setTags(enumType, emptyTags);
    }

    for (const type of [
      ...state.scalarTypes.values(),
      ...state.unionTypes.values(),
    ]) {
      if (isExcluded(tagsOf(type.name))) {
        markInaccessible(type);
      }

      // `@tag` on a type extension of a scalar or union is not removed by the filter.
      const tagsLeft = tagsLeftByFilter.byTypeName.get(type.name);
      setTags(
        type,
        tagsLeft
          ? new Set(Array.from(type.tags).filter((tag) => tagsLeft.has(tag)))
          : emptyTags,
      );
    }

    if (!appliedInaccessible) {
      for (const graph of graphs.values()) {
        for (const type of graph.typesMissingInSupergraph) {
          if (
            (type.isLeaf
              ? isExcluded(tagsOf(type.name))
              : isExcludedByExclude(tagsOf(type.name))) ||
            type.children.some(
              (child) =>
                !child.external &&
                (child.argumentOf
                  ? isArgumentExcluded(child.argumentOf, child.name)
                  : isExcluded(tagsOf(`${type.name}.${child.name}`))),
            )
          ) {
            appliedInaccessible = true;
          }
        }
      }
    }

    for (const [localName, excluded] of allChildrenExcluded) {
      if (excluded) {
        for (const type of typesByLocalName.get(localName)!) {
          markInaccessible(type);
        }
      }
    }

    if (!hasRemainingTags) {
      set(state.specs, "tag", false);
    }

    if (appliedInaccessible) {
      set(state.specs, "inaccessible", true);
    }

    return {
      errors,
      restore() {
        for (let i = undo.length - 1; i >= 0; i--) {
          undo[i]();
        }
      },
    };
  };
}

const emptyTags: Set<string> = new Set();

function getFieldTagsInGraph(
  state: SupergraphState,
  graphId: string,
  typeName: string,
  fieldName: string,
): Set<string> | undefined {
  const type = state.subgraphs.get(graphId)?.types.get(typeName);

  if (!type || !("fields" in type)) {
    return undefined;
  }

  const field = type.fields.get(fieldName);

  return field && "tags" in field ? field.tags : undefined;
}

function describeGraph(
  name: string,
  typeDefs: DocumentNode,
  supergraphTypeNames: Set<string>,
  tagsLeftByFilter: TagsLeftByFilter,
): GraphInfo {
  const { resolveImportName } = extractLinkImplementations(typeDefs);
  const extractTag = createTagDirectiveNameExtractionStrategy(
    resolveImportName("https://specs.apollo.dev/federation", "@tag"),
  );
  const externalDirectiveName = resolveImportName(
    "https://specs.apollo.dev/federation",
    "@external",
  );

  function tagsOn(node: { directives?: readonly ConstDirectiveNode[] }) {
    const tags = new Set<string>();
    for (const directive of node.directives ?? []) {
      const tag = extractTag(directive);
      if (tag !== null) {
        tags.add(tag);
      }
    }
    return tags;
  }

  function isExternal(node: { directives?: readonly ConstDirectiveNode[] }) {
    return (
      node.directives?.some(
        (directive) => directive.name.value === externalDirectiveName,
      ) ?? false
    );
  }

  const localRootTypeNames = new Map<string, string>();
  const normalizedNames = {
    [OperationTypeNode.QUERY]: "Query",
    [OperationTypeNode.MUTATION]: "Mutation",
    [OperationTypeNode.SUBSCRIPTION]: "Subscription",
  };

  for (const definition of typeDefs.definitions) {
    if (
      definition.kind === Kind.SCHEMA_DEFINITION ||
      definition.kind === Kind.SCHEMA_EXTENSION
    ) {
      for (const operationType of definition.operationTypes ?? []) {
        localRootTypeNames.set(
          normalizedNames[operationType.operation],
          operationType.type.name.value,
        );
      }
    }
  }

  // `@inaccessible` goes on the first node of the type, and it is reported only when that is a type definition.
  const rootQueryName = localRootTypeNames.get("Query") ?? "Query";
  const firstRootQueryNode = typeDefs.definitions.find(
    (definition) =>
      (definition.kind === Kind.OBJECT_TYPE_DEFINITION ||
        definition.kind === Kind.OBJECT_TYPE_EXTENSION) &&
      definition.name.value === rootQueryName,
  );

  const fieldsOfExternalTypes = new Set<string>();
  const typesMissingInSupergraph: TypeMissingInSupergraph[] = [];
  const localRootNames = new Set(localRootTypeNames.values());

  for (const definition of typeDefs.definitions) {
    switch (definition.kind) {
      case Kind.SCHEMA_DEFINITION:
      case Kind.SCHEMA_EXTENSION: {
        if (tagsOn(definition).size > 0) {
          tagsLeftByFilter.any = true;
        }
        break;
      }
      case Kind.DIRECTIVE_DEFINITION: {
        if (definition.arguments?.some((arg) => tagsOn(arg).size > 0)) {
          tagsLeftByFilter.any = true;
        }
        break;
      }
      case Kind.SCALAR_TYPE_EXTENSION:
      case Kind.UNION_TYPE_EXTENSION: {
        const tags = tagsOn(definition);
        if (tags.size > 0) {
          tagsLeftByFilter.any = true;
          let tagsOfType = tagsLeftByFilter.byTypeName.get(
            definition.name.value,
          );
          if (!tagsOfType) {
            tagsOfType = new Set();
            tagsLeftByFilter.byTypeName.set(definition.name.value, tagsOfType);
          }
          for (const tag of tags) {
            tagsOfType.add(tag);
          }
        }
        break;
      }
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.OBJECT_TYPE_EXTENSION:
      case Kind.INTERFACE_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_EXTENSION:
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
      case Kind.INPUT_OBJECT_TYPE_EXTENSION:
      case Kind.ENUM_TYPE_DEFINITION:
      case Kind.ENUM_TYPE_EXTENSION:
      case Kind.SCALAR_TYPE_DEFINITION:
      case Kind.UNION_TYPE_DEFINITION: {
        const typeName = definition.name.value;
        const isExternalType = isExternal(definition);
        const fields: ReadonlyArray<
          FieldDefinitionNode | InputValueDefinitionNode
        > = "fields" in definition ? (definition.fields ?? []) : [];

        if (isExternalType) {
          for (const field of fields) {
            fieldsOfExternalTypes.add(`${typeName}.${field.name.value}`);
          }
        }

        if (supergraphTypeNames.has(typeName) || localRootNames.has(typeName)) {
          break;
        }

        const children: TypeMissingInSupergraph["children"] = [];

        for (const field of fields) {
          children.push({
            name: field.name.value,
            external: isExternalType || isExternal(field),
          });

          if ("arguments" in field) {
            for (const arg of field.arguments ?? []) {
              children.push({
                name: arg.name.value,
                argumentOf: `${typeName}.${field.name.value}`,
                external: isExternal(arg),
              });
            }
          }
        }

        if ("values" in definition) {
          for (const value of definition.values ?? []) {
            children.push({
              name: value.name.value,
              external: false,
            });
          }
        }

        typesMissingInSupergraph.push({
          name: typeName,
          isLeaf:
            definition.kind === Kind.SCALAR_TYPE_DEFINITION ||
            definition.kind === Kind.UNION_TYPE_DEFINITION,
          children,
        });
        break;
      }
    }
  }

  return {
    name,
    localRootTypeNames,
    rootQueryDefinition:
      firstRootQueryNode?.kind === Kind.OBJECT_TYPE_DEFINITION
        ? firstRootQueryNode
        : null,
    fieldsOfExternalTypes,
    typesMissingInSupergraph,
  };
}


function hasInaccessibleFlag(
  element: object,
): element is { inaccessible: boolean } {
  return "inaccessible" in element;
}
