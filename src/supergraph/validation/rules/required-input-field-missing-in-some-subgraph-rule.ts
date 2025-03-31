import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function RequiredInputFieldMissingInSomeSubgraphRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    InputObjectTypeField(inputObjectState, fieldState) {
      if (fieldState.type.endsWith("!")) {
        // if the input object is defined in a single graph, this rule can be ignored
        if (inputObjectState.byGraph.size === 1) {
          return;
        }

        // if the field is defined in all graphs, this rule can be ignored
        if (inputObjectState.byGraph.size === fieldState.byGraph.size) {
          return;
        }

        const graphsWithRequiredField = Array.from(fieldState.byGraph)
          .filter(([_, field]) => field.type.endsWith("!"))
          .map(([graph]) => graph);
        const graphsWithoutField = Array.from(
          inputObjectState.byGraph.keys(),
        ).filter((graph) => !fieldState.byGraph.has(graph));
        const requiredIn = `subgraph${
          graphsWithRequiredField.length > 1 ? "s" : ""
        } "${graphsWithRequiredField.map(context.graphIdToName).join('", "')}"`;
        const missingIn = `subgraph${graphsWithoutField.length > 1 ? "s" : ""} "${graphsWithoutField
          .map(context.graphIdToName)
          .join('", "')}"`;
        context.reportError(
          new GraphQLError(
            `Input object field "${inputObjectState.name}.${fieldState.name}" is required in some subgraphs but does not appear in all subgraphs: it is required in ${requiredIn} but does not appear in ${missingIn}`,
            {
              extensions: {
                code: "REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH",
              },
            },
          ),
        );
      }
    },
  };
}
