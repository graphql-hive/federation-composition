import { ASTVisitor, Kind } from "graphql";
import { print } from "../../../../graphql/printer.js";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function RequiresScopesRule(
  context: SubgraphValidationContext,
): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "requiresScopes", context);
    },
    Directive(node, _key, _parent, paths, ancestors) {
      if (!context.isAvailableFederationDirective("requiresScopes", node)) {
        return;
      }

      const scopesArg = node.arguments?.find(
        (arg) => arg.name.value === "scopes",
      );

      if (!scopesArg) {
        throw new Error('Expected @requiresScopes to have a "scopes" argument');
      }

      if (scopesArg.value.kind !== Kind.LIST) {
        throw new Error('Expected "@requiresScopes(scopes:)" to be a list');
      }

      const scopes: string[][] = [];
      for (const scopesValues of scopesArg.value.values) {
        if (scopesValues.kind !== Kind.LIST) {
          throw new Error(
            'Expected "@requiresScopes(scopes:)" to be in [[requiresScopes__Scope!]!]! format',
          );
        }

        const scopesOR: string[] = [];
        for (const scope of scopesValues.values) {
          if (scope.kind !== Kind.STRING) {
            throw new Error(
              `Expected "@requiresScopes(scopes:)" to be in [[requiresScopes__Scope!]!]! format, received [[${print(
                scopesArg.value,
              )}]!]!`,
            );
          }

          scopesOR.push(scope.value);
        }
        scopes.push(scopesOR);
      }

      context.stateBuilder.markSpecAsUsed("requiresScopes");

      const directivesKeyAt = paths.findIndex((path) => path === "directives");

      if (directivesKeyAt === -1) {
        throw new Error('Could not find "directives" key in ancestors');
      }

      // Not sure why it's not `directivesKeyAt-1`
      const parent = ancestors[directivesKeyAt];

      if (!parent) {
        throw new Error(
          "Could not find the node annotated with @requiresScopes",
        );
      }

      if (Array.isArray(parent)) {
        throw new Error("Expected parent to be a single node");
      }

      if (!("kind" in parent)) {
        throw new Error("Expected parent to be a node");
      }

      switch (parent.kind) {
        case Kind.FIELD_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the field annotated with @requiresScopes",
            );
          }

          if (
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
          ) {
            context.stateBuilder.objectType.field.setScopes(
              typeDef.name.value,
              parent.name.value,
              scopes,
            );
          }
          break;
        }
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
          context.stateBuilder.objectType.setScopes(parent.name.value, scopes);
          break;
        case Kind.INTERFACE_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_DEFINITION:
          context.stateBuilder.interfaceType.setScopes(
            parent.name.value,
            scopes,
          );
          break;
        case Kind.SCALAR_TYPE_DEFINITION:
        case Kind.SCALAR_TYPE_EXTENSION:
          context.stateBuilder.scalarType.setScopes(parent.name.value, scopes);
          break;
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_EXTENSION:
          context.stateBuilder.enumType.setScopes(parent.name.value, scopes);
          break;
      }
    },
  };
}
