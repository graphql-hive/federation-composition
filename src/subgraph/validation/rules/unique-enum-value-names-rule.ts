import {
  ASTVisitor,
  EnumTypeDefinitionNode,
  EnumTypeExtensionNode,
  GraphQLError,
} from "graphql";

export function UniqueEnumValueNamesRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  const knownValueNames = new Map<string, Set<string>>();

  return {
    EnumTypeDefinition: checkValueUniqueness,
    EnumTypeExtension: checkValueUniqueness,
  };

  function checkValueUniqueness(
    node: EnumTypeDefinitionNode | EnumTypeExtensionNode,
  ) {
    const typeName = node.name.value;

    if (!knownValueNames.has(typeName)) {
      knownValueNames.set(typeName, new Set());
    }

    const valueNodes = node.values ?? [];
    const valueNames = knownValueNames.get(typeName)!;

    for (const valueDef of valueNodes) {
      const valueName = valueDef.name.value;

      if (valueNames.has(valueName)) {
        context.reportError(
          new GraphQLError(
            `Enum value "${typeName}.${valueName}" can only be defined once.`,
            {
              extensions: {
                code: "INVALID_GRAPHQL",
              },
            },
          ),
        );
      } else {
        valueNames.add(valueName);
      }
    }
  }
}
