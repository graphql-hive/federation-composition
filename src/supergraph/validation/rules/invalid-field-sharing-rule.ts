import { GraphQLError } from "graphql";
import { andList } from "../../../utils/format.js";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphState } from "../../state.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function InvalidFieldSharingRule(
  context: SupergraphValidationContext,
  supergraphState: SupergraphState,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      // check if it's Subscription
      if (
        Array.from(objectTypeState.byGraph.keys()).some(
          (graph) =>
            context.subgraphStates.get(graph)?.schema.subscriptionType ===
            objectTypeState.name,
        )
      ) {
        if (fieldState.byGraph.size > 1) {
          context.reportError(
            new GraphQLError(
              `Fields on root level subscription object cannot be marked as shareable`,
              {
                extensions: {
                  code: "INVALID_FIELD_SHARING",
                },
              },
            ),
          );
        }
        return;
      }

      if (
        fieldState.usedAsKey &&
        Array.from(fieldState.byGraph.values()).every(
          (field) => field.usedAsKey,
        )
      ) {
        // If the field is used as a key in all graphs, we don't have to check if it's resolvable by multiple subgraphs.
        return;
      }

      const nonSharableIn: string[] = [];
      const resolvableIn: string[] = [];

      for (const [graphId, field] of fieldState.byGraph) {
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

        const fedV1FieldInExtension =
          field.version === "v1.0" && field.extension;

        if (
          fieldIsShareable ||
          fieldIsUsedAsKey ||
          (objectTypeState.isEntity && fedV1FieldInExtension)
        ) {
          resolvableIn.push(graphId);
          continue;
        }

        nonSharableIn.push(graphId);
        resolvableIn.push(graphId);
      }

      const interfaceObjectFieldIn: [
        string /* Graph ID */,
        string /* Interface name */,
      ][] = [];

      if (nonSharableIn.length > 0) {
        // Check if there are any @interfaceObject types that implement the field
        for (const interfaceName of objectTypeState.interfaces) {
          const interfaceState =
            supergraphState.interfaceTypes.get(interfaceName);

          if (!interfaceState || !interfaceState.hasInterfaceObject) {
            continue;
          }

          const interfaceObjectFieldState = interfaceState.fields.get(
            fieldState.name,
          );

          if (
            !interfaceObjectFieldState ||
            interfaceObjectFieldState.usedAsKey
          ) {
            continue;
          }

          for (const [graphId, field] of interfaceObjectFieldState.byGraph) {
            const isInterfaceObject =
              interfaceState.byGraph.get(graphId)?.isInterfaceObject === true;

            if (!isInterfaceObject) {
              continue;
            }

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

            interfaceObjectFieldIn.push([graphId, interfaceName]);

            if (fieldIsShareable || fieldIsUsedAsKey) {
              resolvableIn.push(graphId);
              continue;
            }

            nonSharableIn.push(graphId);
            resolvableIn.push(graphId);
          }
        }
      }

      if (nonSharableIn.length >= 1 && resolvableIn.length > 1) {
        const isNonSharableInAll = resolvableIn.every((graphId) =>
          nonSharableIn.includes(graphId),
        );

        const message = `Non-shareable field "${objectTypeState.name}.${
          fieldState.name
        }" is resolved from multiple subgraphs: it is resolved from subgraphs ${andList(
          resolvableIn.map((graphId) => {
            const name = context.graphIdToName(graphId);

            const interfaceObjectField = interfaceObjectFieldIn.find(
              ([g, _]) => g === graphId,
            );

            if (!interfaceObjectField) {
              return `"${name}"`;
            }

            return `"${name}" (through @interfaceObject field "${interfaceObjectField[1]}.${fieldState.name}")`;
          }),
          false,
        )} and defined as non-shareable in ${
          isNonSharableInAll
            ? "all of them"
            : `subgraph${nonSharableIn.length > 1 ? "s" : ""} ${andList(
                nonSharableIn.map(context.graphIdToName),
                true,
                '"',
              )}`
        }`;

        context.reportError(
          new GraphQLError(message, {
            extensions: {
              code: "INVALID_FIELD_SHARING",
            },
          }),
        );
      }
    },
    InterfaceTypeField(interfaceTypeState, fieldState) {
      if (!interfaceTypeState.hasInterfaceObject) {
        return;
      }

      // detect a non-shareable field in a type with @interfaceObject and implementations of the interface

      const nonSharableIn: string[] = [];
      const resolvableIn: string[] = [];
      const interfaceObjectFieldIn: string[] = [];

      for (const [graphId, field] of fieldState.byGraph) {
        const isInterfaceObject =
          interfaceTypeState.byGraph.get(graphId)?.isInterfaceObject === true;

        if (!isInterfaceObject) {
          continue;
        }

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

        if (fieldIsShareable || fieldIsUsedAsKey) {
          resolvableIn.push(graphId);
          continue;
        }

        nonSharableIn.push(graphId);
        resolvableIn.push(graphId);
        interfaceObjectFieldIn.push(graphId);
      }

      if (nonSharableIn.length >= 1 && resolvableIn.length > 1) {
        const isNonSharableInAll = resolvableIn.every((graphId) =>
          nonSharableIn.includes(graphId),
        );

        const message = `Non-shareable field "${interfaceTypeState.name}.${
          fieldState.name
        }" is resolved from multiple subgraphs: it is resolved from subgraphs ${andList(
          resolvableIn.map(context.graphIdToName),
          false,
          '"',
        )} and defined as non-shareable in ${
          isNonSharableInAll
            ? "all of them"
            : `subgraph${nonSharableIn.length > 1 ? "s" : ""} ${andList(
                nonSharableIn.map(context.graphIdToName),
                true,
                '"',
              )}`
        }`;

        context.reportError(
          new GraphQLError(message, {
            extensions: {
              code: "INVALID_FIELD_SHARING",
            },
          }),
        );
      }
    },
  };
}
