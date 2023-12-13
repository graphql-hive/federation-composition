import { GraphQLError } from 'graphql';
import { andList } from '../../../utils/format.js';
import type { SupergraphVisitorMap } from '../../composition/visitor.js';
import type { SupergraphValidationContext } from '../validation-context.js';

export function InvalidFieldSharingRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      if (
        fieldState.usedAsKey &&
        Array.from(fieldState.byGraph.values()).every(field => field.usedAsKey)
      ) {
        // If the field is used as a key in all graphs, we don't have to check if it's resolvable by multiple subgraphs.
        return;
      }

      const nonSharableIn: string[] = [];
      const resolvableIn: string[] = [];

      for (const [graphId, field] of fieldState.byGraph) {
        const objectTypeIsShareable = objectTypeState.byGraph.get(graphId)!.shareable;
        const fieldIsShareable = field.shareable;
        const fieldIsExternal = field.external;
        const fieldHasOverride = field.override;
        const fieldIsUsedAsKey = field.usedAsKey;

        if (fieldIsExternal) {
          continue;
        }

        if (fieldHasOverride) {
          const overrideGraphId = context.graphNameToId(fieldHasOverride);
          if (overrideGraphId && fieldState.byGraph.has(overrideGraphId)) {
            // if a field tries to override some graph, check if it actually exists there.
            // if it does, exclude it from invalid-field-sharing rule as override is effective.
            continue;
          }
        }

        if (objectTypeIsShareable || fieldIsShareable || fieldIsUsedAsKey) {
          resolvableIn.push(graphId);
          continue;
        }

        nonSharableIn.push(graphId);
        resolvableIn.push(graphId);
      }

      if (nonSharableIn.length >= 1 && resolvableIn.length > 1) {
        const isNonSharableInAll = resolvableIn.every(graphId => nonSharableIn.includes(graphId));

        const message = `Non-shareable field "${objectTypeState.name}.${
          fieldState.name
        }" is resolved from multiple subgraphs: it is resolved from subgraphs ${andList(
          resolvableIn.map(context.graphIdToName),
          false,
          '"',
        )} and defined as non-shareable in ${
          isNonSharableInAll
            ? 'all of them'
            : `subgraph${nonSharableIn.length > 1 ? 's' : ''} ${andList(
                nonSharableIn.map(context.graphIdToName),
                true,
                '"',
              )}`
        }`;

        context.reportError(
          new GraphQLError(message, {
            extensions: {
              code: 'INVALID_FIELD_SHARING',
            },
          }),
        );
      }
    },
  };
}
