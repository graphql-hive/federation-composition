import { GraphQLError } from "graphql";
import { parseFields } from "../../../subgraph/helpers.js";
import { TypeKind, type SubgraphState } from "../../../subgraph/state.js";
import type {
  ObjectTypeFieldState,
  ObjectTypeState,
} from "../../composition/object-type.js";
import type { SupergraphState } from "../../state.js";
import type { SupergraphValidationContext } from "../validation-context.js";
import {
  ensureAccessToSelectionSet,
  ProvisionedAccess,
} from "./auth-on-requires-rule.js";

export function AuthOnContextRule(
  context: SupergraphValidationContext,
  supergraph: SupergraphState,
) {
  return {
    ObjectTypeField(
      objectTypeState: ObjectTypeState,
      fieldState: ObjectTypeFieldState,
    ) {
      for (const { graphId, fromContext } of contextualArgs(fieldState)) {
        const subgraphState = context.subgraphStates.get(graphId);
        const selectionSet = parseFields(fromContext.selection);

        if (!subgraphState || !selectionSet) {
          continue;
        }

        const provisionedAccess = new ProvisionedAccess(
          objectTypeState,
          fieldState,
        );

        for (const providerName of findContextProviders(
          subgraphState,
          fromContext.context,
        )) {
          const providerType =
            supergraph.objectTypes.get(providerName) ??
            supergraph.interfaceTypes.get(providerName) ??
            supergraph.unionTypes.get(providerName);

          if (
            !providerType ||
            !ensureAccessToSelectionSet(
              supergraph,
              providerType,
              selectionSet,
              provisionedAccess,
            )
          ) {
            continue;
          }

          context.reportError(
            createContextAccessRequirementError(
              context.graphIdToName(graphId),
              `${objectTypeState.name}.${fieldState.name}`,
              `${context.graphIdToName(graphId)}__${fromContext.context}`,
            ),
          );
          return;
        }
      }
    },
  };
}

function contextualArgs(fieldState: ObjectTypeFieldState) {
  const args: Array<{
    graphId: string;
    fromContext: { context: string; selection: string };
  }> = [];

  for (const arg of fieldState.args.values()) {
    for (const [graphId, argInGraph] of arg.byGraph) {
      if (argInGraph.fromContext) {
        args.push({ graphId, fromContext: argInGraph.fromContext });
      }
    }
  }

  return args;
}

function findContextProviders(
  subgraphState: SubgraphState,
  contextName: string,
) {
  const providers: string[] = [];

  for (const [typeName, typeState] of subgraphState.types) {
    if (
      (typeState.kind === TypeKind.OBJECT ||
        typeState.kind === TypeKind.INTERFACE ||
        typeState.kind === TypeKind.UNION) &&
      typeState.contexts.has(contextName)
    ) {
      providers.push(typeName);
    }
  }

  return providers;
}

function createContextAccessRequirementError(
  graphName: string,
  fieldCoordinate: string,
  contextName: string,
) {
  return new GraphQLError(
    `[${graphName}] Field "${fieldCoordinate}" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive data in context ${contextName} from @fromContext selection set.`,
    {
      extensions: {
        code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
      },
    },
  );
}
