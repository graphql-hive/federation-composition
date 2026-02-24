import {
  type FieldNode,
  type SelectionSetNode,
  type InlineFragmentNode,
  GraphQLError,
  Kind,
  specifiedScalarTypes,
} from "graphql";
import { parseFields } from "../../../subgraph/helpers.js";
import { mergeScopePolicies } from "../../../utils/auth.js";
import { extractNamedTypeName } from "../../../utils/graphql.js";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphState } from "../../state.js";
import type { SupergraphValidationContext } from "../validation-context.js";
import type {
  ObjectTypeFieldState,
  ObjectTypeState,
} from "../../composition/object-type.js";
import type { InterfaceTypeState } from "../../composition/interface-type.js";
import type { UnionTypeState } from "../../composition/union-type.js";

/**
 * AuthOnRequiresRule validates that fields annotated with @requires directive
 * have appropriate auth directives (@authenticated, @requiresScopes, @policy)
 * to ensure transitive fields accessed via the @requires selection set are properly protected.
 */
export function AuthOnRequiresRule(
  context: SupergraphValidationContext,
  supergraph: SupergraphState,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      // Check each graph where this field is defined with @requires
      for (const [graphId, fieldInGraph] of fieldState.byGraph) {
        if (!fieldInGraph.requires) {
          continue;
        }

        // Parse the @requires selection set string into a SelectionSet AST
        const selectionSet = parseFields(fieldInGraph.requires);
        if (!selectionSet) {
          continue;
        }

        const provisionedAccess = new ProvisionedAccess(
          objectTypeState,
          fieldState,
        );

        // Recursively traverse the selection set and ensure access requirements are met
        let fieldLackingAccess = ensureAccessToSelectionSet(
          supergraph,
          objectTypeState,
          selectionSet,
          provisionedAccess,
        );

        if (fieldLackingAccess) {
          context.reportError(
            createAccessRequirementError(
              context.graphIdToName(graphId),
              `${objectTypeState.name}.${fieldState.name}`,
              fieldLackingAccess,
            ),
          );
          return;
        }
      }
    },
  };
}

type FieldCoordinate = `${string}.${string}`;
type TypeCoordinate = `${string}`;
type Coordinate = FieldCoordinate | TypeCoordinate;

function ensureAccessToSelectionSet(
  supergraph: SupergraphState,
  currentType: ObjectTypeState | InterfaceTypeState | UnionTypeState,
  selectionSet: SelectionSetNode,
  provisionedAccess: ProvisionedAccess,
): Coordinate | void {
  for (const selection of selectionSet.selections) {
    switch (selection.kind) {
      case Kind.FIELD: {
        // For union types, only __typename can be selected directly (or inline fragments).
        // When __typename is selected, we must verify access to all possible member types.
        if (currentType.kind === "union") {
          if (selection.name.value !== "__typename") {
            throw new Error("Cannot select fields directly on union types.");
          }

          for (const memberTypeName of currentType.members) {
            const memberType = supergraph.objectTypes.get(memberTypeName);
            if (memberType && !provisionedAccess.canAccess(memberType)) {
              return memberTypeName;
            }
          }

          return;
        }

        const fieldLackingAccess = ensureAccessToField(
          supergraph,
          currentType,
          selection,
          provisionedAccess,
        );

        if (fieldLackingAccess) {
          return fieldLackingAccess;
        }

        break;
      }
      case Kind.INLINE_FRAGMENT: {
        const fieldLackingAccess = ensureAccessToInlineFragment(
          supergraph,
          currentType,
          selection,
          provisionedAccess,
        );

        if (fieldLackingAccess) {
          return fieldLackingAccess;
        }

        break;
      }
      case Kind.FRAGMENT_SPREAD: {
        throw new Error("Fragment spreads are not supported in @requires.");
      }
    }
  }
}

