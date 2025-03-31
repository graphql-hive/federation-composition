import {
  ASTNode,
  ASTVisitor,
  GraphQLError,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  TypeDefinitionNode,
  TypeExtensionNode,
} from "graphql";
import type { SubgraphValidationContext } from "../validation-context.js";

export function KnownRootTypeRule(
  context: SubgraphValidationContext,
): ASTVisitor {
  const { definitions } = context.getDocument();
  const typeNames = new Set(
    definitions
      .filter(isTypeDefinitionOrExtensionNode)
      .map((def) => def.name.value),
  );

  return {
    SchemaDefinition(node) {
      node.operationTypes.forEach((operationType) => {
        if (!typeNames.has(operationType.type.name.value)) {
          context.reportError(
            new GraphQLError(
              `Cannot set schema ${operationType.operation} root to unknown type ${operationType.type.name.value}`,
              {
                extensions: {
                  code: "INVALID_GRAPHQL",
                },
              },
            ),
          );
        }
      });
    },
  };
}

function isTypeDefinitionOrExtensionNode(
  node: ASTNode,
): node is TypeDefinitionNode | TypeExtensionNode {
  return isTypeDefinitionNode(node) || isTypeExtensionNode(node);
}
