import {
  ASTNode,
  DirectiveDefinitionNode,
  DocumentNode,
  GraphQLError,
  InterfaceTypeDefinitionNode,
  InterfaceTypeExtensionNode,
  isTypeDefinitionNode,
  Kind,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  parse,
  specifiedScalarTypes,
  TypeDefinitionNode,
  TypeExtensionNode,
  TypeNode,
  UnionTypeDefinitionNode,
  UnionTypeExtensionNode,
  ValueNode,
  visit,
} from "graphql";
import { TypeNodeInfo } from "../../graphql/type-node-info.js";
import {
  createSpecSchema,
  FederationVersion,
} from "../../specifications/federation.js";
import { LinkImport, sdl as linkSpecSdl } from "../../specifications/link.js";
import { stripTypeModifiers } from "../../utils/state.js";
import { satisfiesVersionRange } from "../../utils/version.js";
import { TypeKind, type SubgraphStateBuilder } from "../state.js";

const linkSpec = parse(linkSpecSdl);
const linkSpecDirectives = linkSpec.definitions.filter(
  (def): def is DirectiveDefinitionNode =>
    def.kind === Kind.DIRECTIVE_DEFINITION,
);
const linkSpecTypes = linkSpec.definitions.filter(isTypeDefinitionNode);

export type SubgraphValidationContext = ReturnType<
  typeof createSubgraphValidationContext
>;
export type SimpleValidationContext = ReturnType<
  typeof createSimpleValidationContext
>;

export function createSimpleValidationContext(
  typeDefs: DocumentNode,
  typeNodeInfo: TypeNodeInfo,
) {
  let reportedErrors: GraphQLError[] = [];

  const directiveDefinitionMap = new Map<string, DirectiveDefinitionNode>();
  const typeDefinitionMap = new Map<
    string,
    Pick<TypeDefinitionNode | TypeExtensionNode, "name" | "kind">
  >();

  for (const definition of typeDefs.definitions) {
    if (definition.kind === Kind.DIRECTIVE_DEFINITION) {
      directiveDefinitionMap.set(definition.name.value, definition);
    } else if (
      "name" in definition &&
      definition.name &&
      definition.name.kind === Kind.NAME
    ) {
      // TODO: What if we have a type extension (or many) and a type definition with the same name?
      typeDefinitionMap.set(definition.name.value, {
        name: definition.name,
        kind: definition.kind as any,
      });
    }
  }

  return {
    getDocument() {
      return typeDefs;
    },
    getKnownDirectiveDefinition(name: string) {
      return directiveDefinitionMap.get(name);
    },
    getKnownTypeDefinition(name: string) {
      return typeDefinitionMap.get(name);
    },
    getSchemaCoordinate(ancestors: readonly (ASTNode | readonly ASTNode[])[]) {
      let coordinate = "";
      for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];

        if ("kind" in ancestor && ancestor.kind !== Kind.DOCUMENT) {
          const name =
            ancestor.kind === Kind.SCHEMA_DEFINITION ||
            ancestor.kind === Kind.SCHEMA_EXTENSION
              ? "schema"
              : "name" in ancestor && ancestor.name
                ? ancestor.name.value
                : "";
          if (coordinate.length > 0) {
            coordinate = coordinate + "." + name;
          } else {
            coordinate = name;
          }
        }
      }

      return coordinate;
    },
    reportError(error: GraphQLError) {
      reportedErrors.push(error);
    },
    collectReportedErrors() {
      const errors = reportedErrors;

      reportedErrors = [];

      return errors;
    },
  };
}

