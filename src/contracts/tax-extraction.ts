import {
  type ConstDirectiveNode,
  type DirectiveNode,
  type DocumentNode,
  type EnumTypeDefinitionNode,
  type EnumTypeExtensionNode,
  type EnumValueDefinitionNode,
  type FieldDefinitionNode,
  type InputObjectTypeDefinitionNode,
  type InputObjectTypeExtensionNode,
  type InputValueDefinitionNode,
  type InterfaceTypeDefinitionNode,
  type InterfaceTypeExtensionNode,
  Kind,
  type NameNode,
  type ObjectTypeDefinitionNode,
  type ObjectTypeExtensionNode,
  type ScalarTypeDefinitionNode,
  type UnionTypeDefinitionNode,
  visit,
} from "graphql";
import { extractLinkImplementations } from "../utils/link/index.js";

type TagExtractionStrategy = (directiveNode: DirectiveNode) => string | null;

function createTransformTagDirectives(
  tagDirectiveName: string,
  inaccessibleDirectiveName: string,
) {
  return function transformTagDirectives(
    node: { directives?: readonly ConstDirectiveNode[] },
    /** if non-null, will add the inaccessible directive to the nodes directive if not already present. */
    includeInaccessibleDirective: boolean = false,
  ): readonly ConstDirectiveNode[] {
    let hasInaccessibleDirective = false;
    const directives =
      node.directives?.filter((directive) => {
        if (directive.name.value === inaccessibleDirectiveName) {
          hasInaccessibleDirective = true;
        }
        return directive.name.value !== tagDirectiveName;
      }) ?? [];

    if (hasInaccessibleDirective === false && includeInaccessibleDirective) {
      directives.push({
        kind: Kind.DIRECTIVE,
        name: {
          kind: Kind.NAME,
          value: inaccessibleDirectiveName,
        },
      });
    }

    return directives;
  };
}

function makeTypesFromSetInaccessible(
  documentNode: DocumentNode,
  types: Set<string>,
  transformTagDirectives: ReturnType<typeof createTransformTagDirectives>,
) {
  /** We can only apply `@inaccessible` once on each unique typename, otherwise we get a composition error */
  const alreadyAppliedOnTypeNames = new Set<string>();
  function typeHandler(
    node:
      | ObjectTypeExtensionNode
      | ObjectTypeDefinitionNode
      | InterfaceTypeDefinitionNode
      | InterfaceTypeExtensionNode
      | InputObjectTypeDefinitionNode
      | InputObjectTypeExtensionNode
      | EnumTypeDefinitionNode
      | EnumTypeExtensionNode,
  ) {
    if (
      types.has(node.name.value) === false ||
      alreadyAppliedOnTypeNames.has(node.name.value)
    ) {
      return;
    }
    alreadyAppliedOnTypeNames.add(node.name.value);
    return {
      ...node,
      directives: transformTagDirectives(node, true),
    };
  }

  return visit(documentNode, {
    [Kind.OBJECT_TYPE_DEFINITION]: typeHandler,
    [Kind.OBJECT_TYPE_EXTENSION]: typeHandler,
    [Kind.INTERFACE_TYPE_DEFINITION]: typeHandler,
    [Kind.INTERFACE_TYPE_EXTENSION]: typeHandler,
    [Kind.INPUT_OBJECT_TYPE_DEFINITION]: typeHandler,
    [Kind.INPUT_OBJECT_TYPE_EXTENSION]: typeHandler,
    [Kind.ENUM_TYPE_DEFINITION]: typeHandler,
    [Kind.ENUM_TYPE_EXTENSION]: typeHandler,
  });
}

