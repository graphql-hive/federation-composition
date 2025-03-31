import { GraphQLError } from "graphql";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function ExtensionWithBaseRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectType(objectTypeState) {
      if (
        objectTypeState.name === "Query" ||
        objectTypeState.name === "Mutation" ||
        objectTypeState.name === "Subscription"
      ) {
        return;
      }

      if (!objectTypeState.hasDefinition) {
        // It looks like we should not report an error when:
        // - more than one subgraph defines the type
        // - all of the subgraphs use Fed v1 and annotate the type with @extend...
        // Don't @me about this... I'm just following the weird rules I discovered by writing shit ton of tests
        if (
          objectTypeState.byGraph.size > 1 &&
          Array.from(objectTypeState.byGraph).every(([graphId, meta]) =>
            context.subgraphStates.get(graphId)!.federation.version === "v1.0"
              ? meta.extensionType === "@extends"
              : false,
          )
        ) {
          return;
        }

        // Valid (but fails to detect)
        //  fed v1 - type @extends
        //  fed v1 - type @extends
        //  fed v1 - extend type
        //
        // Invalid (but fails to detect)
        //  fed v1 - type @extends
        //  fed v1 - extend type
        //

        objectTypeState.byGraph.forEach((_, graph) => {
          context.reportError(
            new GraphQLError(
              `[${context.graphIdToName(graph)}] Type "${
                objectTypeState.name
              }" is an extension type, but there is no type definition for "${
                objectTypeState.name
              }" in any subgraph.`,
              {
                extensions: {
                  code: "EXTENSION_WITH_NO_BASE",
                },
              },
            ),
          );
        });
      }
    },
  };
}
