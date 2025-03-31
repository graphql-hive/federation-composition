import { GraphQLError } from "graphql";
import { SupergraphValidationContext } from "../validation-context.js";

export function RequiredQueryRule(context: SupergraphValidationContext) {
  if (
    Array.from(context.subgraphStates.values()).every(
      (subgraph) => typeof subgraph.schema.queryType === "undefined",
    )
  ) {
    context.reportError(
      new GraphQLError(
        `No queries found in any subgraph: a supergraph must have a query root type.`,
        {
          extensions: {
            code: "NO_QUERIES",
          },
        },
      ),
    );
  }
}
