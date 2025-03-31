import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function RequiredArgumentOrFieldIsNotInaccessibleRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    InputObjectTypeField(inputObjectState, fieldState) {
      if (
        !inputObjectState.inaccessible &&
        fieldState.inaccessible &&
        fieldState.type.endsWith("!")
      ) {
        context.reportError(
          new GraphQLError(
            `Input field "${inputObjectState.name}.${fieldState.name}" is @inaccessible but is a required input field of its type.`,
            {
              extensions: {
                code: "REQUIRED_INACCESSIBLE",
              },
            },
          ),
        );
      }
    },
    ObjectTypeFieldArg(objectState, fieldState, argState) {
      if (
        !fieldState.inaccessible &&
        argState.inaccessible &&
        argState.type.endsWith("!")
      ) {
        context.reportError(
          new GraphQLError(
            `Argument "${objectState.name}.${fieldState.name}(${argState.name}:)" is @inaccessible but is a required argument of its field.`,
            {
              extensions: {
                code: "REQUIRED_INACCESSIBLE",
              },
            },
          ),
        );
      }
    },
  };
}
