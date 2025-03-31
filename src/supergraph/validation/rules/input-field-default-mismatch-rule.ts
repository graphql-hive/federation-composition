import { GraphQLError } from "graphql";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function InputFieldDefaultMismatchRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    InputObjectTypeField(inputObjectState, fieldState) {
      if (typeof fieldState.defaultValue !== "string") {
        return;
      }

      const defaultValueToGraphs = new Map<string | undefined, string[]>();

      fieldState.byGraph.forEach((field, graphName) => {
        if (typeof field.defaultValue === "string") {
          const existing = defaultValueToGraphs.get(field.defaultValue);

          if (existing) {
            existing.push(graphName);
          } else {
            defaultValueToGraphs.set(field.defaultValue, [graphName]);
          }
        }
      });

      if (defaultValueToGraphs.size > 1) {
        const groups = Array.from(defaultValueToGraphs.entries()).map(
          ([defaultValue, graphs]) => {
            const plural = graphs.length > 1 ? "s" : "";
            return `default value ${defaultValue} in subgraph${plural} "${graphs
              .map(context.graphIdToName)
              .join('", "')}"`;
          },
        );
        const [first, second, ...rest] = groups;
        context.reportError(
          new GraphQLError(
            `Input field "${inputObjectState.name}.${
              fieldState.name
            }" has incompatible default values across subgraphs: it has ${first} but ${second}${
              rest.length ? ` and ${rest.join(" and ")}` : ""
            }`,
            {
              extensions: {
                code: "INPUT_FIELD_DEFAULT_MISMATCH",
              },
            },
          ),
        );
      }
    },
  };
}
