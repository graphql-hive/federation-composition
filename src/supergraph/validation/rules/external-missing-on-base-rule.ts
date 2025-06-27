import { GraphQLError } from "graphql";
import { andList } from "../../../utils/format.js";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function ExternalMissingOnBaseRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectType(objectTypeState) {
      if (
        Array.from(objectTypeState.byGraph).every(
          ([_, stateInGraph]) => stateInGraph.external === true,
        )
      ) {
        const subgraphs =
          objectTypeState.byGraph.size > 1 ? "subgraphs" : "subgraph";
        context.reportError(
          new GraphQLError(
            `Type "${
              objectTypeState.name
            }" is marked @external on all the subgraphs in which it is listed (${subgraphs} ${
              (andList(
                Array.from(objectTypeState.byGraph.keys()).map((graphId) =>
                  context.graphIdToName(graphId),
                ),
              ),
              true,
              '"')
            }).`,
            {
              extensions: {
                code: "EXTERNAL_MISSING_ON_BASE",
              },
            },
          ),
        );
      }
    },
    ObjectTypeField(objectState, fieldState) {
      // Check if the field is marked @external on all the subgraphs in which it is listed.
      if (
        Array.from(fieldState.byGraph).every(([graphId, fieldStateInGraph]) => {
          const graphVersion =
            context.subgraphStates.get(graphId)!.federation.version;

          if (fieldStateInGraph.usedAsKey) {
            return (
              fieldStateInGraph.external &&
              !objectState.byGraph.get(graphId)!.extension
            );
          }

          if (graphVersion === "v1.0") {
            // In Fed v1: if a field is provided or required but it's not @key field and it's marked as @external, it's an error
            if (fieldStateInGraph.external === true && fieldStateInGraph.used) {
              return true;
            }

            return false;
          }

          return fieldStateInGraph.external === true;
        })
      ) {
        const subgraphs =
          fieldState.byGraph.size > 1 ? "subgraphs" : "subgraph";
        context.reportError(
          new GraphQLError(
            `Field "${objectState.name}.${
              fieldState.name
            }" is marked @external on all the subgraphs in which it is listed (${subgraphs} ${andList(
              Array.from(fieldState.byGraph.keys()).map(context.graphIdToName),
              true,
              '"',
            )}).`,
            {
              extensions: {
                code: "EXTERNAL_MISSING_ON_BASE",
              },
            },
          ),
        );
      }
    },
  };
}
