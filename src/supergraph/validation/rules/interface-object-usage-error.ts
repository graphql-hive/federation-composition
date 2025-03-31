import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function InterfaceObjectUsageErrorRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    InterfaceType(interfaceState) {
      if (!interfaceState.hasInterfaceObject) {
        return;
      }

      for (const [_, interfaceStateInGraph] of interfaceState.byGraph) {
        if (!interfaceStateInGraph.isInterfaceObject) {
          return;
        }
      }

      context.reportError(
        new GraphQLError(
          `Type "${interfaceState.name}" is declared with @interfaceObject in all the subgraphs in which is is defined`,
          {
            extensions: {
              code: "INTERFACE_OBJECT_USAGE_ERROR",
            },
          },
        ),
      );
    },
  };
}