function collectTagsBySchemaCoordinateFromSubgraph(
  documentNode: DocumentNode,
  /** This map will be populated with values. */
  map: SchemaCoordinateToTagsRegistry,
  /** This map will be populated with values. */
  subcoordinatesPerType: SubcoordinatesPerType,
): void {
  const { resolveImportName } = extractLinkImplementations(documentNode);
  const tagDirectiveName = resolveImportName(
    "https://specs.apollo.dev/federation",
    "@tag",
  );
  const extractTag = createTagDirectiveNameExtractionStrategy(tagDirectiveName);

  function addTypeFields(typeName: string, fields: Set<string>) {
    let typeFields = subcoordinatesPerType.get(typeName);
    if (typeFields === undefined) {
      typeFields = new Set();
      subcoordinatesPerType.set(typeName, typeFields);
    }
    for (const value of fields) {
      typeFields.add(value);
    }
  }

  function addTagsPerSchemaCoordinate(
    schemaCoordinate: string,
    tagValues: Set<string> | undefined,
  ) {
    if (tagValues === undefined) {
      return;
    }

    let values = map.get(schemaCoordinate);
    if (values === undefined) {
      values = new Set();
      map.set(schemaCoordinate, values);
    }
    for (const tagValue of tagValues) {
      values.add(tagValue);
    }
  }

  function getTagsForNode(node: {
    directives?: readonly ConstDirectiveNode[];
  }): Set<string> | undefined {
    const tags = new Set<string>();
    node.directives?.forEach((directiveNode) => {
      const tagValue = extractTag(directiveNode);
      if (tagValue === null) {
        return;
      }
      tags.add(tagValue);
    });
    if (tags.size === 0) {
      return undefined;
    }
    return tags;
  }

  function TypeDefinitionHandler(node: {
    name: NameNode;
    directives?: readonly ConstDirectiveNode[];
    fields?:
      | readonly FieldDefinitionNode[]
      | readonly InputValueDefinitionNode[];
    values?: readonly EnumValueDefinitionNode[];
  }) {
    const tagValues = getTagsForNode(node);
    addTagsPerSchemaCoordinate(node.name.value, tagValues);

    const subCoordinates = new Set<string>();

    node.fields?.forEach((fieldNode) => {
      const schemaCoordinate = `${node.name.value}.${fieldNode.name.value}`;
      subCoordinates.add(schemaCoordinate);

      const tagValues = getTagsForNode(fieldNode);
      addTagsPerSchemaCoordinate(schemaCoordinate, tagValues);

      if ("arguments" in fieldNode) {
        fieldNode.arguments?.forEach((argumentNode) => {
          const schemaCoordinate = `${node.name.value}.${fieldNode.name.value}(${argumentNode.name.value}:)`;
          subCoordinates.add(schemaCoordinate);

          const tagValues = getTagsForNode(argumentNode);
          addTagsPerSchemaCoordinate(schemaCoordinate, tagValues);
        });
      }
    });
    node.values?.forEach((valueNode) => {
      const schemaCoordinate = `${node.name.value}.${valueNode.name.value}`;
      subCoordinates.add(schemaCoordinate);

      const tagValues = getTagsForNode(valueNode);
      addTagsPerSchemaCoordinate(schemaCoordinate, tagValues);
    });

    addTypeFields(node.name.value, subCoordinates);

    return false;
  }

  visit(documentNode, {
    ScalarTypeDefinition: TypeDefinitionHandler,
    ScalarTypeExtension: TypeDefinitionHandler,
    UnionTypeDefinition: TypeDefinitionHandler,
    UnionTypeExtension: TypeDefinitionHandler,
    ObjectTypeDefinition: TypeDefinitionHandler,
    ObjectTypeExtension: TypeDefinitionHandler,
    InterfaceTypeDefinition: TypeDefinitionHandler,
    InterfaceTypeExtension: TypeDefinitionHandler,
    InputObjectTypeDefinition: TypeDefinitionHandler,
    InputObjectTypeExtension: TypeDefinitionHandler,
    EnumTypeDefinition: TypeDefinitionHandler,
    EnumTypeExtension: TypeDefinitionHandler,
  });
}

type SchemaCoordinateToTagsRegistry = Map<
  /* schema coordinate */ string,
  /* tag list */ Set<string>
