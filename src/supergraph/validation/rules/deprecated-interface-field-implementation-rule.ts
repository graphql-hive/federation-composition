import { GraphQLError } from "graphql";
import {
  InterfaceTypeFieldState,
  InterfaceTypeState,
} from "../../composition/interface-type.js";
import {
  ObjectTypeFieldState,
  ObjectTypeState,
} from "../../composition/object-type.js";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphState } from "../../state.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function DeprecatedInterfaceFieldImplementationRule(
  context: SupergraphValidationContext,
  supergraph: SupergraphState,
): SupergraphVisitorMap {
  function check(
    typeState: ObjectTypeState | InterfaceTypeState,
    fieldState: ObjectTypeFieldState | InterfaceTypeFieldState,
  ) {
    if (!fieldState.deprecated) {
      return;
    }

    for (const interfaceName of typeState.interfaces) {
      const interfaceField = supergraph.interfaceTypes
        .get(interfaceName)
        ?.fields.get(fieldState.name);

      if (interfaceField && !interfaceField.deprecated) {
        context.reportError(
          new GraphQLError(
            `Interface field ${interfaceName}.${fieldState.name} is not deprecated, so implementation field ${typeState.name}.${fieldState.name} must not be deprecated.`,
            {
              extensions: {
                code: "INVALID_GRAPHQL",
              },
            },
          ),
        );
      }
    }
  }

  return {
    ObjectTypeField: check,
    InterfaceTypeField: check,
  };
}
