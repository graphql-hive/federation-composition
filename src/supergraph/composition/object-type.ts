import { DirectiveNode } from 'graphql';
import type { FederationVersion } from '../../specifications/federation.js';
import {
  ArgumentKind,
  Deprecated,
  Description,
  ListSize,
  ObjectType,
} from '../../subgraph/state.js';
import {
  ensureValue,
  isDefined,
  mathMax,
  mathMaxNullable,
  nullableArrayUnion,
} from '../../utils/helpers.js';
import { createObjectTypeNode, JoinFieldAST } from './ast.js';
import type { Key, MapByGraph, TypeBuilder } from './common.js';
import { convertToConst } from './common.js';
import { InterfaceTypeFieldState } from './interface-type.js';

export function isRealExtension(meta: ObjectTypeStateInGraph, version: FederationVersion) {
  const hasExtendsDirective = meta.extensionType === '@extends';

  if (meta.extension) {
    if (version === 'v1.0' && !hasExtendsDirective) {
      return false;
    }

    if (hasExtendsDirective) {
      return true;
    }

    if (meta.hasDefinition) {
      return false;
    }

    return true;
  }

  return false;
}

export function objectTypeBuilder(): TypeBuilder<ObjectType, ObjectTypeState> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const objectTypeState = getOrCreateObjectType(state, typeName);

      type.tags.forEach(tag => objectTypeState.tags.add(tag));

      if (type.inaccessible) {
        objectTypeState.inaccessible = true;
      }

      if (type.authenticated) {
        objectTypeState.authenticated = true;
      }

      if (type.policies) {
        objectTypeState.policies.push(...type.policies);
      }

      if (type.scopes) {
        objectTypeState.scopes.push(...type.scopes);
      }

      if (type.cost !== null) {
        objectTypeState.cost = mathMax(type.cost, objectTypeState.cost);
      }

      const isDefinition =
        type.isDefinition && (graph.version === 'v1.0' ? type.extensionType !== '@extends' : true);

      if (type.description && !objectTypeState.description) {
        objectTypeState.description = type.description;
      }

      if (isDefinition) {
        objectTypeState.hasDefinition = true;
      }

      if (type.ast.directives) {
        type.ast.directives.forEach(directive => {
          objectTypeState.ast.directives.push(directive);
        });
      }

      type.interfaces.forEach(interfaceName => objectTypeState.interfaces.add(interfaceName));

      if (type.keys.length) {
        objectTypeState.isEntity = true;
      }

      objectTypeState.byGraph.set(graph.id, {
        hasDefinition: isDefinition,
        extension: type.extension,
        extensionType: type.extensionType,
        external: type.external,
        keys: type.keys,
        inaccessible: type.inaccessible,
        shareable: type.shareable,
        interfaces: type.interfaces,
        version: graph.version,
      });
      const typeInGraph = objectTypeState.byGraph.get(graph.id)!;

      for (const field of type.fields.values()) {
        const fieldState = getOrCreateField(objectTypeState, field.name, field.type);

        field.tags.forEach(tag => fieldState.tags.add(tag));

        const usedAsKey = type.fieldsUsedAsKeys.has(field.name);

        if (usedAsKey) {
          fieldState.usedAsKey = true;
        }

        // It's the first time we visited a non-external field, we should force the type on that field to match the local type
        const isExternal =
          graph.version === 'v1.0'
            ? field.external && isRealExtension(typeInGraph, graph.version)
            : field.external;
        const shouldForceType =
          // If it's not an external field and it's first time we visited a non-external field,
          // we should force the type but only if it's not used as a key
          // If it's used as a key, some other logic applies. Federation v2 is such a mess...
          !usedAsKey && !isExternal && !fieldState.internal.seenNonExternal;
        const shouldChangeType =
          shouldForceType ||
          // If it's an external field, let's ignore it
          (!isExternal &&
            // if the field type is nullable and
            // the existing type is non-null
            // Existing -> Incoming -> Result
            // [A!]!    -> [A!]     -> [A!]
            // [A!]!    -> [A]      -> [A]
            // [A!]     -> [A!]!    -> [A!]
            // [A!]     -> [A]      -> [A]
            // [A]!     -> [A!]     -> [A!]
            // Least nullable wins
            fieldState.type.lastIndexOf('!') > field.type.lastIndexOf('!'));

        if (shouldChangeType) {
          // Replace the non-null type with a nullable type
          fieldState.type = field.type;
        }

        if (field.isLeaf) {
          fieldState.isLeaf = true;
        }

        if (!fieldState.internal.seenNonExternal && !isExternal) {
          fieldState.internal.seenNonExternal = true;
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

        // first wins BUT a graph overriding a field of an entity type (that provided the description) is an exception (it's applied at the supergraph level REF_1)
        if (field.description && !fieldState.description) {
          fieldState.description = field.description;
        }

        if (field.override) {
          fieldState.override = field.override;
        }

        // First deprecation wins
        if (field.deprecated && !fieldState.deprecated) {
          fieldState.deprecated = field.deprecated;
        }

        field.ast.directives.forEach(directive => {
          fieldState.ast.directives.push(directive);
        });

        fieldState.byGraph.set(graph.id, {
          type: field.type,
          external: field.external,
          inaccessible: field.inaccessible,
          description: field.description ?? null,
          override: field.override,
          provides: field.provides,
          requires: field.requires,
          provided: field.provided,
          required: field.required,
          shareable: field.shareable,
          extension: field.extension,
          used: field.used,
          usedAsKey,
          version: graph.version,
        });

        for (const arg of field.args.values()) {
          const argState = getOrCreateArg(fieldState, arg.name, arg.type, arg.kind);

          arg.tags.forEach(tag => argState.tags.add(tag));

          if (arg.type.endsWith('!')) {
            argState.type = arg.type;
          }

          if (arg.inaccessible) {
            argState.inaccessible = true;
          }

          // if (!field.external) {
          //   // If the field is not external, it means that it's defined in the current graph
          //   argState.description = arg.description;
          // }
          // First description wins
          if (arg.description && !argState.description) {
            argState.description = arg.description;
          }

          if (arg.deprecated && !argState.deprecated) {
            argState.deprecated = arg.deprecated;
          }

          arg.ast.directives.forEach(directive => {
            argState.ast.directives.push(directive);
          });

          if (typeof arg.defaultValue !== 'undefined') {
            argState.defaultValue = arg.defaultValue;
          }

          if (arg.cost !== null) {
            argState.cost = mathMax(arg.cost, argState.cost);
          }

          argState.kind = arg.kind;

          argState.byGraph.set(graph.id, {
            type: arg.type,
            kind: arg.kind,
            inaccessible: arg.inaccessible,
            defaultValue: arg.defaultValue,
            version: graph.version,
          });
        }
      }
    },
    composeSupergraphNode(objectType, graphs, { graphNameToId, supergraphState }) {
      const isQuery = objectType.name === 'Query';

      const joinTypes = isQuery
        ? // if it's a Query, we need to annotate the object type with `@join__type` pointing to all subgraphs
          Array.from(graphs.values()).map(graph => ({
            graph: graph.graph.id,
          }))
        : // If it's not a Query, we follow the regular logic
          Array.from(objectType.byGraph.entries())
            .map(([graphId, meta]) => {
              if (meta.keys.length) {
                return meta.keys.map(key => ({
                  graph: graphId,
                  key: key.fields,
                  // To support Fed v1, we need to only apply `extension: true` when it's a type annotated with @extends (not by using `extend type` syntax, this needs to be ignored)
                  extension: isRealExtension(meta, graphs.get(graphId)!.federation.version),
                  resolvable: key.resolvable,
                }));
              }

              return [
                {
                  graph: graphId,
                },
              ];
            })
            .flat(1);

      // a list of fields defined by interfaces (that type implements)
      const fieldNamesOfImplementedInterfaces: {
        [fieldName: string]: /* Graph IDs */ Set<string>;
      } = {};
      const resolvableFieldsFromInterfaceObjects: InterfaceTypeFieldState[] = [];

      for (const interfaceName of objectType.interfaces) {
        const interfaceState = supergraphState.interfaceTypes.get(interfaceName);

        if (!interfaceState) {
          throw new Error(`Interface "${interfaceName}" not found in Supergraph state`);
        }

        for (const [interfaceFieldName, interfaceField] of interfaceState.fields) {
          const found = fieldNamesOfImplementedInterfaces[interfaceFieldName];

          if (found) {
            for (const graphId of interfaceField.byGraph.keys()) {
              found.add(graphId);
            }
          } else {
            fieldNamesOfImplementedInterfaces[interfaceFieldName] = new Set(
              Array.from(interfaceField.byGraph.keys()),
            );
          }

          if (!interfaceState.hasInterfaceObject) {
            continue;
          }

          if (!resolvableFieldsFromInterfaceObjects.some(f => f.name === interfaceFieldName)) {
            resolvableFieldsFromInterfaceObjects.push(interfaceField);
          }
        }
      }

      if (objectType.isEntity) {
        for (const [_, field] of objectType.fields) {
          // Correct description if needed (REF_1)
          if (!field.description) {
            continue;
          }

          // check if a field was overridden
          if (!field.override) {
            continue;
          }

          for (const [_, fieldInGraph] of field.byGraph) {
            // if a field is shareable, ignore the description (I don't know why...don't ask me)
            if (fieldInGraph.override && !fieldInGraph.shareable) {
              // use description from that graph
              field.description = fieldInGraph.description ?? undefined;
            }
          }
        }
      }

      function shouldSetExternalOnJoinField(
        fieldStateInGraph: FieldStateInGraph,
        graphId: string,
        fieldState: ObjectTypeFieldState,
      ) {
        if (!fieldStateInGraph.external) {
          return false;
        }

        if (fieldStateInGraph.provided) {
          return true;
        }

        // mark field as external if it's annotated with @external, but it's not used as a key on the extension type
        if (fieldState.usedAsKey && objectType.byGraph.get(graphId)!.extension === true) {
          return false;
        }

        return true;
      }

      function createJoinFields(
        fieldInGraphs: [string, FieldStateInGraph][],
        field: ObjectTypeFieldState,
        {
          hasDifferentOutputType,
        }: {
          hasDifferentOutputType: boolean;
        },
      ) {
        return fieldInGraphs
          .map(([graphId, meta]) => {
            const type = hasDifferentOutputType ? meta.type : undefined;
            const override = meta.override ?? undefined;
            const usedOverridden = provideUsedOverriddenValue(
              field,
              meta,
              fieldNamesOfImplementedInterfaces,
              graphId,
              graphNameToId,
            );
            const external = shouldSetExternalOnJoinField(meta, graphId, field);
            const provides = meta.provides ?? undefined;
            const requires = meta.requires ?? undefined;

            const definesSomething =
              !!type || !!override || !!provides || !!requires || !!usedOverridden;
            const isRequiredOrProvided = meta.provided || meta.required;

            if (
              external &&
              objectType.byGraph.get(graphId)!.extension === true &&
              !definesSomething &&
              !isRequiredOrProvided
            ) {
              return null;
            }

            return {
              graph: graphId,
              type,
              override,
              usedOverridden,
              external,
              provides,
              requires,
            };
          })
          .filter(isDefined);
      }

      return createObjectTypeNode({
        name: objectType.name,
        ast: {
          // DirectiveNode and ConstDirectiveNode are identical (except the readonly shit...)
          directives: convertToConst(objectType.ast.directives),
        },
        cost:
          objectType.cost !== null
            ? {
                cost: objectType.cost,
                directiveName: ensureValue(
                  supergraphState.specs.cost.names.cost,
                  'Directive name of @cost is not defined',
                ),
              }
            : null,
        description: objectType.description,
        fields: Array.from(objectType.fields.values())
          .map(field => {
            const fieldInGraphs = Array.from(field.byGraph.entries());

            const hasDifferentOutputType = fieldInGraphs.some(
              ([_, meta]) => meta.type !== field.type,
            );
            const isDefinedEverywhere =
              field.byGraph.size === (isQuery ? graphs.size : objectType.byGraph.size);
            let joinFields: JoinFieldAST[] = [];

            const differencesBetweenGraphs = {
              override: false,
              type: false,
              external: false,
              provides: false,
              requires: false,
            };

            for (const [graphId, meta] of fieldInGraphs) {
              if (meta.external) {
                differencesBetweenGraphs.external = field.usedAsKey
                  ? objectType.byGraph.get(graphId)!.extension !== true
                  : true;
              }
              if (meta.override !== null) {
                differencesBetweenGraphs.override = true;
              }
              if (meta.provides !== null) {
                differencesBetweenGraphs.provides = true;
              }
              if (meta.requires !== null) {
                differencesBetweenGraphs.requires = true;
              }
              if (meta.type !== field.type) {
                differencesBetweenGraphs.type = true;
              }
            }

            if (!isQuery && field.byGraph.size === 1) {
              const graphId = field.byGraph.keys().next().value!;
              const fieldInGraph = field.byGraph.get(graphId)!;

              if (
                // a field is external
                fieldInGraph.external &&
                // it's not used as a key
                !fieldInGraph.usedAsKey &&
                // it's not part of any @requires(fields:)
                !fieldInGraph.required &&
                // it's not part of any @provides(fields:)
                !fieldInGraph.provided &&
                // it's not part of any @override(from:) and it's not used by any interface
                !provideUsedOverriddenValue(
                  field,
                  fieldInGraph,
                  fieldNamesOfImplementedInterfaces,
                  graphId,
                  graphNameToId,
                ) &&
                // and it's Federation v1
                graphs.get(graphId)!.federation.version === 'v1.0'
              ) {
                // drop the field
                return null;
              }
            }

            if (isQuery) {
              // If it's a Query type, we don't need to emit `@join__field` directives when there's only one graph
              // We do not have to emit `@join__field` if the field is shareable in every graph as well.

              if (differencesBetweenGraphs.override && graphs.size > 1) {
                const overriddenGraphs = fieldInGraphs
                  .map(([_, meta]) => (meta.override ? graphNameToId(meta.override) : null))
                  .filter((graphId): graphId is string => typeof graphId === 'string');

                const graphsToPrintJoinField = fieldInGraphs.filter(
                  ([graphId, meta]) =>
                    meta.override !== null ||
                    (meta.shareable && !overriddenGraphs.includes(graphId)),
                );

                joinFields = graphsToPrintJoinField.map(([graphId, meta]) => ({
                  graph: graphId,
                  override: meta.override ?? undefined,
                  usedOverridden: provideUsedOverriddenValue(
                    field,
                    meta,
                    fieldNamesOfImplementedInterfaces,
                    graphId,
                    graphNameToId,
                  ),
                  type: differencesBetweenGraphs.type ? meta.type : undefined,
                  external: meta.external ?? undefined,
                  provides: meta.provides ?? undefined,
                  requires: meta.requires ?? undefined,
                }));
              } else {
                joinFields =
                  graphs.size > 1 && !isDefinedEverywhere
                    ? fieldInGraphs.map(([graphId, meta]) => ({
                        graph: graphId,
                        provides: differencesBetweenGraphs.provides
                          ? (meta.provides ?? undefined)
                          : undefined,
                      }))
                    : [];
              }
            } else if (isDefinedEverywhere) {
              const hasDifferencesBetweenGraphs = Object.values(differencesBetweenGraphs).some(
                value => value === true,
              );

              // We probably need to emit `@join__field` for every graph, except the one where the override was applied
              if (differencesBetweenGraphs.override) {
                const overriddenGraphs = fieldInGraphs
                  .map(([_, meta]) => (meta.override ? graphNameToId(meta.override) : null))
                  .filter((graphId): graphId is string => typeof graphId === 'string');

                // the exception is when a field is external, we need to emit `@join__field` for that graph,
                // so gateway knows that it's an external field
                const graphsToEmit = fieldInGraphs.filter(([graphId, f]) => {
                  const isExternal = f.external === true;
                  const isOverridden = overriddenGraphs.includes(graphId);
                  const needsToPrintUsedOverridden = provideUsedOverriddenValue(
                    field,
                    f,
                    fieldNamesOfImplementedInterfaces,
                    graphId,
                    graphNameToId,
                  );
                  const isRequired = f.required === true;

                  return (isExternal && isRequired) || needsToPrintUsedOverridden || !isOverridden;
                });

                // Do not emit `@join__field` if there's only one graph left
                // and the type has a single `@join__type` matching the graph.
                if (
                  !(
                    graphsToEmit.length === 1 &&
                    joinTypes.length === 1 &&
                    joinTypes[0].graph === graphsToEmit[0][0]
                  )
                ) {
                  joinFields = graphsToEmit.map(([graphId, meta]) => ({
                    graph: graphId,
                    override: meta.override ?? undefined,
                    usedOverridden: provideUsedOverriddenValue(
                      field,
                      meta,
                      fieldNamesOfImplementedInterfaces,
                      graphId,
                      graphNameToId,
                    ),
                    type: differencesBetweenGraphs.type ? meta.type : undefined,
                    external: meta.external ?? undefined,
                    provides: meta.provides ?? undefined,
                    requires: meta.requires ?? undefined,
                  }));
                }
              } else if (hasDifferencesBetweenGraphs) {
                joinFields = createJoinFields(fieldInGraphs, field, {
                  hasDifferentOutputType,
                });
              }
            } else {
              // An override is a special case, we need to emit `@join__field` only for graphs where @override was applied
              if (differencesBetweenGraphs.override) {
                const overriddenGraphs = fieldInGraphs
                  .map(([_, meta]) => (meta.override ? graphNameToId(meta.override) : null))
                  .filter((graphId): graphId is string => typeof graphId === 'string');

                const graphsToPrintJoinField = fieldInGraphs.filter(
                  ([graphId, meta]) =>
                    meta.override !== null ||
                    // we want to print `external: true` as it's still needed by the query planner
                    meta.external === true ||
                    (meta.shareable && !overriddenGraphs.includes(graphId)) ||
                    provideUsedOverriddenValue(
                      field,
                      meta,
                      fieldNamesOfImplementedInterfaces,
                      graphId,
                      graphNameToId,
                    ),
                );

                joinFields = graphsToPrintJoinField.map(([graphId, meta]) => ({
                  graph: graphId,
                  override: meta.override ?? undefined,
                  usedOverridden: provideUsedOverriddenValue(
                    field,
                    meta,
                    fieldNamesOfImplementedInterfaces,
                    graphId,
                    graphNameToId,
                  ),
                  type: differencesBetweenGraphs.type ? meta.type : undefined,
                  external: meta.external ?? undefined,
                  provides: meta.provides ?? undefined,
                  requires: meta.requires ?? undefined,
                }));
              } else {
                joinFields = createJoinFields(fieldInGraphs, field, {
                  hasDifferentOutputType,
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
              tags: Array.from(field.tags),
              description: field.description,
              deprecated: field.deprecated,
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
              ast: {
                directives: convertToConst(field.ast.directives),
              },
              join: {
                field:
                  // If there's only one graph on both field and type
                  // and it has no properties, we don't need to emit `@join__field`
                  joinFields.length === 1 &&
                  joinTypes.length === 1 &&
                  !joinFields[0].external &&
                  !joinFields[0].override &&
                  !joinFields[0].provides &&
                  !joinFields[0].requires &&
                  !joinFields[0].usedOverridden &&
                  !joinFields[0].type
                    ? []
                    : joinFields,
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
                    inaccessible: arg.inaccessible,
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
                    tags: Array.from(arg.tags),
                    defaultValue: arg.defaultValue,
                    description: arg.description,
                    deprecated: arg.deprecated,
                    ast: {
                      directives: convertToConst(arg.ast.directives),
                    },
                  };
                }),
            };
          })
          .filter(isDefined)
          .concat(
            resolvableFieldsFromInterfaceObjects
              .filter(f => !objectType.fields.has(f.name))
              .map(field => {
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
                  description: field.description,
                  deprecated: field.deprecated,
                  ast: {
                    directives: convertToConst(field.ast.directives),
                  },
                  join: {
                    field: [{}],
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
                        inaccessible: false,
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
                        tags: Array.from(arg.tags),
                        defaultValue: arg.defaultValue,
                        description: arg.description,
                        deprecated: arg.deprecated,
                        ast: {
                          directives: convertToConst(arg.ast.directives),
                        },
                      };
                    }),
                };
              }),
          ),
        interfaces: Array.from(objectType.interfaces),
        tags: Array.from(objectType.tags),
        inaccessible: objectType.inaccessible,
        authenticated: objectType.authenticated,
        policies: objectType.policies,
        scopes: objectType.scopes,
        join: {
          type: joinTypes,
          implements:
            objectType.interfaces.size > 0
              ? Array.from(objectType.byGraph.entries())
                  .map(([graph, meta]) => {
                    if (meta.interfaces.size > 0) {
                      return Array.from(meta.interfaces).map(interfaceName => ({
                        graph: graph.toUpperCase(),
                        interface: interfaceName,
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

function provideUsedOverriddenValue(
  field: ObjectTypeFieldState,
  fieldStateInGraph: FieldStateInGraph,
  fieldNamesOfImplementedInterfaces: {
    [fieldName: string]: Set<string>;
  },
  graphId: string,
  graphNameToId: (graphId: string) => string | null,
): boolean {
  const inGraphs = fieldNamesOfImplementedInterfaces[field.name];
  const hasMatchingInterfaceFieldInGraph: boolean = inGraphs && inGraphs.has(graphId);
  const isUsedAsNonExternalKey = fieldStateInGraph.usedAsKey && !fieldStateInGraph.external;
  const isOverridden = field.override && graphNameToId(field.override) === graphId;

  if (isOverridden && (isUsedAsNonExternalKey || hasMatchingInterfaceFieldInGraph)) {
    return true;
  }

  return false;
}

export type ObjectTypeState = {
  kind: 'object';
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  cost: number | null;
  hasDefinition: boolean;
  byGraph: MapByGraph<ObjectTypeStateInGraph>;
  interfaces: Set<string>;
  fields: Map<string, ObjectTypeFieldState>;
  isEntity: boolean;
  description?: Description;
  ast: {
    directives: DirectiveNode[];
  };
};

export type ObjectTypeFieldState = {
  name: string;
  type: string;
  tags: Set<string>;
  inaccessible: boolean;
  isLeaf: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  cost: number | null;
  listSize: ListSize | null;
  usedAsKey: boolean;
  override: string | null;
  byGraph: MapByGraph<FieldStateInGraph>;
  args: Map<string, ObjectTypeFieldArgState>;
  description?: Description;
  deprecated?: Deprecated;
  ast: {
    directives: DirectiveNode[];
  };
  internal: {
    seenNonExternal: boolean;
  };
};

export type ObjectTypeFieldArgState = {
  name: string;
  type: string;
  kind: ArgumentKind;
  tags: Set<string>;
  inaccessible: boolean;
  cost: number | null;
  defaultValue?: string;
  byGraph: MapByGraph<ArgStateInGraph>;
  description?: Description;
  deprecated?: Deprecated;
  ast: {
    directives: DirectiveNode[];
  };
};

export type ObjectTypeStateInGraph = {
  hasDefinition: boolean;
  extension: boolean;
  extensionType?: '@extends' | 'extend';
  external: boolean;
  keys: Key[];
  interfaces: Set<string>;
  inaccessible: boolean;
  shareable: boolean;
  version: FederationVersion;
};

type FieldStateInGraph = {
  type: string;
  external: boolean;
  description: Description | null;
  inaccessible: boolean;
  used: boolean;
  override: string | null;
  provides: string | null;
  requires: string | null;
  provided: boolean;
  required: boolean;
  shareable: boolean;
  usedAsKey: boolean;
  extension: boolean;
  version: FederationVersion;
};

type ArgStateInGraph = {
  type: string;
  kind: ArgumentKind;
  inaccessible: boolean;
  defaultValue?: string;
  version: FederationVersion;
};

function getOrCreateObjectType(state: Map<string, ObjectTypeState>, typeName: string) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: ObjectTypeState = {
    kind: 'object',
    name: typeName,
    tags: new Set(),
    hasDefinition: false,
    isEntity: false,
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    cost: null,
    interfaces: new Set(),
    byGraph: new Map(),
    fields: new Map(),
    ast: {
      directives: [],
    },
  };

  state.set(typeName, def);

  return def;
}

function getOrCreateField(objectTypeState: ObjectTypeState, fieldName: string, fieldType: string) {
  const existing = objectTypeState.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const def: ObjectTypeFieldState = {
    name: fieldName,
    type: fieldType,
    isLeaf: false,
    tags: new Set(),
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    cost: null,
    listSize: null,
    usedAsKey: false,
    override: null,
    byGraph: new Map(),
    args: new Map(),
    ast: {
      directives: [],
    },
    internal: {
      seenNonExternal: false,
    },
  };

  objectTypeState.fields.set(fieldName, def);

  return def;
}

function getOrCreateArg(
  fieldState: ObjectTypeFieldState,
  argName: string,
  argType: string,
  argKind: ArgumentKind,
) {
  const existing = fieldState.args.get(argName);

  if (existing) {
    return existing;
  }

  const def: ObjectTypeFieldArgState = {
    name: argName,
    type: argType,
    kind: argKind,
    tags: new Set(),
    inaccessible: false,
    cost: null,
    byGraph: new Map(),
    ast: {
      directives: [],
    },
  };

  fieldState.args.set(argName, def);

  return def;
}
