import { ASTVisitor, Kind } from "graphql";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function AuthenticatedRule(
  context: SubgraphValidationContext,
): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "authenticated", context);
    },
    Directive(node, _key, _parent, paths, ancestors) {
      if (!context.isAvailableFederationDirective("authenticated", node)) {
        return;
      }

      context.stateBuilder.markSpecAsUsed("authenticated");

      const directivesKeyAt = paths.findIndex((path) => path === "directives");

      if (directivesKeyAt === -1) {
        throw new Error('Could not find "directives" key in ancestors');
      }

      // Not sure why it's not `directivesKeyAt-1`
      const parent = ancestors[directivesKeyAt];

      if (!parent) {
        throw new Error(
          "Could not find the node annotated with @authenticated",
        );
      }

      if (Array.isArray(parent)) {
        throw new Error("Expected parent to be a single node");
      }

      if (!("kind" in parent)) {
        throw new Error("Expected parent to be a node");
      }

      // FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
      switch (parent.kind) {
        case Kind.FIELD_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the field annotated with @authenticated",
            );
          }

          if (
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
          ) {
            context.stateBuilder.objectType.field.setAuthenticated(
              typeDef.name.value,
              parent.name.value,
            );
          }
          break;
        }
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
          context.stateBuilder.objectType.setAuthenticated(parent.name.value);
          break;
        case Kind.INTERFACE_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_DEFINITION:
          context.stateBuilder.interfaceType.setAuthenticated(
            parent.name.value,
          );
          break;
        case Kind.SCALAR_TYPE_DEFINITION:
        case Kind.SCALAR_TYPE_EXTENSION:
          context.stateBuilder.scalarType.setAuthenticated(parent.name.value);
          break;
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_EXTENSION:
          context.stateBuilder.enumType.setAuthenticated(parent.name.value);
          break;
      }
    },
  };
}
