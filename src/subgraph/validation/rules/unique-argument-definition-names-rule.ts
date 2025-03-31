import {
  ASTVisitor,
  FieldDefinitionNode,
  GraphQLError,
  InputValueDefinitionNode,
  NameNode,
} from "graphql";

export function UniqueArgumentDefinitionNamesRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  return {
    DirectiveDefinition(directiveNode) {
      const argumentNodes = directiveNode.arguments ?? [];

      return checkArgUniqueness(`@${directiveNode.name.value}`, argumentNodes);
    },
    InterfaceTypeDefinition: checkArgUniquenessPerField,
    InterfaceTypeExtension: checkArgUniquenessPerField,
    ObjectTypeDefinition: checkArgUniquenessPerField,
    ObjectTypeExtension: checkArgUniquenessPerField,
  };

  function checkArgUniquenessPerField(typeNode: {
    readonly name: NameNode;
    readonly fields?: ReadonlyArray<FieldDefinitionNode> | undefined;
  }) {
    const typeName = typeNode.name.value;
    const fieldNodes = typeNode.fields ?? [];

    for (const fieldDef of fieldNodes) {
      const fieldName = fieldDef.name.value;
      const argumentNodes = fieldDef.arguments ?? [];

      checkArgUniqueness(`${typeName}.${fieldName}`, argumentNodes);
    }

    return false;
  }

  function checkArgUniqueness(
    parentName: string,
    argumentNodes: ReadonlyArray<InputValueDefinitionNode>,
  ) {
    const visitedArgumentNames = new Set<string>();

    for (const argDef of argumentNodes) {
      if (visitedArgumentNames.has(argDef.name.value)) {
        context.reportError(
          new GraphQLError(
            `Argument "${parentName}(${argDef.name.value}:)" can only be defined once.`,
            {
              extensions: {
                code: "INVALID_GRAPHQL",
              },
            },
          ),
        );
      } else {
        visitedArgumentNames.add(argDef.name.value);
      }
    }
  }
}