function ensureAccessToField(
  supergraph: SupergraphState,
  currentType: ObjectTypeState | InterfaceTypeState,
  fieldNode: FieldNode,
  provisionedAccess: ProvisionedAccess,
): Coordinate | void {
  if (fieldNode.name.value === "__typename") {
    // __typename is always accessible when its parent type is accessible
    return;
  }

  let fieldName = fieldNode.name.value;

  let fieldState = currentType.fields.get(fieldNode.name.value);

  let fieldDetails: {
    type: string;
    scopes: string[][];
    policies: string[][];
    authenticated: boolean;
  } | null = null;

  if (fieldState) {
    fieldDetails = {
      type: fieldState.type,
      scopes: fieldState.scopes,
      policies: fieldState.policies,
      authenticated: fieldState.authenticated,
    };
  } else {
    if (currentType.kind === "interface") {
      throw new Error(
        `Field "${fieldNode.name.value}" not found on interface type "${currentType.name}".`,
      );
    }

    // Looks like the field is missing, possibly because it's defined on an interface object,
    // so we need to check interfaces implemented by this object type.
    // We need to create a field state that merges all interface definitions
    for (const interfaceName of currentType.interfaces) {
      const interfaceType = supergraph.interfaceTypes.get(interfaceName);

      if (!interfaceType) {
        throw new Error(
          `Interface "${interfaceName}" implemented by "${currentType.name}" not found in supergraph.`,
        );
      }

      const interfaceFieldState = interfaceType.fields.get(
        fieldNode.name.value,
      );

      if (interfaceFieldState) {
        if (!fieldDetails) {
          fieldDetails = {
            type: interfaceFieldState.type,
            scopes: mergeScopePolicies([], interfaceFieldState.scopes),
            policies: mergeScopePolicies([], interfaceFieldState.policies),
            authenticated: interfaceFieldState.authenticated,
          };
        } else {
          fieldDetails = {
            type: interfaceFieldState.type,
            scopes: mergeScopePolicies(
              fieldDetails.scopes,
              interfaceFieldState.scopes,
            ),
            policies: mergeScopePolicies(
              fieldDetails.policies,
              interfaceFieldState.policies,
            ),
            authenticated: interfaceFieldState.authenticated
              ? true
              : fieldDetails.authenticated,
          };
        }
      }
    }
  }

  if (fieldDetails === null) {
    throw new Error(
      `Field "${fieldName}" not found on type "${currentType.name}".`,
    );
  }

  if (!provisionedAccess.canAccess(fieldDetails)) {
    return `${currentType.name}.${fieldName}`;
  }

  const outputTypeName = extractNamedTypeName(fieldDetails.type);
  if (!outputTypeName) {
    throw new Error(
      `Unable to extract output type name from field "${currentType.name}.${fieldName}" type "${fieldDetails.type}".`,
    );
  }

  if (specifiedScalarTypes.some((s) => s.name === outputTypeName)) {
    // Specified scalars (Int, String, etc.) are always accessible
    return;
  }

  const outputType =
    supergraph.objectTypes.get(outputTypeName) ??
    supergraph.interfaceTypes.get(outputTypeName) ??
    supergraph.enumTypes.get(outputTypeName) ??
    supergraph.scalarTypes.get(outputTypeName) ??
    supergraph.unionTypes.get(outputTypeName);

  if (!outputType) {
    throw new Error(
      `Output type "${outputTypeName}" of field "${currentType.name}.${fieldName}" not found in supergraph.`,
    );
  }

  if (outputType.kind !== "union" && !provisionedAccess.canAccess(outputType)) {
    return `${currentType.name}.${fieldName}`;
  }

  // Nothing else to check if there is no selection set
  if (!fieldNode.selectionSet) {
    return;
  }

  if (outputType.kind === "enum" || outputType.kind === "scalar") {
    throw new Error(
      `Field "${currentType.name}.${fieldName}" of type "${outputType.name}" cannot have a selection set.`,
    );
  }

  return ensureAccessToSelectionSet(
    supergraph,
    outputType,
    fieldNode.selectionSet,
    provisionedAccess,
  );
}

function ensureAccessToInlineFragment(
  supergraph: SupergraphState,
  currentType: ObjectTypeState | InterfaceTypeState | UnionTypeState,
  inlineFragment: InlineFragmentNode,
  provisionedAccess: ProvisionedAccess,
): Coordinate | void {
  const concreteType = inlineFragment.typeCondition
    ? (supergraph.objectTypes.get(inlineFragment.typeCondition.name.value) ??
      supergraph.interfaceTypes.get(inlineFragment.typeCondition.name.value))
    : currentType;

  if (!concreteType) {
    throw new Error(
      `Type "${currentType.name}" not found in supergraph for inline fragment.`,
    );
  }

  if (concreteType.kind == "union") {
    throw new Error(
      "Cannot have inline fragments on union types without type conditions.",
    );
  }

  if (!provisionedAccess.canAccess(concreteType)) {
    return concreteType.name;
  }

  return ensureAccessToSelectionSet(
    supergraph,
    concreteType,
    inlineFragment.selectionSet,
    provisionedAccess,
  );
}

function createAccessRequirementError(
  graphName: string,
  fieldWithRequiresCoordinate: FieldCoordinate,
  authCoordinate: Coordinate,
) {
  const strDataRef = authCoordinate.includes(".")
    ? `field "${authCoordinate}"`
    : `type "${authCoordinate}"`;

  return new GraphQLError(
    `[${graphName}] Field "${fieldWithRequiresCoordinate}" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive ${strDataRef} data from @requires selection set.`,
    {
      extensions: {
        code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
      },
    },
  );
}

class ProvisionedAccess {
  public scopes: string[][];
  public policies: string[][];
  public authenticated: boolean;

  constructor(
    objectTypeState: ObjectTypeState,
    fieldState: ObjectTypeFieldState,
  ) {
    this.scopes = [];
    this.policies = [];
    this.authenticated = false;

    if (objectTypeState.authenticated) {
      this.authenticated = true;
    }

    if (objectTypeState.scopes.length > 0) {
      this.scopes = objectTypeState.scopes.slice();
    }

    if (objectTypeState.policies.length > 0) {
      this.policies = objectTypeState.policies.slice();
    }

    if (fieldState.authenticated) {
      this.authenticated = true;
    }

    if (fieldState.scopes.length > 0) {
      this.scopes = mergeScopePolicies(this.scopes, fieldState.scopes);
    }

    if (fieldState.policies.length > 0) {
      this.policies = mergeScopePolicies(this.policies, fieldState.policies);
    }
  }

  canAccess(required: {
    authenticated: boolean;
    policies: string[][];
    scopes: string[][];
  }): boolean {
    if (required.authenticated && !this.authenticated) {
      return false;
    }

    // Check scopes
    for (const requiredScopeGroup of required.scopes) {
      const satisfiedByAny = this.scopes.some((providedGroup) =>
        requiredScopeGroup.every((scope) => providedGroup.includes(scope)),
      );

      if (!satisfiedByAny) {
        return false;
      }
    }

    // Check policies
    for (const requiredPolicyGroup of required.policies) {
      const satisfiedByAny = this.policies.some((providedGroup) =>
        requiredPolicyGroup.every((policy) => providedGroup.includes(policy)),
      );

      if (!satisfiedByAny) {
        return false;
      }
    }

    return true;
  }
}
