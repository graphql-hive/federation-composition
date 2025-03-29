import { DirectiveNode } from 'graphql';
import { FederationVersion } from '../../specifications/federation.js';
import {
  ArgumentKind,
  Deprecated,
  Description,
  InterfaceType,
  ListSize,
} from '../../subgraph/state.js';
import { ensureValue, mathMax, mathMaxNullable, nullableArrayUnion } from '../../utils/helpers.js';
import { createInterfaceTypeNode, JoinFieldAST } from './ast.js';
import { convertToConst } from './common.js';
import type { Key, MapByGraph, TypeBuilder } from './common.js';

export function interfaceTypeBuilder(): TypeBuilder<InterfaceType, InterfaceTypeState> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const interfaceTypeState = getOrCreateInterfaceType(state, typeName);

      type.tags.forEach(tag => interfaceTypeState.tags.add(tag));

      if (type.inaccessible) {
        interfaceTypeState.inaccessible = true;
      }

      if (type.authenticated) {
        interfaceTypeState.authenticated = true;
      }

      if (type.policies) {
        interfaceTypeState.policies.push(...type.policies);
      }

      if (type.scopes) {
        interfaceTypeState.scopes.push(...type.scopes);
      }

      if (type.isDefinition) {
        interfaceTypeState.hasDefinition = true;
      }

      if (type.isInterfaceObject) {
        interfaceTypeState.hasInterfaceObject = true;
      }

      // First description wins
      if (type.description && !interfaceTypeState.description) {
        interfaceTypeState.description = type.description;
      }

      type.ast.directives.forEach(directive => {
        interfaceTypeState.ast.directives.push(directive);
      });

      type.interfaces.forEach(interfaceName => interfaceTypeState.interfaces.add(interfaceName));
      type.implementedBy.forEach(objectTypeName =>
        interfaceTypeState.implementedBy.add(objectTypeName),
      );

      if (type.keys.length) {
        interfaceTypeState.isEntity = true;
      }

      interfaceTypeState.byGraph.set(graph.id, {
        extension: type.extension,
        keys: type.keys,
        interfaces: type.interfaces,
        implementedBy: type.implementedBy,
        isInterfaceObject: type.isInterfaceObject,
        version: graph.version,
      });

      for (const field of type.fields.values()) {
        const fieldState = getOrCreateInterfaceField(interfaceTypeState, field.name, field.type);

        field.tags.forEach(tag => fieldState.tags.add(tag));

        if (!field.type.endsWith('!') && fieldState.type.endsWith('!')) {
          // Replace the non-null type with a nullable type
          fieldState.type = field.type;
        }

        if (field.isLeaf) {
          fieldState.isLeaf = true;
        }

        if (field.inaccessible) {
          fieldState.inaccessible = true;
        }

        if (field.authenticated) {
          fieldState.authenticated = true;
        }

        if (field.policies) {
          fieldState.policies.push(...field.policies);
        }

        if (field.scopes) {
          fieldState.scopes.push(...field.scopes);
        }

        if (field.cost !== null) {
          fieldState.cost = mathMax(field.cost, fieldState.cost);
        }

        if (field.listSize !== null) {
          fieldState.listSize = {
            assumedSize: mathMaxNullable(
              fieldState.listSize?.assumedSize,
              field.listSize.assumedSize,
            ),
            // prefer `false`
            requireOneSlicingArgument:
              (fieldState.listSize?.requireOneSlicingArgument ?? true) &&
              field.listSize.requireOneSlicingArgument,
            slicingArguments: nullableArrayUnion(
              fieldState.listSize?.slicingArguments,
              field.listSize.slicingArguments,
            ),
            sizedFields: nullableArrayUnion(
              fieldState.listSize?.sizedFields,
              field.listSize.sizedFields,
            ),
          };
        }

        // First deprecation wins
        if (field.deprecated && !fieldState.deprecated) {
          fieldState.deprecated = field.deprecated;
        }

        // First description wins
        if (field.description && !fieldState.description) {
          fieldState.description = field.description;
        }

        field.ast.directives.forEach(directive => {
          fieldState.ast.directives.push(directive);
        });

        const usedAsKey = type.fieldsUsedAsKeys.has(field.name);

        if (usedAsKey) {
          fieldState.usedAsKey = true;
        }


        fieldState.byGraph.set(graph.id, {
          type: field.type,
          override: field.override,
          overrideLabel: field.overrideLabel,
          provides: field.provides,
          requires: field.requires,
          version: graph.version,
          external: field.external,
          shareable: field.shareable,
          usedAsKey,
        });

        for (const arg of field.args.values()) {
          const argState = getOrCreateArg(fieldState, arg.name, arg.type, arg.kind);

          arg.tags.forEach(tag => argState.tags.add(tag));

          if (arg.type.endsWith('!')) {
            argState.type = arg.type;
          }

          if (arg.deprecated && !argState.deprecated) {
            argState.deprecated = arg.deprecated;
          }

          // First description wins
          if (arg.description && !argState.description) {
            argState.description = arg.description;
          }

          if (typeof arg.defaultValue !== 'undefined') {
            argState.defaultValue = arg.defaultValue;
          }

          if (arg.cost !== null) {
            argState.cost = mathMax(arg.cost, argState.cost);
          }

          arg.ast.directives.forEach(directive => {
            argState.ast.directives.push(directive);
          });

          argState.kind = arg.kind;

          argState.byGraph.set(graph.id, {
            type: arg.type,
            kind: arg.kind,
            defaultValue: arg.defaultValue,
            version: graph.version,
          });
        }
      }
    },
    composeSupergraphNode(interfaceType, graphs, { supergraphState }) {
      return createInterfaceTypeNode({
        name: interfaceType.name,
        fields: Array.from(interfaceType.fields.values()).map(field => {
          let nonEmptyJoinField = false;

          const joinFields: JoinFieldAST[] = [];

          if (field.byGraph.size !== interfaceType.byGraph.size) {
            for (const [graphId, meta] of field.byGraph.entries()) {
              if (
                meta.type !== field.type ||
                meta.override ||
                meta.provides ||
                meta.requires ||
                meta.external
              ) {
                nonEmptyJoinField = true;
              }

              joinFields.push({
                graph: graphId,
                type: meta.type === field.type ? undefined : meta.type,
                override: meta.override ?? undefined,
                provides: meta.provides ?? undefined,
                requires: meta.requires ?? undefined,
                external: meta.external,
              });
            }
          }

          return {
            name: field.name,
            type: field.type,
            inaccessible: field.inaccessible,
            authenticated: field.authenticated,
            policies: field.policies,
            scopes: field.scopes,
            cost:
              field.cost !== null
                ? {
                    cost: field.cost,
                    directiveName: ensureValue(
                      supergraphState.specs.cost.names.cost,
                      'Directive name of @cost is not defined',
                    ),
                  }
                : null,
            listSize:
              field.listSize !== null
                ? {
                    ...field.listSize,
                    directiveName: ensureValue(
                      supergraphState.specs.cost.names.listSize,
                      'Directive name of @listSize is not defined',
                    ),
                  }
                : null,
            tags: Array.from(field.tags),
            deprecated: field.deprecated,
            description: field.description,
            ast: {
              directives: convertToConst(field.ast.directives),
            },
            arguments: Array.from(field.args.values())
              .filter(arg => {
                // ignore the argument if it's not available in all subgraphs implementing the field
                if (arg.byGraph.size !== field.byGraph.size) {
                  return false;
                }

                return true;
              })
              .map(arg => {
                return {
                  name: arg.name,
                  type: arg.type,
                  kind: arg.kind,
                  tags: Array.from(arg.tags),
                  cost:
                    arg.cost !== null
                      ? {
                          cost: arg.cost,
                          directiveName: ensureValue(
                            supergraphState.specs.cost.names.cost,
                            'Directive name of @cost is not defined',
                          ),
                        }
                      : null,
                  defaultValue: arg.defaultValue,
                  deprecated: arg.deprecated,
                  description: arg.description,
                  ast: {
                    directives: convertToConst(arg.ast.directives),
                  },
                };
              }),
            join: {
              field: joinFields,
            },
          };
        }),
        tags: Array.from(interfaceType.tags),
        inaccessible: interfaceType.inaccessible,
        authenticated: interfaceType.authenticated,
        policies: interfaceType.policies,
        scopes: interfaceType.scopes,
        description: interfaceType.description,
        interfaces: Array.from(interfaceType.interfaces),
        ast: {
          directives: convertToConst(interfaceType.ast.directives),
        },
        join: {
          type: Array.from(interfaceType.byGraph)
            .map(([graphId, meta]) => {
              if (meta.keys.length && graphs.get(graphId)!.federation.version !== 'v1.0') {
                return meta.keys.map(key => ({
                  graph: graphId,
                  key: key.fields,
                  extension: meta.extension,
                  isInterfaceObject: meta.isInterfaceObject,
                  resolvable: key.resolvable,
                }));
              }

              return [
                {
                  graph: graphId,
                },
              ];
            })
            .flat(1),
          implements:
            interfaceType.interfaces.size > 0
              ? Array.from(interfaceType.byGraph.entries())
                  .map(([graphId, meta]) => {
                    if (meta.interfaces.size) {
                      return Array.from(meta.interfaces).map(iface => ({
                        graph: graphId,
                        interface: iface,
                      }));
                    }

                    return [];
                  })
                  .flat(1)
              : [],
        },
      });
    },
  };
}

