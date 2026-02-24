import { GraphQLError } from "graphql";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function OverrideLabelWithRequiresRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      for (const [graphId, fieldStateInGraph] of fieldState.byGraph) {
        if (!fieldStateInGraph.override || !fieldStateInGraph.overrideLabel) {
          continue;
        }

        const sourceGraphId = context.graphNameToId(fieldStateInGraph.override);

        if (!sourceGraphId) {
          continue;
        }

        const sourceFieldStateInGraph = fieldState.byGraph.get(sourceGraphId);

        if (!sourceFieldStateInGraph?.requires) {
          continue;
        }

        context.reportError(
          new GraphQLError(
            `@override with label (progressive override) cannot be used on field "${objectTypeState.name}.${fieldState.name}" on subgraph "${context.graphIdToName(graphId)}" since "${objectTypeState.name}.${fieldState.name}" on "${context.graphIdToName(sourceGraphId)}" is marked with directive "@requires". Use non-progressive @override (without label) for this migration.`,
            {
              extensions: {
                code: "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
              },
            },
          ),
        );
      }
    },
  };
}
