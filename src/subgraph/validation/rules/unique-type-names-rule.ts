import { ASTVisitor, GraphQLError, TypeDefinitionNode } from "graphql";

export function UniqueTypeNamesRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  const knownTypeNames = new Set<string>();

  return {
    ScalarTypeDefinition: checkTypeName,
    ObjectTypeDefinition: checkTypeName,
    InterfaceTypeDefinition: checkTypeName,
    UnionTypeDefinition: checkTypeName,
    EnumTypeDefinition: checkTypeName,
    InputObjectTypeDefinition: checkTypeName,
  };

  function checkTypeName(node: TypeDefinitionNode) {
    const typeName = node.name.value;

    if (knownTypeNames.has(typeName)) {
      context.reportError(
        new GraphQLError(`There can be only one type named "${typeName}".`, {
          extensions: {
            code: "INVALID_GRAPHQL",
          },
        }),
      );
    } else {
      knownTypeNames.add(typeName);
    }
  }
}
