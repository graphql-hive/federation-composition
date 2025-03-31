import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function InputObjectValuesRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    InputObjectType(inputObjectTypeState) {
      const fieldsInCommon: string[] = [];
      const total = inputObjectTypeState.byGraph.size;
      for (const [fieldName, fieldState] of inputObjectTypeState.fields) {
        // If it's not used in all the subgraphs, it's missing in some of them
        if (fieldState.byGraph.size === total) {
          fieldsInCommon.push(fieldName);
        }
      }
      if (fieldsInCommon.length === 0) {
        context.reportError(
          new GraphQLError(
            `None of the fields of input object type "${inputObjectTypeState.name}" are consistently defined in all the subgraphs defining that type. As only fields common to all subgraphs are merged, this would result in an empty type.`,
            {
              extensions: {
                code: "EMPTY_MERGED_INPUT_TYPE",
              },
            },
          ),
        );
      }
    },
  };
}
