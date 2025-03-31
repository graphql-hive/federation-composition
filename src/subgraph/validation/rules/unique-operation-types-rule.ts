import {
  ASTVisitor,
  GraphQLError,
  OperationTypeNode,
  SchemaDefinitionNode,
  SchemaExtensionNode,
} from "graphql";

export function UniqueOperationTypesRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  const definedOperationTypes = new Set<OperationTypeNode>();

  return {
    SchemaDefinition: checkOperationTypes,
    SchemaExtension: checkOperationTypes,
  };

  function checkOperationTypes(
    node: SchemaDefinitionNode | SchemaExtensionNode,
  ) {
    const operationTypesNodes = node.operationTypes || [];

    for (const operationType of operationTypesNodes) {
      const operation = operationType.operation;
      const alreadyDefinedOperationType = definedOperationTypes.has(operation);

      if (alreadyDefinedOperationType) {
        context.reportError(
          new GraphQLError(
            `There can be only one ${operation} type in schema.`,
            {
              extensions: {
                code: "INVALID_GRAPHQL",
              },
            },
          ),
        );
      } else {
        definedOperationTypes.add(operation);
      }
    }
  }
}
