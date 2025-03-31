import {
  ASTNode,
  ASTVisitor,
  GraphQLError,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  isTypeSystemDefinitionNode,
  isTypeSystemExtensionNode,
  specifiedScalarTypes,
  TypeDefinitionNode,
  TypeExtensionNode,
} from "graphql";
import type { SubgraphValidationContext } from "../validation-context.js";

function isTypeDefinitionOrExtensionNode(
  node: ASTNode,
): node is TypeDefinitionNode | TypeExtensionNode {
  return isTypeDefinitionNode(node) || isTypeExtensionNode(node);
}

export function KnownTypeNamesRule(
  context: SubgraphValidationContext,
): ASTVisitor {
  const { definitions } = context.getDocument();

  const typeNames = new Set(
    definitions
      .filter(isTypeDefinitionOrExtensionNode)
      .map((def) => def.name.value),
  );

  return {
    NamedType(node, _1, parent, _2, ancestors) {
      const typeName = node.name.value;
      if (!typeNames.has(typeName)) {
        const definitionNode = ancestors[2] ?? parent;
        const isSDL = definitionNode != null && isSDLNode(definitionNode);
        if (isSDL && standardTypeNames.has(typeName)) {
          return;
        }

        context.reportError(
          new GraphQLError(`Unknown type ${typeName}`, {
            nodes: node,
            extensions: {
              code: "INVALID_GRAPHQL",
            },
          }),
        );
      }
    },
  };
}

const standardTypeNames = new Set<string>(
  [...specifiedScalarTypes].map((type) => type.name),
);

function isSDLNode(value: ASTNode | ReadonlyArray<ASTNode>): boolean {
  return (
    "kind" in value &&
    (isTypeSystemDefinitionNode(value) || isTypeSystemExtensionNode(value))
  );
}
