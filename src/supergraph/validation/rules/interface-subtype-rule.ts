import { GraphQLError } from "graphql";
import {
  isList,
  isNonNull,
  stripList,
  stripNonNull,
} from "../../../utils/state.js";
import { EnumTypeState } from "../../composition/enum-type.js";
import { InterfaceTypeState } from "../../composition/interface-type.js";
import { ObjectTypeState } from "../../composition/object-type.js";
import { ScalarTypeState } from "../../composition/scalar-type.js";
import { UnionTypeState } from "../../composition/union-type.js";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphState } from "../../state.js";
import { SupergraphValidationContext } from "../validation-context.js";

export function InterfaceSubtypeRule(
  context: SupergraphValidationContext,
  supergraph: SupergraphState,
): SupergraphVisitorMap {
  const implementationsMap = new Map<string, Set<string>>();

  for (const type of supergraph.interfaceTypes.values()) {
    // Store implementations by interface.
    for (const iface of type.interfaces) {
      const interfaceType = getTypeFromSupergraph(supergraph, iface);
      if (interfaceType && isInterfaceType(interfaceType)) {
        let implementations = implementationsMap.get(iface);
        if (implementations === undefined) {
          implementationsMap.set(iface, new Set([type.name]));
        } else {
          implementations.add(type.name);
        }
      }
    }
  }

  for (const type of supergraph.objectTypes.values()) {
    // Store implementations by objects.
    for (const iface of type.interfaces) {
      const interfaceType = getTypeFromSupergraph(supergraph, iface);
      if (interfaceType && isInterfaceType(interfaceType)) {
        let implementations = implementationsMap.get(iface);
        if (implementations === undefined) {
          implementationsMap.set(iface, new Set([type.name]));
        } else {
          implementations.add(type.name);
        }
      }
    }
  }

  return {
    ObjectTypeField(objectTypeState, fieldState) {
      if (objectTypeState.interfaces.size === 0) {
        return;
      }

      const interfaceNames = Array.from(objectTypeState.interfaces.values());

      for (const interfaceName of interfaceNames) {
        const interfaceState = supergraph.interfaceTypes.get(interfaceName);
        if (!interfaceState) {
          continue;
        }

        const interfaceField = interfaceState.fields.get(fieldState.name);
        if (!interfaceField) {
          continue;
        }

        if (
          !isTypeSubTypeOf(
            supergraph,
            implementationsMap,
            fieldState.type,
            interfaceField.type,
          )
        ) {
          context.reportError(
            new GraphQLError(
              `Interface field ${interfaceName}.${interfaceField.name} expects type ${interfaceField.type} but ${objectTypeState.name}.${fieldState.name} of type ${fieldState.type} is not a proper subtype.`,
              {
                extensions: {
                  code: "INVALID_GRAPHQL",
                },
              },
            ),
          );
        }
      }
    },
  };
}

/**
 * Provided a type and a super type, return true if the first type is either
 * equal or a subset of the second super type (covariant).
 */
function isTypeSubTypeOf(
  state: SupergraphState,
  implementationsMap: Map<string, Set<string>>,
  maybeSubTypeName: string,
  superTypeName: string,
): boolean {
  // Equivalent type is a valid subtype
  if (maybeSubTypeName === superTypeName) {
    return true;
  }

  // If superType is non-null, maybeSubType must also be non-null.
  if (isNonNull(superTypeName)) {
    if (isNonNull(maybeSubTypeName)) {
      return isTypeSubTypeOf(
        state,
        implementationsMap,
        stripNonNull(maybeSubTypeName),
        stripNonNull(superTypeName),
      );
    }
    return false;
  }
  if (isNonNull(maybeSubTypeName)) {
    // If superType is nullable, maybeSubType may be non-null or nullable.
    return isTypeSubTypeOf(
      state,
      implementationsMap,
      stripNonNull(maybeSubTypeName),
      superTypeName,
    );
  }

  // If superType type is a list, maybeSubType type must also be a list.
  if (isList(superTypeName)) {
    if (isList(maybeSubTypeName)) {
      return isTypeSubTypeOf(
        state,
        implementationsMap,
        stripList(maybeSubTypeName),
        stripList(superTypeName),
      );
    }
    return false;
  }
  if (isList(maybeSubTypeName)) {
    // If superType is not a list, maybeSubType must also be not a list.
    return false;
  }

  const superType = getTypeFromSupergraph(state, superTypeName);
  const maybeSubType = getTypeFromSupergraph(state, maybeSubTypeName);

  // The existence of the types was already validated.
  // If one of them does not exist, it means it's been reported by KnownTypeNamesRule.
  if (!superType || !maybeSubType) {
    return false;
  }

  // If superType type is an abstract type, check if it is super type of maybeSubType.
  // Otherwise, the child type is not a valid subtype of the parent type.
  return (
    isAbstractType(superType) &&
    (isInterfaceType(maybeSubType) || isObjectType(maybeSubType)) &&
    isSubType(implementationsMap, superType, maybeSubType)
  );
}

function getTypeFromSupergraph(state: SupergraphState, name: string) {
  return (
    state.objectTypes.get(name) ??
    state.interfaceTypes.get(name) ??
    state.unionTypes.get(name)
  );
}

function isSubType(
  implementationsMap: Map<string, Set<string>>,
  abstractType: InterfaceTypeState | UnionTypeState,
  maybeSubType: ObjectTypeState | InterfaceTypeState,
): boolean {
  if (isUnionType(abstractType)) {
    return abstractType.members.has(maybeSubType.name);
  }

  return (
    implementationsMap.get(abstractType.name)?.has(maybeSubType.name) ?? false
  );
}

type SupergraphType =
  | ObjectTypeState
  | EnumTypeState
  | ScalarTypeState
  | UnionTypeState
  | InterfaceTypeState;

function isAbstractType(
  type: SupergraphType,
): type is UnionTypeState | InterfaceTypeState {
  return isInterfaceType(type) || isUnionType(type);
}

function isObjectType(type: SupergraphType): type is ObjectTypeState {
  return type.kind === "object";
}

function isInterfaceType(type: SupergraphType): type is InterfaceTypeState {
  return type.kind === "interface";
}

function isUnionType(type: SupergraphType): type is UnionTypeState {
  return type.kind === "union";
}
