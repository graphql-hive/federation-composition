import { GraphQLError } from "graphql";
import { andList } from "../../../utils/format.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function LinkImportNameMismatchRule(
  context: SupergraphValidationContext,
) {
  // "<originalName>": { "<name>": ["<subgraphName>"] }
  const namesToSubgraphs = new Map<string, Map<string, string[]>>();

  const namesToCheck = ["@cost", "@listSize"];

  for (const [subgraphId, subgraphState] of context.subgraphStates) {
    for (const imp of subgraphState.federation.imports) {
      if (!namesToCheck.includes(imp.name)) {
        continue;
      }

      let existing = namesToSubgraphs.get(imp.name);

      if (!existing) {
        namesToSubgraphs.set(imp.name, new Map<string, string[]>());
        existing = namesToSubgraphs.get(imp.name)!;
      }

      const name = imp.alias ?? imp.name;
      let existingName = existing.get(name);

      if (!Array.isArray(existingName)) {
        existing.set(name, []);
        existingName = existing.get(name)!;
      }

      existingName.push(subgraphId);
    }
  }

  for (const [originalName, aliases] of namesToSubgraphs) {
    if (aliases.size <= 1) {
      continue;
    }

    context.reportError(
      new GraphQLError(
        `The import name "${originalName}" is imported with mismatched name between subgraphs: it is imported as ` +
          andList(
            Array.from(aliases).map(
              ([name, subgraphIds]) =>
                ` "${name}" in subgraph${subgraphIds.length > 1 ? "s" : ""} ${andList(subgraphIds.map(context.graphIdToName), false, '"')}`,
            ),
          ),
        {
          extensions: {
            code: "LINK_IMPORT_NAME_MISMATCH",
          },
        },
      ),
    );
  }
}
