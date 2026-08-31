import { ASTVisitor, GraphQLError, Kind } from "graphql";
import { isValidContextName } from "../../../context.js";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function ContextDirectiveRules(
  context: SubgraphValidationContext,
): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "context", context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective("context", node)) {
        return;
      }

      context.stateBuilder.markSpecAsUsed("context");

      const typeDef = context.typeNodeInfo.getTypeDef();

      if (!typeDef) {
        return;
      }

      if (
        typeDef.kind !== Kind.OBJECT_TYPE_DEFINITION &&
        typeDef.kind !== Kind.OBJECT_TYPE_EXTENSION &&
        typeDef.kind !== Kind.INTERFACE_TYPE_DEFINITION &&
        typeDef.kind !== Kind.INTERFACE_TYPE_EXTENSION &&
        typeDef.kind !== Kind.UNION_TYPE_DEFINITION &&
        typeDef.kind !== Kind.UNION_TYPE_EXTENSION
      ) {
        return;
      }

      const name = node.arguments?.find(
        (arg) => arg.name.value === "name",
      )?.value;

      if (!name || name.kind !== Kind.STRING) {
        return;
      }

      if (!isValidContextName(name.value)) {
        context.reportError(
          new GraphQLError(
            `Context name "${name.value}" is invalid. It should have only alphanumeric characters.`,
            {
              nodes: node,
              extensions: { code: "CONTEXT_NAME_INVALID" },
            },
          ),
        );
      }

      switch (typeDef.kind) {
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
          context.stateBuilder.objectType.addContext(
            typeDef.name.value,
            name.value,
          );
          break;
        case Kind.INTERFACE_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_EXTENSION:
          context.stateBuilder.interfaceType.addContext(
            typeDef.name.value,
            name.value,
          );
          break;
        case Kind.UNION_TYPE_DEFINITION:
        case Kind.UNION_TYPE_EXTENSION:
          context.stateBuilder.unionType.addContext(
            typeDef.name.value,
            name.value,
          );
          break;
      }
    },
  };
}
