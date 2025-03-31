import { ASTVisitor, GraphQLError } from "graphql";
import type { SubgraphValidationContext } from "../validation-context.js";

export function ReservedSubgraphNameRule(
  context: SubgraphValidationContext,
): ASTVisitor {
  if (context.getSubgraphName() === "_") {
    context.reportError(
      new GraphQLError(`Invalid name _ for a subgraph: this name is reserved`, {
        extensions: {
          code: "INVALID_SUBGRAPH_NAME",
        },
      }),
    );
  }

  return {};
}
