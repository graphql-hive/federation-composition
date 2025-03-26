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
} from 'graphql';
import { TypeNodeInfo } from '../../graphql/type-node-info.js';
import { createSpecSchema, FederationVersion } from '../../specifications/federation.js';
import { LinkImport, sdl as linkSpecSdl } from '../../specifications/link.js';
import { stripTypeModifiers } from '../../utils/state.js';
import { satisfiesVersionRange } from '../../utils/version.js';
import { TypeKind, type SubgraphStateBuilder } from '../state.js';

const linkSpec = parse(linkSpecSdl);
const linkSpecDirectives = linkSpec.definitions.filter(
  (def): def is DirectiveDefinitionNode => def.kind === Kind.DIRECTIVE_DEFINITION,
);
const linkSpecTypes = linkSpec.definitions.filter(isTypeDefinitionNode);

export type SubgraphValidationContext = ReturnType<typeof createSubgraphValidationContext>;
export type SimpleValidationContext = ReturnType<typeof createSimpleValidationContext>;

export function createSimpleValidationContext(typeDefs: DocumentNode, typeNodeInfo: TypeNodeInfo) {
  let reportedErrors: GraphQLError[] = [];

  const directiveDefinitionMap = new Map<string, DirectiveDefinitionNode>();
  const typeDefinitionMap = new Map<
    string,
    Pick<TypeDefinitionNode | TypeExtensionNode, 'name' | 'kind'>
  >();

  for (const definition of typeDefs.definitions) {
    if (definition.kind === Kind.DIRECTIVE_DEFINITION) {
      directiveDefinitionMap.set(definition.name.value, definition);
    } else if ('name' in definition && definition.name && definition.name.kind === Kind.NAME) {
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
      let coordinate = '';
      for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];

        if ('kind' in ancestor && ancestor.kind !== Kind.DOCUMENT) {
          const name =
            ancestor.kind === Kind.SCHEMA_DEFINITION || ancestor.kind === Kind.SCHEMA_EXTENSION
              ? 'schema'
              : 'name' in ancestor && ancestor.name
                ? ancestor.name.value
                : '';
          if (coordinate.length > 0) {
            coordinate = coordinate + '.' + name;
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
  // Object and interface types defined in a subgraph
  const knownSubgraphEntities = new Map<
    string,
    | ObjectTypeDefinitionNode
    | ObjectTypeExtensionNode
    | InterfaceTypeDefinitionNode
    | InterfaceTypeExtensionNode
  >();

  //
  for (const def of subgraph.typeDefs.definitions.filter(
    def =>
      def.kind === Kind.OBJECT_TYPE_DEFINITION ||
      def.kind === Kind.OBJECT_TYPE_EXTENSION ||
      def.kind === Kind.INTERFACE_TYPE_DEFINITION ||
      def.kind === Kind.INTERFACE_TYPE_EXTENSION,
  ) as Array<
    | ObjectTypeDefinitionNode
    | ObjectTypeExtensionNode
    | InterfaceTypeDefinitionNode
    | InterfaceTypeExtensionNode
  >) {
    const found = knownSubgraphEntities.get(def.name.value);

    if (!found) {
      knownSubgraphEntities.set(def.name.value, { ...def });
      continue;
    }

    (found as any).fields = (found.fields ?? []).concat(def.fields ?? []);
    (found as any).interfaces = (found.interfaces ?? []).concat(def.interfaces ?? []);
    (found as any).directives = (found.directives ?? []).concat(def.directives ?? []);

    if (def.kind === Kind.OBJECT_TYPE_DEFINITION && found.kind === Kind.OBJECT_TYPE_EXTENSION) {
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
        def => def.kind === Kind.DIRECTIVE_DEFINITION,
      ) as DirectiveDefinitionNode[]
    ).map(def => [def.name.value, def]),
  );

  const leafTypeNames = new Set<string>(specifiedScalarTypes.map(type => type.name));

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
    const isFederationPrefixed = specDirective.name.value.startsWith('federation__');

    if (isFederationPrefixed) {
      const normalizedName = specDirective.name.value.replace('federation__', '');
      const setOfNames = directiveAlternativeNamesMap.get(normalizedName);

      if (!setOfNames) {
        directiveAlternativeNamesMap.set(normalizedName, new Set([specDirective.name.value]));
      }
    } else {
      // TODO: get rid of `@` prefix in directive names of link.imports
      const { alias } = imports.find(
        i => i.name.replace(/^@/, '') === specDirective.name.value,
      ) ?? {
        alias: undefined,
      };

      let setOfNames = directiveAlternativeNamesMap.get(specDirective.name.value);

      if (!setOfNames) {
        directiveAlternativeNamesMap.set(specDirective.name.value, new Set());
        setOfNames = directiveAlternativeNamesMap.get(specDirective.name.value)!;
      }

      setOfNames.add(alias ? alias.replace(/^@/, '') : specDirective.name.value);
      setOfNames.add(`federation__${specDirective.name.value}`);
    }
  }

  // Same story as in `directiveAlternativeNamesMap`.
  const typeAlternativeNamesMap = new Map<string, Set<string>>();
  for (const specType of availableSpec.types) {
    const isFederationPrefixed = specType.name.value.startsWith('federation__');

    if (isFederationPrefixed) {
      const normalizedName = specType.name.value.replace('federation__', '');
      const setOfNames = typeAlternativeNamesMap.get(normalizedName);

      if (!setOfNames) {
        typeAlternativeNamesMap.set(normalizedName, new Set([specType.name.value]));
      }
    } else {
      const { alias } = imports.find(i => i.name === specType.name.value) ?? {
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

  const importedTypesSet = new Set(availableSpec.types.map(t => t.name.value));
  if (importedTypesSet.size) {
    subgraph.typeDefs.definitions.forEach(def => {
      if ('name' in def && def.name && importedTypesSet.has(def.name.value)) {
        overwrittenFederationDefinitionNames.add(def.name.value);
      }
    });
  }

  return {
    stateBuilder,
    federationImports: imports,
    isLinkSpecDirective(name: string) {
      return linkSpecDirectives.some(d => d.name.value === name);
    },
    isLinkSpecType(name: string) {
      return linkSpecTypes.some(t => t.name.value === name);
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
      const alternativeNames = directiveAlternativeNamesMap.get(specDirectiveName);

      if (alternativeNames) {
        return alternativeNames.has(
          typeof directiveNode.name === 'string' ? directiveNode.name : directiveNode.name.value,
        );
      }

      return false;
    },
    satisfiesVersionRange(range: `${'<' | '>=' | '>'} ${FederationVersion}`) {
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
      return knownSubgraphEntities;
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
        availableSpec.directives.map(d => {
          const alias = imports.find(i => i.name.replace(/^@/, '') === d.name.value)?.alias;

          if (alias) {
            (d.name as any).value = alias.replace(/^@/, '');
          }

          return d;
        }),
        availableSpec.types.map(t => {
          const alias = imports.find(i => i.name === t.name.value)?.alias;

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
    markAsUsed(
      reason: 'fields' | '@extends' | 'references @shareable',
      kind:
        | Kind.OBJECT_TYPE_DEFINITION
        | Kind.INTERFACE_TYPE_DEFINITION
        | Kind.OBJECT_TYPE_EXTENSION
        | Kind.INTERFACE_TYPE_EXTENSION,
      typeName: string,
      fieldName: string,
    ) {
      if (!fieldName.startsWith('__') && !typeName.startsWith('__') && reason === 'fields') {
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
      if (version === 'v1.0') {
        return Array.from(markedAsExternal).filter(
          c => !markedAsUsed.has(c) && markedAsKeyField.has(c),
        );
      }

      const unused = Array.from(markedAsExternal).filter(c => !markedAsUsed.has(c));

      return unused.filter(coordinate => {
        const [typeName, fieldName] = coordinate.split('.');

        const typeDef = stateBuilder.state.types.get(typeName);

        if (!typeDef) {
          return true;
        }

        if (typeDef.kind === TypeKind.OBJECT && !stateBuilder.isInterfaceObject(typeName)) {
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

            if (iDef.kind === TypeKind.INTERFACE && iDef.fields.has(fieldName)) {
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
