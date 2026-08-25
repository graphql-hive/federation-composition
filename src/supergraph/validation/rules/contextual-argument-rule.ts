import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function ContextualArgumentRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeFieldArg(objectState, fieldState, argState) {
      if (!argState.fromContext) {
        return;
      }

      const isRequiredSomewhere = Array.from(argState.byGraph.values()).some(
        (argInGraph) =>
          !argInGraph.fromContext &&
          argInGraph.type.endsWith("!") &&
          !argInGraph.defaultValue,
      );

      if (!isRequiredSomewhere) {
        return;
      }

      const coordinate = `${objectState.name}.${fieldState.name}(${argState.name}:)`;

      context.reportError(
        new GraphQLError(
          `Argument "${coordinate}" is contextual in at least one subgraph but in "${coordinate}" it does not have @fromContext, is not nullable and has no default value.`,
          {
            extensions: {
              code: "CONTEXTUAL_ARGUMENT_NOT_CONTEXTUAL_IN_ALL_SUBGRAPHS",
            },
          },
        ),
      );
    },
  };
}