>;

type SubcoordinatesPerType = Map<
  /* type name */ string,
  /* schema coordinates */ Set<string>
>;

/**
 * Get a map with tags per schema coordinates in all subgraphs.
 */
export function buildSchemaCoordinateTagRegister(
  documentNodes: Array<DocumentNode>,
): SchemaCoordinateToTagsRegistry {
  const schemaCoordinatesToTags: SchemaCoordinateToTagsRegistry = new Map();
  const subcoordinatesPerType: SubcoordinatesPerType = new Map();

  documentNodes.forEach((documentNode) =>
    collectTagsBySchemaCoordinateFromSubgraph(
      documentNode,
      schemaCoordinatesToTags,
      subcoordinatesPerType,
    ),
  );

  // The tags of a type are inherited by it's fields and field arguments
  for (const [typeName, subCoordinates] of subcoordinatesPerType) {
    const tags = schemaCoordinatesToTags.get(typeName);
    if (tags === undefined) {
      continue;
    }

    for (const subCoordinate of subCoordinates) {
      let subcoordinateTags = schemaCoordinatesToTags.get(subCoordinate);
      if (!subcoordinateTags) {
        subcoordinateTags = new Set();
        schemaCoordinatesToTags.set(subCoordinate, subcoordinateTags);
      }
      for (const tag of tags) {
        subcoordinateTags.add(tag);
      }
    }
  }

  return schemaCoordinatesToTags;
}

function getRootQueryTypeNameFromDocumentNode(document: DocumentNode) {
  let queryName: string | null = "Query";

  for (const definition of document.definitions) {
    if (
      definition.kind === Kind.SCHEMA_DEFINITION ||
      definition.kind === Kind.SCHEMA_EXTENSION
    ) {
      for (const operationTypeDefinition of definition.operationTypes ?? []) {
        if (operationTypeDefinition.operation === "query") {
          queryName = operationTypeDefinition.type.name.value;
        }
      }
    }
  }

  return queryName;
}

/** check whether two sets have an intersection with each other. */
function hasIntersection<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size === 0 || b.size === 0) {
    return false;
  }
  for (const item of a) {
    if (b.has(item)) {
      return true;
    }
  }
  return false;
}

function difference<$Type>(set1: Set<$Type>, set2: Set<$Type>): Set<$Type> {
  const result = new Set<$Type>();
  set1.forEach((item) => {
    if (!set2.has(item)) {
      result.add(item);
    }
  });
  return result;
}

type ObjectLikeNode =
  | ObjectTypeExtensionNode
  | ObjectTypeDefinitionNode
  | InterfaceTypeDefinitionNode
  | InterfaceTypeExtensionNode
  | InputObjectTypeDefinitionNode
  | InputObjectTypeExtensionNode;

/**
 * Takes a subgraph document node and a set of tag filters and transforms the document node to contain `@inaccessible` directives on all fields not included by the applied filter.
 * Note: you probably want to use `filterSubgraphs` instead, as it also applies the correct post step required after applying this.
 */
