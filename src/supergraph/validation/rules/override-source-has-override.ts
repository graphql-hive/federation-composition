import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function OverrideSourceHasOverrideRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      if (fieldState.override === null) {
        return;
      }

      const graphsWithOverride = Array.from(fieldState.byGraph).filter(
        onlyWithOverride,
      );

      if (graphsWithOverride.length === 1) {
        return;
      }

      for (let i = 0; i < graphsWithOverride.length; i++) {
        // find any circular references
        const visitedGraphs = new Set<string>();
        const [graph, fieldStateInGraph] = graphsWithOverride[i];
        let overrideValue = context.graphNameToId(fieldStateInGraph.override);

        while (overrideValue) {
          if (visitedGraphs.has(overrideValue)) {
            context.reportError(
              new GraphQLError(
                `Field "${objectTypeState.name}.${
                  fieldState.name
                }" on subgraph "${context.graphIdToName(
                  graph,
                )}" is also marked with directive @override in subgraph "${context.graphIdToName(
                  overrideValue,
                )}". Only one @override directive is allowed per field.`,
                {
                  extensions: {
                    code: "OVERRIDE_SOURCE_HAS_OVERRIDE",
                  },
                },
              ),
            );
            break;
          }

          visitedGraphs.add(overrideValue);
          const graphFromOverride = overrideValue
            ? fieldState.byGraph.get(overrideValue)
            : null;

          if (!graphFromOverride) {
            break;
          }

          if (!graphFromOverride.override) {
            break;
          }

          overrideValue = context.graphNameToId(graphFromOverride.override);
        }
      }
    },
  };
}

function onlyWithOverride<
  T extends {
    override: null | string;
  },
>(entry: [string, T]): entry is [string, T & { override: string }] {
  return entry[1].override !== null;
}
