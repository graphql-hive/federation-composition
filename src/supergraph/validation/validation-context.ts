import { GraphQLError } from "graphql";
import type { SubgraphState } from "../../subgraph/state.js";

export type SupergraphValidationContext = ReturnType<
  typeof createSupergraphValidationContext
>;

export function createSupergraphValidationContext(
  subgraphStates: Map<string, SubgraphState>,
) {
  let reportedErrors: GraphQLError[] = [];

  const subgraphNameToIdMap: Record<string, string | undefined> = {};

  for (const [id, state] of subgraphStates) {
    subgraphNameToIdMap[state.graph.name] = id;
  }

  return {
    subgraphStates,
    graphIdToName(id: string) {
      const found = subgraphStates.get(id);

      if (!found) {
        throw new Error(`Could not find subgraph with id ${id}`);
      }

      return found.graph.name;
    },
    graphNameToId(name: string) {
      const found = subgraphNameToIdMap[name];

      return found ?? null;
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