export function applyTagFilterToInaccessibleTransformOnSubgraphSchema(
  documentNode: DocumentNode,
  tagRegister: SchemaCoordinateToTagsRegistry,
  filter: Federation2SubgraphDocumentNodeByTagsFilter,
): {
  typeDefs: DocumentNode;
  /** Types within THIS subgraph where all fields are inaccessible */
  typesWithAllFieldsInaccessible: Map<string, boolean>;
  transformTagDirectives: ReturnType<typeof createTransformTagDirectives>;
  /** Types in this subgraph that have the inaccessible directive applied */
  typesWithInaccessibleApplied: Set<string>;
} {
  const { resolveImportName } = extractLinkImplementations(documentNode);
  const inaccessibleDirectiveName = resolveImportName(
    "https://specs.apollo.dev/federation",
    "@inaccessible",
  );
  const tagDirectiveName = resolveImportName(
    "https://specs.apollo.dev/federation",
    "@tag",
  );
  const externalDirectiveName = resolveImportName(
    "https://specs.apollo.dev/federation",
    "@external",
  );

  function getTagsForSchemaCoordinate(coordinate: string) {
    return tagRegister.get(coordinate) ?? new Set();
  }

  const transformTagDirectives = createTransformTagDirectives(
    tagDirectiveName,
    inaccessibleDirectiveName,
  );
  const rootQueryTypeName = getRootQueryTypeNameFromDocumentNode(documentNode);

  const typesWithAllFieldsInaccessibleTracker = new Map<string, boolean>();

  function onAllFieldsInaccessible(name: string) {
    const current = typesWithAllFieldsInaccessibleTracker.get(name);
    if (current === undefined) {
      typesWithAllFieldsInaccessibleTracker.set(name, true);
    }
  }

  function onSomeFieldsAccessible(name: string) {
    typesWithAllFieldsInaccessibleTracker.set(name, false);
  }

  function fieldArgumentHandler(
    objectLikeNode: ObjectLikeNode,
    fieldLikeNode: InputValueDefinitionNode | FieldDefinitionNode,
    node: InputValueDefinitionNode,
  ) {
    // Check for external tag because we cannot contribute directives to external fields.
    if (node.directives?.find((d) => d.name.value === externalDirectiveName)) {
      return node;
    }

    const tagsOnNode = getTagsForSchemaCoordinate(
      `${objectLikeNode.name.value}.${fieldLikeNode.name.value}(${node.name.value}:)`,
    );

    if (
      (filter.include.size && !hasIntersection(tagsOnNode, filter.include)) ||
      (filter.exclude.size && hasIntersection(tagsOnNode, filter.exclude))
    ) {
      return {
        ...node,
        directives: transformTagDirectives(node, true),
      };
    }

    return {
      ...node,
      directives: transformTagDirectives(node),
    };
  }

  const definitionsBySchemaCoordinate = new Map<
    string,
    Array<ObjectLikeNode>
  >();

  //
  // A type can be defined multiple times within a subgraph and we need to find all implementations
  // for determining whether the full type, or only some fields are part of the public contract schema
  //
  for (const definition of documentNode.definitions) {
    switch (definition.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.OBJECT_TYPE_EXTENSION:
      case Kind.INTERFACE_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_EXTENSION:
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
      case Kind.INPUT_OBJECT_TYPE_EXTENSION: {
        let items = definitionsBySchemaCoordinate.get(definition.name.value);
        if (!items) {
          items = [];
          definitionsBySchemaCoordinate.set(definition.name.value, items);
        }
        items.push(definition);
      }
    }
  }

  // Tracking for which type already has `@inaccessible` applied (can only occur once)
  const typesWithInaccessibleApplied = new Set<string>();
  // These are later used within the visitor to actually replace the nodes.
  const replacementTypeNodes = new Map<ObjectLikeNode, ObjectLikeNode>();

  for (const [typeName, nodes] of definitionsBySchemaCoordinate) {
    /** After processing all nodes implementing a type, we know whether all or only some fields are inaccessible */
    let isSomeFieldsAccessible = false;

    for (const node of nodes) {
      const tagsOnNode = getTagsForSchemaCoordinate(node.name.value);

      let newNode = {
        ...node,
        fields: node.fields?.map((fieldNode) => {
          const tagsOnNode = getTagsForSchemaCoordinate(
            `${node.name.value}.${fieldNode.name.value}`,
          );

          if (fieldNode.kind === Kind.FIELD_DEFINITION) {
            fieldNode = {
              ...fieldNode,
              arguments: fieldNode.arguments?.map((argumentNode) =>
                fieldArgumentHandler(node, fieldNode, argumentNode),
              ),
            } as FieldDefinitionNode;
          }

          // Check for external tag because we cannot contribute directives to external fields.
          if (
            fieldNode.directives?.find(
              (d) => d.name.value === externalDirectiveName,
            )
          ) {
            return fieldNode;
          }

          if (
            (filter.include.size &&
              !hasIntersection(tagsOnNode, filter.include)) ||
            (filter.exclude.size && hasIntersection(tagsOnNode, filter.exclude))
          ) {
            return {
              ...fieldNode,
              directives: transformTagDirectives(fieldNode, true),
            };
          }

          isSomeFieldsAccessible = true;

          return {
            ...fieldNode,
            directives: transformTagDirectives(fieldNode),
          };
        }),
      } as ObjectLikeNode;

      if (filter.exclude.size && hasIntersection(tagsOnNode, filter.exclude)) {
        newNode = {
          ...newNode,
          directives: transformTagDirectives(
            node,
            typesWithInaccessibleApplied.has(typeName) ? false : true,
          ),
        } as ObjectLikeNode;
        typesWithInaccessibleApplied.add(typeName);
      } else {
        newNode = {
          ...newNode,
          directives: transformTagDirectives(node),
        };
      }

      replacementTypeNodes.set(node, newNode);
    }

    // If some fields are accessible, we continue with the next type
    if (isSomeFieldsAccessible) {
      onSomeFieldsAccessible(typeName);
      continue;
    }
    onAllFieldsInaccessible(typeName);
  }

  function fieldLikeObjectHandler(node: ObjectLikeNode) {
    const newNode = replacementTypeNodes.get(node);
    if (!newNode) {
      throw new Error(
        `Found type without transformation mapping. ${node.name.value} ${node.name.kind}`,
      );
    }

    return newNode;
  }

  function enumHandler(node: EnumTypeDefinitionNode | EnumTypeExtensionNode) {
    const tagsOnNode = getTagsForSchemaCoordinate(node.name.value);

    let isAllFieldsInaccessible = true;

    const newNode = {
      ...node,
      values: node.values?.map((valueNode) => {
        const tagsOnNode = getTagsForSchemaCoordinate(
          `${node.name.value}.${valueNode.name.value}`,
        );

        if (
          (filter.include.size &&
            !hasIntersection(tagsOnNode, filter.include)) ||
          (filter.exclude.size && hasIntersection(tagsOnNode, filter.exclude))
        ) {
          return {
            ...valueNode,
            directives: transformTagDirectives(valueNode, true),
          };
        }

        isAllFieldsInaccessible = false;

        return {
          ...valueNode,
          directives: transformTagDirectives(valueNode),
        };
      }),
    };

    if (filter.exclude.size && hasIntersection(tagsOnNode, filter.exclude)) {
      return {
        ...newNode,
        directives: transformTagDirectives(node, true),
      };
    }

    if (isAllFieldsInaccessible) {
      onAllFieldsInaccessible(node.name.value);
    } else {
      onSomeFieldsAccessible(node.name.value);
    }

    return {
      ...newNode,
      directives: transformTagDirectives(node),
    };
  }

  function scalarAndUnionHandler(
    node: ScalarTypeDefinitionNode | UnionTypeDefinitionNode,
  ) {
    const tagsOnNode = getTagsForSchemaCoordinate(node.name.value);

    if (
      (filter.include.size && !hasIntersection(tagsOnNode, filter.include)) ||
      (filter.exclude.size && hasIntersection(tagsOnNode, filter.exclude))
    ) {
      return {
        ...node,
        directives: transformTagDirectives(node, true),
      };
    }

    return {
      ...node,
      directives: transformTagDirectives(node),
    };
  }

  const typeDefs = visit(documentNode, {
    [Kind.OBJECT_TYPE_DEFINITION]: fieldLikeObjectHandler,
    [Kind.OBJECT_TYPE_EXTENSION]: fieldLikeObjectHandler,
    [Kind.INTERFACE_TYPE_DEFINITION]: fieldLikeObjectHandler,
    [Kind.INTERFACE_TYPE_EXTENSION]: fieldLikeObjectHandler,
    [Kind.INPUT_OBJECT_TYPE_DEFINITION]: fieldLikeObjectHandler,
    [Kind.INPUT_OBJECT_TYPE_EXTENSION]: fieldLikeObjectHandler,
    [Kind.ENUM_TYPE_DEFINITION]: enumHandler,
    [Kind.ENUM_TYPE_EXTENSION]: enumHandler,
    [Kind.SCALAR_TYPE_DEFINITION]: scalarAndUnionHandler,
    [Kind.UNION_TYPE_DEFINITION]: scalarAndUnionHandler,
  });

  typesWithAllFieldsInaccessibleTracker.delete(rootQueryTypeName);

  return {
    typeDefs,
    typesWithAllFieldsInaccessible: typesWithAllFieldsInaccessibleTracker,
    transformTagDirectives,
    typesWithInaccessibleApplied,
  };
}

