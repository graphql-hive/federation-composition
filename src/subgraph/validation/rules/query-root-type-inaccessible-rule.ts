import { ASTVisitor, GraphQLError, OperationTypeNode } from "graphql";
import type { SubgraphValidationContext } from "../validation-context.js";

export function QueryRootTypeInaccessibleRule(
  context: SubgraphValidationContext,
): ASTVisitor {
  let rootTypeName = "Query";

  return {
    SchemaDefinition(node) {
      const nonQueryType = node.operationTypes?.find(
        (operationType) =>
          operationType.operation === OperationTypeNode.QUERY &&
          operationType.type.name.value !== "Query",
      );

      if (nonQueryType) {
        rootTypeName = nonQueryType.type.name.value;
      }
    },
    SchemaExtension(node) {
      const nonQueryType = node.operationTypes?.find(
        (operationType) =>
          operationType.operation === OperationTypeNode.QUERY &&
          operationType.type.name.value !== "Query",
      );

      if (nonQueryType) {
        rootTypeName = nonQueryType.type.name.value;
      }
    },
    ObjectTypeDefinition(node) {
      const name = node.name.value;

      if (name !== rootTypeName) {
        return;
      }

      if (
        node.directives?.some((directive) =>
          context.isAvailableFederationDirective("inaccessible", directive),
        )
      ) {
        context.reportError(
          new GraphQLError(
            `Type "Query" is @inaccessible but is the root query type, which must be in the API schema.`,
            {
              nodes: node,
              extensions: { code: "QUERY_ROOT_TYPE_INACCESSIBLE" },
            },
          ),
        );
      }
    },
  };
}
