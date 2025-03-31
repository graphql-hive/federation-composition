import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphState } from "../../state.js";
import type { SupergraphValidationContext } from "../validation-context.js";

/**
 * Fail on `@inaccessible` on object type fields if the corresponding interface field does not have `@inaccessible` applied.
 */
export function NoInaccessibleOnImplementedInterfaceFieldsRule(
  context: SupergraphValidationContext,
  supergraphState: SupergraphState,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      if (fieldState.inaccessible && objectTypeState.interfaces.size) {
        for (const interfaceName of objectTypeState.interfaces) {
          const interfaceType =
            supergraphState.interfaceTypes.get(interfaceName);
          if (!interfaceType) {
            continue;
          }
          const interfaceField = interfaceType.fields.get(fieldState.name);
          if (!interfaceField) {
            continue;
          }

          if (interfaceField.inaccessible === false) {
            const objectTypeFieldSchemaCoordinate =
              objectTypeState.name + "." + fieldState.name;
            const interfaceFieldSchemaCoordinate =
              interfaceName + "." + fieldState.name;
            context.reportError(
              new GraphQLError(
                `Field "${objectTypeFieldSchemaCoordinate}" is @inaccessible but implements the interface field "${interfaceFieldSchemaCoordinate}", which is in the API schema.`,
                {
                  extensions: {
                    code: "IMPLEMENTED_BY_INACCESSIBLE",
                  },
                },
              ),
            );
          }
        }
      }
    },
  };
}
