import { GraphQLError } from "graphql";
import { andList } from "../../../utils/format.js";
import { isRealExtension } from "../../composition/object-type.js";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function ExternalTypeMismatchRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      if (fieldState.usedAsKey) {
        // Ignore fields used as keys
        return;
      }

      const groupByType = new Map<string, string[]>();
      const graphsWithEqualType: string[] = [];

      for (const [graphId, field] of fieldState.byGraph) {
        const graphVersion =
          context.subgraphStates.get(graphId)!.federation.version;
        const isExternal =
          graphVersion === "v1.0"
            ? field.external &&
              isRealExtension(
                objectTypeState.byGraph.get(graphId)!,
                graphVersion,
              )
            : field.external;
        if (!isExternal) {
          graphsWithEqualType.push(graphId);

          continue;
        }

        if (field.type === fieldState.type) {
          graphsWithEqualType.push(graphId);
          continue;
        }

        const existing = groupByType.get(field.type);

        if (existing) {
          existing.push(graphId);
        } else {
          groupByType.set(field.type, [graphId]);
        }
      }

      if (groupByType.size && graphsWithEqualType.length) {
        const groups = Array.from(groupByType.entries()).map(
          ([type, graphs]) => {
            const plural = graphs.length > 1 ? "s" : "";
            return `type "${type}" in subgraph${plural} ${andList(
              graphs.map(context.graphIdToName),
              true,
              '"',
            )}`;
          },
        );
        const [first, ...rest] = groups;

        const nonExternal = `type "${fieldState.type}" in subgraph${
          graphsWithEqualType.length > 1 ? "s" : ""
        } ${andList(graphsWithEqualType.map(context.graphIdToName), true, '"')}`;

        context.reportError(
          new GraphQLError(
            `Type of field "${objectTypeState.name}.${
              fieldState.name
            }" is incompatible across subgraphs (where marked @external): it has ${nonExternal} but ${first}${
              rest.length ? ` and ${rest.join(" and ")}` : ""
            }`,
            {
              extensions: {
                code: "EXTERNAL_TYPE_MISMATCH",
              },
            },
          ),
        );
      }
    },
  };
}
