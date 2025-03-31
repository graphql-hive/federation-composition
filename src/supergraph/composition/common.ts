import type {
  ConstDirectiveNode,
  DirectiveDefinitionNode,
  DirectiveNode,
  TypeDefinitionNode,
} from "graphql";
import type { FederationVersion } from "../../specifications/federation.js";
import { SubgraphState } from "../../subgraph/state.js";
import type { SupergraphState } from "../state.js";

export type MapByGraph<T> = Map<string, T>;

export interface Key {
  fields: string;
  resolvable: boolean;
}

export interface Graph {
  name: string;
  id: string;
  version: FederationVersion;
  url?: string;
}

export interface TypeBuilder<T, S> {
  visitSubgraphState(
    graph: Graph,
    state: Map<string, S>,
    typeName: string,
    type: T,
  ): void;
  composeSupergraphNode(
    type: S,
    graphMap: Map<string, SubgraphState>,
    helpers: {
      graphNameToId(graphName: string): string | null;
      supergraphState: SupergraphState;
    },
  ): TypeDefinitionNode | DirectiveDefinitionNode;
}

export function convertToConst(nodes: DirectiveNode[]): ConstDirectiveNode[] {
  return nodes as ConstDirectiveNode[];
}