export type InterfaceTypeState = {
  kind: 'interface';
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  hasDefinition: boolean;
  description?: Description;
  byGraph: MapByGraph<InterfaceTypeInGraph>;
  interfaces: Set<string>;
  implementedBy: Set<string>;
  fields: Map<string, InterfaceTypeFieldState>;
  hasInterfaceObject: boolean;
  isEntity: boolean;
  ast: {
    directives: DirectiveNode[];
  };
};

export type InterfaceTypeFieldState = {
  name: string;
  type: string;
  isLeaf: boolean;
  tags: Set<string>;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  cost: number | null;
  listSize: ListSize | null;
  deprecated?: Deprecated;
  description?: Description;
  usedAsKey: boolean;
  byGraph: MapByGraph<FieldStateInGraph>;
  args: Map<string, InterfaceTypeFieldArgState>;
  ast: {
    directives: DirectiveNode[];
  };
};

export type InterfaceTypeFieldArgState = {
  name: string;
  type: string;
  kind: ArgumentKind;
  tags: Set<string>;
  defaultValue?: string;
  cost: number | null;
  description?: Description;
  deprecated?: Deprecated;
  byGraph: MapByGraph<ArgStateInGraph>;
  ast: {
    directives: DirectiveNode[];
  };
};

type InterfaceTypeInGraph = {
  extension: boolean;
  keys: Key[];
  interfaces: Set<string>;
  implementedBy: Set<string>;
  isInterfaceObject: boolean;
  version: FederationVersion;
};