/**
 * Apply a tag filter to a set of subgraphs.
 */
export function applyTagFilterOnSubgraphs<
  TType extends {
    typeDefs: DocumentNode;
    name: string;
  },
>(
  subgraphs: Array<TType>,
  filter: Federation2SubgraphDocumentNodeByTagsFilter,
): Array<TType> {
  // All combined @tag directive in all subgraphs per schema coordinate
  const tagRegister = buildSchemaCoordinateTagRegister(
    subgraphs.map((s) => s.typeDefs),
  );

  let filteredSubgraphs = subgraphs.map((subgraph) => {
    return {
      ...subgraph,
      ...applyTagFilterToInaccessibleTransformOnSubgraphSchema(
        subgraph.typeDefs,
        tagRegister,
        filter,
      ),
    };
  });

  const intersectionOfTypesWhereAllFieldsAreInaccessible = new Set<string>();
  // We need to traverse all subgraphs to find the intersection of types where all fields are inaccessible.
  // If a type is not present in any other subgraph, we can safely mark it as inaccessible.
  filteredSubgraphs.forEach((subgraph) => {
    const otherSubgraphs = filteredSubgraphs.filter((sub) => sub !== subgraph);

    for (const [
      type,
      allFieldsInaccessible,
    ] of subgraph.typesWithAllFieldsInaccessible) {
      if (
        allFieldsInaccessible &&
        otherSubgraphs.every(
          (sub) =>
            !sub.typesWithAllFieldsInaccessible.has(type) ||
            sub.typesWithAllFieldsInaccessible.get(type) === true,
        )
      ) {
        intersectionOfTypesWhereAllFieldsAreInaccessible.add(type);
      }
      // let's not visit this type a second time...
      otherSubgraphs.forEach((sub) => {
        sub.typesWithAllFieldsInaccessible.delete(type);
      });
    }
  });

  if (!intersectionOfTypesWhereAllFieldsAreInaccessible.size) {
    return filteredSubgraphs;
  }

  return filteredSubgraphs.map((subgraph) => ({
    ...subgraph,
    typeDefs: makeTypesFromSetInaccessible(
      subgraph.typeDefs,
      /** We exclude the types that are already marked as inaccessible within the subgraph as we want to avoid `@inaccessible` applied more than once. */
      difference(
        intersectionOfTypesWhereAllFieldsAreInaccessible,
        subgraph.typesWithInaccessibleApplied,
      ),
      subgraph.transformTagDirectives,
    ),
  }));
}

export function createTagDirectiveNameExtractionStrategy(
  directiveName: string,
): TagExtractionStrategy {
  return (directiveNode: DirectiveNode) => {
    if (
      directiveNode.name.value === directiveName &&
      directiveNode.arguments?.[0].name.value === "name" &&
      directiveNode.arguments?.[0]?.value.kind === Kind.STRING
    ) {
      return directiveNode.arguments[0].value.value ?? null;
    }
    return null;
  };
}

export type Federation2SubgraphDocumentNodeByTagsFilter = {
  include: Set<string>;
  exclude: Set<string>;
};
