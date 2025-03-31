import { DirectiveNode } from "graphql";
import { FederationVersion } from "../../specifications/federation.js";
import { Description, ScalarType } from "../../subgraph/state.js";
import { ensureValue, mathMax } from "../../utils/helpers.js";
import { createScalarTypeNode } from "./ast.js";
import { convertToConst, MapByGraph, TypeBuilder } from "./common.js";

export function scalarTypeBuilder(): TypeBuilder<ScalarType, ScalarTypeState> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const scalarTypeState = getOrCreateScalarType(state, typeName);

      type.tags.forEach((tag) => scalarTypeState.tags.add(tag));

      if (type.inaccessible) {
        scalarTypeState.inaccessible = true;
      }

      if (type.authenticated) {
        scalarTypeState.authenticated = true;
      }

      if (type.policies) {
        scalarTypeState.policies.push(...type.policies);
      }

      if (type.scopes) {
        scalarTypeState.scopes.push(...type.scopes);
      }

      if (type.cost !== null) {
        scalarTypeState.cost = mathMax(type.cost, scalarTypeState.cost);
      }

      if (type.description && !scalarTypeState.description) {
        scalarTypeState.description = type.description;
      }

      if (type.specifiedBy && !scalarTypeState.specifiedBy) {
        scalarTypeState.specifiedBy = type.specifiedBy;
      }

      type.ast.directives.forEach((directive) => {
        scalarTypeState.ast.directives.push(directive);
      });

      scalarTypeState.byGraph.set(graph.id, {
        inaccessible: type.inaccessible,
        version: graph.version,
      });
    },
    composeSupergraphNode(
      scalarType: ScalarTypeState,
      _graph,
      { supergraphState },
    ) {
      return createScalarTypeNode({
        name: scalarType.name,
        tags: Array.from(scalarType.tags),
        inaccessible: scalarType.inaccessible,
        authenticated: scalarType.authenticated,
        policies: scalarType.policies,
        scopes: scalarType.scopes,
        cost:
          scalarType.cost !== null
            ? {
                cost: scalarType.cost,
                directiveName: ensureValue(
                  supergraphState.specs.cost.names.cost,
                  "Directive name of @cost is not defined",
                ),
              }
            : null,
        description: scalarType.description,
        specifiedBy: scalarType.specifiedBy,
        join: {
          type: Array.from(scalarType.byGraph.keys()).map((graphName) => ({
            graph: graphName.toUpperCase(),
          })),
        },
        ast: {
          directives: convertToConst(scalarType.ast.directives),
        },
      });
    },
  };
}

export type ScalarTypeState = {
  kind: "scalar";
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  cost: number | null;
  byGraph: MapByGraph<ScalarTypeStateInGraph>;
  description?: Description;
  specifiedBy?: string;
  ast: {
    directives: DirectiveNode[];
  };
};

type ScalarTypeStateInGraph = {
  inaccessible: boolean;
  version: FederationVersion;
};

function getOrCreateScalarType(
  state: Map<string, ScalarTypeState>,
  typeName: string,
) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: ScalarTypeState = {
    kind: "scalar",
    name: typeName,
    tags: new Set(),
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    cost: null,
    byGraph: new Map(),
    ast: {
      directives: [],
    },
  };

  state.set(typeName, def);

  return def;
}