export function createSubgraphValidationContext(
  subgraph: {
    name: string;
    id: string;
    typeDefs: DocumentNode;
  },
  federation: {
    version: FederationVersion;
    imports: readonly LinkImport[];
  },
  typeNodeInfo: TypeNodeInfo,
  stateBuilder: SubgraphStateBuilder,
) {
  const { version, imports } = federation;

  // Directives and types available to a subgraph
  const availableSpec = createSpecSchema(version, imports);
  // Directives and types available in the spec (some parts may not be available to a subgraph)
  const knownSpec = createSpecSchema(version);
  // Normalize directive argument values before anything below reads the document:
  // the maps built here hold references to its nodes, so `subgraph.typeDefs` must
  // not be rewritten after this point.
  subgraph.typeDefs = coerceDirectiveArgumentValues(
    subgraph.typeDefs,
    availableSpec.directives,
    imports,
  );
  // Object and interface types defined in a subgraph
  const knownObjectAndInterfaceSubgraphEntities = new Map<
    string,
    | ObjectTypeDefinitionNode
    | ObjectTypeExtensionNode
    | InterfaceTypeDefinitionNode
    | InterfaceTypeExtensionNode
  >();
  const knownUnionTypesMembers = new Map<string, Set<string>>();

  const typenameToKind = new Map<
    string,
    TypeKind.OBJECT | TypeKind.INTERFACE
  >();

  const objectOrInterfaceKinds = [
    Kind.OBJECT_TYPE_DEFINITION,
    Kind.OBJECT_TYPE_EXTENSION,
    Kind.INTERFACE_TYPE_DEFINITION,
    Kind.INTERFACE_TYPE_EXTENSION,
  ];

  function isObjectOrInterfaceNode(
    node: ASTNode,
  ): node is
    | ObjectTypeDefinitionNode
    | ObjectTypeExtensionNode
    | InterfaceTypeDefinitionNode
    | InterfaceTypeExtensionNode {
    return objectOrInterfaceKinds.includes(node.kind);
  }

  function isUnionNode(
    node: ASTNode,
  ): node is UnionTypeDefinitionNode | UnionTypeExtensionNode {
    return (
      node.kind === Kind.UNION_TYPE_EXTENSION ||
      node.kind === Kind.UNION_TYPE_DEFINITION
    );
  }

  for (const def of subgraph.typeDefs.definitions) {
    if (isUnionNode(def)) {
      const found = knownUnionTypesMembers.get(def.name.value);

      if (!found) {
        knownUnionTypesMembers.set(
          def.name.value,
          new Set(def.types?.map((type) => type.name.value)),
        );
        continue;
      }

      def.types?.forEach((namedType) => {
        found.add(namedType.name.value);
      });

      continue;
    }

    if (!isObjectOrInterfaceNode(def)) {
      continue;
    }

    typenameToKind.set(
      def.name.value,
      def.kind === Kind.OBJECT_TYPE_DEFINITION ||
        def.kind === Kind.OBJECT_TYPE_EXTENSION
        ? TypeKind.OBJECT
        : TypeKind.INTERFACE,
    );

    const found = knownObjectAndInterfaceSubgraphEntities.get(def.name.value);

    if (!found) {
      knownObjectAndInterfaceSubgraphEntities.set(def.name.value, { ...def });
      continue;
    }

    (found as any).fields = (found.fields ?? []).concat(def.fields ?? []);
    (found as any).interfaces = (found.interfaces ?? []).concat(
      def.interfaces ?? [],
    );
    (found as any).directives = (found.directives ?? []).concat(
      def.directives ?? [],
    );

    if (
      def.kind === Kind.OBJECT_TYPE_DEFINITION &&
      found.kind === Kind.OBJECT_TYPE_EXTENSION
    ) {
      (found as any).kind = Kind.OBJECT_TYPE_DEFINITION;
    } else if (
      def.kind === Kind.INTERFACE_TYPE_DEFINITION &&
      found.kind === Kind.INTERFACE_TYPE_EXTENSION
    ) {
      (found as any).kind = Kind.INTERFACE_TYPE_DEFINITION;
    }
  }

  // Directive definitions defined in a subgraph
  const knownSubgraphDirectiveDefinitions = new Map(
    (
      subgraph.typeDefs.definitions.filter(
        (def) => def.kind === Kind.DIRECTIVE_DEFINITION,
      ) as DirectiveDefinitionNode[]
    ).map((def) => [def.name.value, def]),
  );

  const leafTypeNames = new Set<string>(
    specifiedScalarTypes.map((type) => type.name),
  );

  for (const def of subgraph.typeDefs.definitions) {
    if (
      def.kind === Kind.SCALAR_TYPE_DEFINITION ||
      def.kind === Kind.SCALAR_TYPE_EXTENSION ||
      def.kind === Kind.ENUM_TYPE_DEFINITION ||
      def.kind === Kind.ENUM_TYPE_EXTENSION
    ) {
      leafTypeNames.add(def.name.value);
    }
  }

  let reportedErrors: GraphQLError[] = [];

  const markedAsExternal = new Set<string>();
  const markedAsUsed = new Set<string>();
  const markedAsKeyField = new Set<string>();
  const overwrittenFederationDefinitionNames = new Set<string>();

  // Build a map where the original name points to alternative names.
  //
  // For example, the `key` is the original name of @key directive
  // but it can be available under different names:
  //  - federation__key might be available (federation__* directives are available by default in v2)
  //  - primaryKey when -> @link(url: "https://specs.apollo.dev/federation/v2.0" import: [{ name: "@key", as: "@primaryKey" }])
  //
  // Whenever we want to detect or get the @key directive, we use the "normalized" form instead of looking for @federation__key or @key or @whatever.
  // That's why we need this map, to take the normalized name and find the available one.
  const directiveAlternativeNamesMap = new Map<string, Set<string>>();
  for (const specDirective of availableSpec.directives) {
    const isFederationPrefixed =
      specDirective.name.value.startsWith("federation__");

    if (isFederationPrefixed) {
      const normalizedName = specDirective.name.value.replace(
        "federation__",
        "",
      );
      const setOfNames = directiveAlternativeNamesMap.get(normalizedName);

      if (!setOfNames) {
        directiveAlternativeNamesMap.set(
          normalizedName,
          new Set([specDirective.name.value]),
        );
      }
    } else {
      // TODO: get rid of `@` prefix in directive names of link.imports
      const { alias } = imports.find(
        (i) => i.name.replace(/^@/, "") === specDirective.name.value,
      ) ?? {
        alias: undefined,
      };

      let setOfNames = directiveAlternativeNamesMap.get(
        specDirective.name.value,
      );

      if (!setOfNames) {
        directiveAlternativeNamesMap.set(specDirective.name.value, new Set());
        setOfNames = directiveAlternativeNamesMap.get(
          specDirective.name.value,
        )!;
      }

      setOfNames.add(
        alias ? alias.replace(/^@/, "") : specDirective.name.value,
      );
      setOfNames.add(`federation__${specDirective.name.value}`);
    }
  }

  // Same story as in `directiveAlternativeNamesMap`.
  const typeAlternativeNamesMap = new Map<string, Set<string>>();
  for (const specType of availableSpec.types) {
    const isFederationPrefixed = specType.name.value.startsWith("federation__");

    if (isFederationPrefixed) {
      const normalizedName = specType.name.value.replace("federation__", "");
      const setOfNames = typeAlternativeNamesMap.get(normalizedName);

      if (!setOfNames) {
        typeAlternativeNamesMap.set(
          normalizedName,
          new Set([specType.name.value]),
        );
      }
    } else {
      const { alias } = imports.find((i) => i.name === specType.name.value) ?? {
        alias: undefined,
      };

      let setOfNames = typeAlternativeNamesMap.get(specType.name.value);

      if (!setOfNames) {
        typeAlternativeNamesMap.set(specType.name.value, new Set());
        setOfNames = typeAlternativeNamesMap.get(specType.name.value)!;
      }

      setOfNames.add(alias ? alias : specType.name.value);
      setOfNames.add(`federation__${specType.name.value}`);
    }
  }

  const importedTypesSet = new Set(
    availableSpec.types.map((t) => t.name.value),
  );
  if (importedTypesSet.size) {
    subgraph.typeDefs.definitions.forEach((def) => {
      if ("name" in def && def.name && importedTypesSet.has(def.name.value)) {
        overwrittenFederationDefinitionNames.add(def.name.value);
      }
    });
  }

  return {
    stateBuilder,
    federationImports: imports,
    isLinkSpecDirective(name: string) {
      return linkSpecDirectives.some((d) => d.name.value === name);
    },
    isLinkSpecType(name: string) {
      return linkSpecTypes.some((t) => t.name.value === name);
    },
    /**
     * Check if a type is available to the subgraph (either imported directly or available out of the box).
     */
    isAvailableFederationType(name: string) {
      const alternativeNames = typeAlternativeNamesMap.get(name);

      if (alternativeNames) {
        return alternativeNames.has(name);
      }

      return false;
    },
    /**
     * Check if a directive is available to the subgraph (either imported directly or available out of the box).
     */
    isAvailableFederationDirective(
      specDirectiveName: string,
      directiveNode: {
        name:
          | {
              value: string;
            }
          | string;
      },
    ) {
      const alternativeNames =
        directiveAlternativeNamesMap.get(specDirectiveName);

      if (alternativeNames) {
        return alternativeNames.has(
          typeof directiveNode.name === "string"
            ? directiveNode.name
            : directiveNode.name.value,
        );
      }

      return false;
    },
    satisfiesVersionRange(range: `${"<" | ">=" | ">"} ${FederationVersion}`) {
      return satisfiesVersionRange(version, range);
    },
    /**
     * Get a list of directives defined by the spec.
     * These directives may or may not be available to a subgraph.
     */
    getKnownFederationDirectives() {
      return knownSpec.directives;
    },
    /**
     * Get a list of directives defined by the spec and available to a subgraph.
     */
    getAvailableFederationDirectives() {
      return availableSpec.directives;
    },
    isLeafType(typeName: string) {
      return leafTypeNames.has(typeName);
    },
    /**
     * Get a list of object and interface types defined by a subgraph.
     */
    getSubgraphObjectOrInterfaceTypes() {
      return knownObjectAndInterfaceSubgraphEntities;
    },
    /**
     * Get a list of union types defined within the subgraphs.
     */
    getSubgraphUnionTypes() {
      return knownUnionTypesMembers;
    },
    /**
     * Get a list of directives defined by a subgraph.
     */
    getSubgraphDirectiveDefinitions() {
      return knownSubgraphDirectiveDefinitions;
    },
    /**
     * Get a list of Federation directives and type definitions available to a subgraph.
     */
    getAvailableFederationTypeAndDirectiveDefinitions() {
      return ([] as Array<TypeDefinitionNode | DirectiveDefinitionNode>).concat(
        availableSpec.directives.map((d) => {
          const alias = imports.find(
            (i) => i.name.replace(/^@/, "") === d.name.value,
          )?.alias;

          if (alias) {
            (d.name as any).value = alias.replace(/^@/, "");
          }

          return d;
        }),
        availableSpec.types.map((t) => {
          const alias = imports.find((i) => i.name === t.name.value)?.alias;

          if (alias) {
            (t.name as any).value = alias;
          }

          return t;
        }),
      );
    },
    typeNodeInfo,
    getDocument() {
      return subgraph.typeDefs;
    },
    getSubgraphName() {
      return subgraph.name;
    },
    getSubgraphId() {
      return subgraph.id;
    },
    markAsExternal(coordinate: string) {
      markedAsExternal.add(coordinate);
    },
    getFieldsToMarkAsShareable() {
      const shareableFields: Array<{
        typeName: string;
        fieldName: string;
      }> = [];

      for (const coordinate of markedAsKeyField) {
        const [typeName, fieldName] = coordinate.split(".");

        if (typenameToKind.get(typeName) === TypeKind.OBJECT) {
          shareableFields.push({ typeName, fieldName });
        }
      }

      return shareableFields;
    },
    markAsUsed(
      reason: "fields" | "@extends" | "references @shareable",
      kind:
        | Kind.OBJECT_TYPE_DEFINITION
        | Kind.INTERFACE_TYPE_DEFINITION
        | Kind.OBJECT_TYPE_EXTENSION
        | Kind.INTERFACE_TYPE_EXTENSION,
      typeName: string,
      fieldName: string,
    ) {
      if (
        !fieldName.startsWith("__") &&
        !typeName.startsWith("__") &&
        reason === "fields"
      ) {
        switch (kind) {
          case Kind.OBJECT_TYPE_DEFINITION:
          case Kind.OBJECT_TYPE_EXTENSION: {
            stateBuilder.objectType.field.setUsed(typeName, fieldName);
            break;
          }
          case Kind.INTERFACE_TYPE_DEFINITION:
          case Kind.INTERFACE_TYPE_EXTENSION: {
            stateBuilder.interfaceType.field.setUsed(typeName, fieldName);
            break;
          }
        }
      }

      markedAsUsed.add(`${typeName}.${fieldName}`);
    },
    markAsKeyField(coordinate: string) {
      markedAsKeyField.add(coordinate);
    },

    /**
     * Let the system know that there's a correct replacement of a Federation's directive or scalar.
     * Subgraph can define its own @key directive or any other Federation v2 bit.
     */
    markAsFederationDefinitionReplacement(name: string) {
      overwrittenFederationDefinitionNames.add(name);
    },
    /**
     * If a subgraph defined its own @key directive or FieldSet scalar, here's a list of them, a list of names.
     */
    collectFederationDefinitionReplacements() {
      return overwrittenFederationDefinitionNames;
    },
    collectUnusedExternal() {
      if (version === "v1.0") {
        return Array.from(markedAsExternal).filter(
          (c) => !markedAsUsed.has(c) && markedAsKeyField.has(c),
        );
      }

      const unused = Array.from(markedAsExternal).filter(
        (c) => !markedAsUsed.has(c),
      );

      return unused.filter((coordinate) => {
        const [typeName, fieldName] = coordinate.split(".");

        const typeDef = stateBuilder.state.types.get(typeName);

        if (!typeDef) {
          return true;
        }

        if (
          typeDef.kind === TypeKind.OBJECT &&
          !stateBuilder.isInterfaceObject(typeName)
        ) {
          const fieldDef = typeDef.fields.get(fieldName);

          if (fieldDef) {
            const outputTypeName = stripTypeModifiers(fieldDef.type);
            const outputType = stateBuilder.state.types.get(outputTypeName);

            if (outputType?.kind === TypeKind.OBJECT && outputType.shareable) {
              // If a field is marked as @external but the output type is @shareable, it should not be marked as unused.
              return false;
            }
          }

          for (const interfaceName of typeDef.interfaces) {
            const iDef = stateBuilder.state.types.get(interfaceName);

            if (!iDef) {
              continue;
            }

            if (
              iDef.kind === TypeKind.INTERFACE &&
              iDef.fields.has(fieldName)
            ) {
              if (iDef.fields.has(fieldName)) {
                return false;
              }
            }
          }
        }

        return true;
      });
    },
    reportError(error: GraphQLError) {
      reportedErrors.push(error);
    },
    collectReportedErrors() {
      const errors = reportedErrors;

      reportedErrors = [];

      return errors;
    },
  };
}