type FieldStateInGraph = {
  type: string;
  override: string | null;
  overrideLabel: string | null;
  provides: string | null;
  shareable: boolean;
  usedAsKey: boolean;
  external: boolean;
  requires: string | null;
  version: FederationVersion;
};

type ArgStateInGraph = {
  type: string;
  kind: ArgumentKind;
  defaultValue?: string;
  version: FederationVersion;
};

function getOrCreateInterfaceType(state: Map<string, InterfaceTypeState>, typeName: string) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: InterfaceTypeState = {
    kind: 'interface',
    name: typeName,
    tags: new Set(),
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    hasDefinition: false,
    hasInterfaceObject: false,
    isEntity: false,
    byGraph: new Map(),
    fields: new Map(),
    interfaces: new Set(),
    implementedBy: new Set(),
    ast: {
      directives: [],
    },
  };

  state.set(typeName, def);

  return def;
}

function getOrCreateInterfaceField(
  interfaceTypeState: InterfaceTypeState,
  fieldName: string,
  fieldType: string,
) {
  const existing = interfaceTypeState.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const def: InterfaceTypeFieldState = {
    name: fieldName,
    type: fieldType,
    isLeaf: false,
    usedAsKey: false,
    tags: new Set(),
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    cost: null,
    listSize: null,
    byGraph: new Map(),
    args: new Map(),
    ast: {
      directives: [],
    },
  };

  interfaceTypeState.fields.set(fieldName, def);

  return def;
}

function getOrCreateArg(
  fieldState: InterfaceTypeFieldState,
  argName: string,
  argType: string,
  argKind: ArgumentKind,
) {
  const existing = fieldState.args.get(argName);

  if (existing) {
    return existing;
  }

  const def: InterfaceTypeFieldArgState = {
    name: argName,
    type: argType,
    kind: argKind,
    tags: new Set(),
    cost: null,
    byGraph: new Map(),
    ast: {
      directives: [],
    },
  };

  fieldState.args.set(argName, def);

  return def;
}
