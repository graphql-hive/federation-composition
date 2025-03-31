import { DirectiveNode } from "graphql";
import { FederationVersion } from "../../specifications/federation.js";
import {
  ArgumentKind,
  Deprecated,
  Description,
  InputObjectType,
} from "../../subgraph/state.js";
import { ensureValue, mathMax } from "../../utils/helpers.js";
import { createInputObjectTypeNode } from "./ast.js";
import { convertToConst, type MapByGraph, type TypeBuilder } from "./common.js";

export function inputObjectTypeBuilder(): TypeBuilder<
  InputObjectType,
  InputObjectTypeState
> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const inputObjectTypeState = getOrCreateInputObjectType(state, typeName);

      type.tags.forEach((tag) => inputObjectTypeState.tags.add(tag));

      if (type.inaccessible) {
        inputObjectTypeState.inaccessible = true;
      }

      if (type.description && !inputObjectTypeState.description) {
        inputObjectTypeState.description = type.description;
      }

      if (type.isDefinition) {
        inputObjectTypeState.hasDefinition = true;
      }

      if (type.ast.directives) {
        type.ast.directives.forEach((directive) => {
          inputObjectTypeState.ast.directives.push(directive);
        });
      }

      inputObjectTypeState.byGraph.set(graph.id, {
        inaccessible: type.inaccessible,
        version: graph.version,
      });

      for (const field of type.fields.values()) {
        const fieldState = getOrCreateField(
          inputObjectTypeState,
          field.name,
          field.type,
          field.kind,
        );

        field.tags.forEach((tag) => fieldState.tags.add(tag));

        if (field.type.endsWith("!") && !fieldState.type.endsWith("!")) {
          // Replace the nullable type with a non-nullable type
          fieldState.type = field.type;
        }

        if (field.inaccessible) {
          fieldState.inaccessible = true;
        }

        if (field.cost !== null) {
          fieldState.cost = mathMax(field.cost, fieldState.cost);
        }

        if (field.description && !fieldState.description) {
          fieldState.description = field.description;
        }

        // First deprecation wins
        if (field.deprecated && !fieldState.deprecated) {
          fieldState.deprecated = field.deprecated;
        }

        if (typeof field.defaultValue !== "undefined") {
          fieldState.defaultValue = field.defaultValue;
        }

        fieldState.kind = field.kind;

        field.ast.directives.forEach((directive) => {
          fieldState.ast.directives.push(directive);
        });

        fieldState.byGraph.set(graph.id, {
          type: field.type,
          inaccessible: field.inaccessible,
          defaultValue: field.defaultValue,
          version: graph.version,
        });
      }
    },
    composeSupergraphNode(inputObjectType, _graph, { supergraphState }) {
      return createInputObjectTypeNode({
        name: inputObjectType.name,
        tags: Array.from(inputObjectType.tags),
        inaccessible: inputObjectType.inaccessible,
        description: inputObjectType.description,
        ast: {
          directives: convertToConst(inputObjectType.ast.directives),
        },
        fields: Array.from(inputObjectType.fields.values())
          .filter((field) => {
            if (field.byGraph.size !== inputObjectType.byGraph.size) {
              return false;
            }

            return true;
          })
          .map((field) => {
            const fieldStateInGraphs = Array.from(field.byGraph.values());
            const hasDifferentType = fieldStateInGraphs.some(
              (f) => f.type !== field.type,
            );

            return {
              name: field.name,
              type: field.type,
              tags: Array.from(field.tags),
              inaccessible: field.inaccessible,
              cost:
                field.cost !== null
                  ? {
                      cost: field.cost,
                      directiveName: ensureValue(
                        supergraphState.specs.cost.names.cost,
                        "Directive name of @cost is not defined",
                      ),
                    }
                  : null,
              defaultValue: fieldStateInGraphs.every(
                (f) => typeof f.defaultValue !== "undefined",
              )
                ? field.defaultValue
                : undefined,
              description: field.description,
              deprecated: field.deprecated,
              ast: {
                directives: convertToConst(field.ast.directives),
              },
              join: {
                field: hasDifferentType
                  ? Array.from(field.byGraph).map(([graph, fieldByGraph]) => ({
                      graph,
                      type: fieldByGraph.type,
                    }))
                  : [],
              },
            };
          }),
        join: {
          type: Array.from(inputObjectType.byGraph.keys()).map((graph) => ({
            graph,
          })),
        },
      });
    },
  };
}

export interface InputObjectTypeState {
  kind: "input";
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  hasDefinition: boolean;
  description?: Description;
  byGraph: MapByGraph<InputObjectTypeStateInGraph>;
  fields: Map<string, InputObjectTypeFieldState>;
  ast: {
    directives: DirectiveNode[];
  };
}

export type InputObjectTypeFieldState = {
  name: string;
  type: string;
  kind: ArgumentKind;
  tags: Set<string>;
  inaccessible: boolean;
  cost: number | null;
  defaultValue?: string;
  description?: Description;
  deprecated?: Deprecated;
  byGraph: MapByGraph<InputObjectFieldStateInGraph>;
  ast: {
    directives: DirectiveNode[];
  };
};

type InputObjectTypeStateInGraph = {
  inaccessible: boolean;
  version: FederationVersion;
};

type InputObjectFieldStateInGraph = {
  type: string;
  inaccessible: boolean;
  defaultValue?: string;
  version: FederationVersion;
};

function getOrCreateInputObjectType(
  state: Map<string, InputObjectTypeState>,
  typeName: string,
) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: InputObjectTypeState = {
    kind: "input",
    name: typeName,
    tags: new Set(),
    hasDefinition: false,
    inaccessible: false,
    byGraph: new Map(),
    fields: new Map(),
    ast: {
      directives: [],
    },
  };

  state.set(typeName, def);

  return def;
}

function getOrCreateField(
  objectTypeState: InputObjectTypeState,
  fieldName: string,
  fieldType: string,
  fieldKind: ArgumentKind,
) {
  const existing = objectTypeState.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const def: InputObjectTypeFieldState = {
    name: fieldName,
    type: fieldType,
    kind: fieldKind,
    tags: new Set(),
    inaccessible: false,
    cost: null,
    byGraph: new Map(),
    ast: {
      directives: [],
    },
  };

  objectTypeState.fields.set(fieldName, def);

  return def;
}
