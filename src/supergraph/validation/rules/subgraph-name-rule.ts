import { GraphQLError } from "graphql";
import { SupergraphValidationContext } from "../validation-context.js";

export function SubgraphNameRule(context: SupergraphValidationContext) {
  for (const [_, subgraph] of context.subgraphStates) {
    const id = subgraph.graph.id;
    if (id.startsWith("__")) {
      context.reportError(
        new GraphQLError(
          `Name "${id}" must not begin with "__", which is reserved by GraphQL introspection.`,
          {
            extensions: {
              code: "INVALID_GRAPHQL",
            },
          },
        ),
      );
    }
  }

  return {};
}
