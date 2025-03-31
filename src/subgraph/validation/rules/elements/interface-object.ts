import { ASTVisitor, GraphQLError, Kind } from "graphql";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function InterfaceObjectRules(
  context: SubgraphValidationContext,
): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "interfaceObject", context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective("interfaceObject", node)) {
        return;
      }

      if (context.satisfiesVersionRange("< v2.3")) {
        context.reportError(
          new GraphQLError(
            `@interfaceObject is not yet supported. See https://github.com/graphql-hive/federation-composition/issues/7`,
            {
              extensions: { code: "UNSUPPORTED_FEATURE" },
            },
          ),
        );
        return;
      }

      const typeDef = context.typeNodeInfo.getTypeDef();

      if (!typeDef) {
        return;
      }

      if (
        typeDef.kind !== Kind.OBJECT_TYPE_DEFINITION &&
        typeDef.kind !== Kind.OBJECT_TYPE_EXTENSION
      ) {
        // handled by directive location validation
        return;
      }

      if (!typeDef.directives?.some((d) => d.name.value === "key")) {
        context.reportError(
          new GraphQLError(
            `The @interfaceObject directive can only be applied to entity types but type "${typeDef.name.value}" has no @key in this subgraph.`,
            {
              extensions: { code: "INTERFACE_OBJECT_USAGE_ERROR" },
            },
          ),
        );
      }
    },
  };
}
