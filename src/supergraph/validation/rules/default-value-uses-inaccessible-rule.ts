import { GraphQLError } from "graphql";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphState } from "../../state.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function DefaultValueUsesInaccessibleRule(
  context: SupergraphValidationContext,
  supergraph: SupergraphState,
): SupergraphVisitorMap {
  return {
    InputObjectTypeField(inputObjectState, fieldState) {
      if (
        typeof fieldState.defaultValue !== "string" ||
        // If the field or type is already inaccessible, we do not need to assert whether the default value would be accessible or not.
        fieldState.inaccessible
      ) {
        return;
      }

      detectInaccessibleDefaultValue(
        context,
        () => `${inputObjectState.name}.${fieldState.name}`,
        fieldState.type,
        fieldState.defaultValue,
        supergraph.enumTypes,
      );
    },
    ObjectTypeFieldArg(objectState, fieldState, argState) {
      if (typeof argState.defaultValue !== "string") {
        return;
      }

      if (argState.inaccessible) {
        return;
      }

      detectInaccessibleDefaultValue(
        context,
        () => `${objectState.name}.${fieldState.name}(${argState.name}:)`,
        argState.type,
        argState.defaultValue,
        supergraph.enumTypes,
      );
    },
  };
}

function detectInaccessibleDefaultValue(
  context: SupergraphValidationContext,
  schemaCoordinate: () => string,
  outputType: string,
  defaultValue: string,
  enumTypes: SupergraphState["enumTypes"],
) {
  // TODO: another example why we should switch from strings to AST (but maybe enhanced with the string for ease of use)
  const outputTypeName = outputType.replace(/[\[\]\!]+/g, "");
  const enumType = enumTypes.get(outputTypeName);

  if (!enumType) {
    // Only enum value can be used as a default value and be marked as inaccessible
    return;
  }

  if (
    enumType.inaccessible === true ||
    enumType.values.get(defaultValue)?.inaccessible === true
  ) {
    context.reportError(
      new GraphQLError(
        `Enum value "${outputTypeName}.${defaultValue}" is @inaccessible but is used in the default value of "${schemaCoordinate()}", which is in the API schema.`,
        {
          extensions: {
            code: "DEFAULT_VALUE_USES_INACCESSIBLE",
          },
        },
      ),
    );
  }
}
