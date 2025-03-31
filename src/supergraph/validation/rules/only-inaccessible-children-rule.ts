import { GraphQLError } from "graphql";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function OnlyInaccessibleChildrenRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  // If a type is not annotated with @inaccessible, but all of its fields are. We should error.
  // If a type is annotated with @inaccessible and all of its fields are as well, we should NOT error.

  return {
    EnumType(enumState) {
      if (
        enumState.inaccessible === false &&
        areAllInaccessible(enumState.values)
      ) {
        context.reportError(
          new GraphQLError(
            `Type "${enumState.name}" is in the API schema but all of its values are @inaccessible.`,
            {
              extensions: {
                code: "ONLY_INACCESSIBLE_CHILDREN",
              },
            },
          ),
        );
      }
    },
    ObjectType(objectState) {
      if (
        objectState.inaccessible === false &&
        areAllInaccessible(objectState.fields)
      ) {
        context.reportError(
          new GraphQLError(
            `Type "${objectState.name}" is in the API schema but all of its fields are @inaccessible.`,
            {
              extensions: {
                code: "ONLY_INACCESSIBLE_CHILDREN",
              },
            },
          ),
        );
      }
    },
    InterfaceType(interfaceState) {
      if (
        interfaceState.inaccessible === false &&
        areAllInaccessible(interfaceState.fields)
      ) {
        context.reportError(
          new GraphQLError(
            `Type "${interfaceState.name}" is in the API schema but all of its fields are @inaccessible.`,
            {
              extensions: {
                code: "ONLY_INACCESSIBLE_CHILDREN",
              },
            },
          ),
        );
      }
    },
    InputObjectType(inputObjectTypeState) {
      if (
        inputObjectTypeState.inaccessible === false &&
        areAllInaccessible(inputObjectTypeState.fields)
      ) {
        context.reportError(
          new GraphQLError(
            `Type "${inputObjectTypeState.name}" is in the API schema but all of its fields are @inaccessible.`,
            {
              extensions: {
                code: "ONLY_INACCESSIBLE_CHILDREN",
              },
            },
          ),
        );
      }
    },
  };
}

function areAllInaccessible<
  T extends {
    inaccessible?: boolean;
  },
>(childrenMap: Map<string, T>): boolean {
  return Array.from(childrenMap.values()).every((f) => f.inaccessible === true);
}