/**
 * Apollo is lenient about the shape of directive argument values: it accepts an
 * unquoted, enum-like value where the argument is declared as `String` or `ID`
 * (`@tag(name: Public)`) and a quoted string where the argument is declared as
 * an enum (`@link(for: "EXECUTION")`, as long as the enum has that value).
 * Rewriting those up front keeps the rest of the pipeline (validation and the
 * supergraph SDL) seeing the expected value.
 */
// Directives only sit on definitions and on the fields, arguments and enum
// values within them, so the coercion walks just those, not names or types.
const directiveHolderKeys = Object.fromEntries(
  Object.values(Kind).map((kind) => [
    kind,
    kind === Kind.DOCUMENT
      ? ["definitions"]
      : ["directives", "fields", "arguments", "values"],
  ]),
) as Parameters<typeof visit>[2];

function coerceDirectiveArgumentValues(
  typeDefs: DocumentNode,
  specDirectives: ReadonlyArray<DirectiveDefinitionNode>,
  imports: readonly LinkImport[],
): DocumentNode {
  // `@link(import: [{ name: "@tag", as: "@mytag" }])` renames a spec directive.
  // The alias is applied as a key here, not to the (shared) spec nodes.
  const aliases = new Map<string, string>();
  for (const i of imports) {
    if (i.alias) {
      aliases.set(i.name.replace(/^@/, ""), i.alias.replace(/^@/, ""));
    }
  }

  const directiveDefinitions = new Map<string, DirectiveDefinitionNode>();
  for (const def of specDirectives) {
    directiveDefinitions.set(
      aliases.get(def.name.value) ?? def.name.value,
      def,
    );
  }

  // The federation spec has no enums, so they come from the link spec and the
  // subgraph, whose own definitions take precedence over the spec's.
  const enumValues = new Map<string, Set<string>>();
  for (const def of linkSpec.definitions.concat(typeDefs.definitions)) {
    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
      directiveDefinitions.set(def.name.value, def);
    } else if (
      def.kind === Kind.ENUM_TYPE_DEFINITION ||
      def.kind === Kind.ENUM_TYPE_EXTENSION
    ) {
      const values = enumValues.get(def.name.value) ?? new Set<string>();
      enumValues.set(def.name.value, values);
      for (const value of def.values ?? []) {
        values.add(value.name.value);
      }
    }
  }

  return visit(
    typeDefs,
    {
      Directive(node) {
        const definition = directiveDefinitions.get(node.name.value);
        const args = node.arguments?.map((arg) => {
          const argDefinition = definition?.arguments?.find(
            (a) => a.name.value === arg.name.value,
          );

          if (
            !argDefinition ||
            // `@link(url:)` and `@link(as:)` are read before this runs, to work
            // out which spec the subgraph uses, so they have to stay strict.
            (node.name.value === "link" &&
              (arg.name.value === "url" || arg.name.value === "as"))
          ) {
            return arg;
          }

          const value = coerceValue(argDefinition.type, arg.value, enumValues);
          return value === arg.value ? arg : { ...arg, value };
        });

        // Keep the node when nothing changed, so the document is not rebuilt, and
        // skip its arguments either way, since they cannot hold a directive.
        return args?.some((arg, i) => arg !== node.arguments![i])
          ? { ...node, arguments: args }
          : false;
      },
    },
    directiveHolderKeys,
  );
}

function coerceValue(
  type: TypeNode,
  value: ValueNode,
  enumValues: Map<string, Set<string>>,
): ValueNode {
  switch (type.kind) {
    case Kind.NON_NULL_TYPE:
      return coerceValue(type.type, value, enumValues);
    case Kind.LIST_TYPE: {
      if (value.kind !== Kind.LIST) {
        return coerceValue(type.type, value, enumValues);
      }

      const values = value.values.map((item) =>
        coerceValue(type.type, item, enumValues),
      );

      return values.some((item, i) => item !== value.values[i])
        ? { ...value, values }
        : value;
    }
    case Kind.NAMED_TYPE:
      if (
        value.kind === Kind.ENUM &&
        (type.name.value === "String" || type.name.value === "ID")
      ) {
        return { kind: Kind.STRING, value: value.value, loc: value.loc };
      }

      if (
        value.kind === Kind.STRING &&
        enumValues.get(type.name.value)?.has(value.value)
      ) {
        return { kind: Kind.ENUM, value: value.value, loc: value.loc };
      }

      return value;
  }
}
