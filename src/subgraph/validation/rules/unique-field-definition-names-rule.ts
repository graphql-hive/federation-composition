import {
  ASTVisitor,
  FieldDefinitionNode,
  GraphQLError,
  InputValueDefinitionNode,
  NameNode,
} from "graphql";

export function UniqueFieldDefinitionNamesRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  const knownFieldNames = new Map<string, Set<string>>();

  return {
    InputObjectTypeDefinition: checkFieldUniqueness,
    InputObjectTypeExtension: checkFieldUniqueness,
    InterfaceTypeDefinition: checkFieldUniqueness,
    InterfaceTypeExtension: checkFieldUniqueness,
    ObjectTypeDefinition: checkFieldUniqueness,
    ObjectTypeExtension: checkFieldUniqueness,
  };

  function checkFieldUniqueness(node: {
    readonly name: NameNode;
    readonly fields?:
      | ReadonlyArray<InputValueDefinitionNode | FieldDefinitionNode>
      | undefined;
  }) {
    const typeName = node.name.value;

    if (!knownFieldNames.has(typeName)) {
      knownFieldNames.set(typeName, new Set());
    }

    const fieldNodes = node.fields ?? [];
    const fieldNames = knownFieldNames.get(typeName)!;

    for (const fieldDef of fieldNodes) {
      const fieldName = fieldDef.name.value;

      if (fieldNames.has(fieldName)) {
        context.reportError(
          new GraphQLError(
            `Field "${typeName}.${fieldName}" can only be defined once.`,
            {
              extensions: {
                code: "INVALID_GRAPHQL",
              },
            },
          ),
        );
      } else {
        fieldNames.add(fieldName);
      }
    }
  }
}
