import {
  ASTVisitor,
  DefinitionNode,
  GraphQLError,
  isTypeDefinitionNode,
  OperationTypeNode,
  SchemaDefinitionNode,
  SchemaExtensionNode,
} from "graphql";
import type { SubgraphValidationContext } from "../validation-context.js";

function findDefaultRootTypes(definitions: readonly DefinitionNode[]) {
  const foundRootTypes: Record<OperationTypeNode, string | null> = {
    query: null,
    mutation: null,
    subscription: null,
  };

  const found = new Set<OperationTypeNode>();

  for (const definition of definitions) {
    if (found.size === 3) {
      break;
    }

    if (isTypeDefinitionNode(definition)) {
      if (definition.name.value === "Query") {
        foundRootTypes.query = "Query";
        found.add(OperationTypeNode.QUERY);
      } else if (definition.name.value === "Mutation") {
        foundRootTypes.mutation = "Mutation";
        found.add(OperationTypeNode.MUTATION);
      } else if (definition.name.value === "Subscription") {
        foundRootTypes.subscription = "Subscription";
        found.add(OperationTypeNode.SUBSCRIPTION);
      }
    }
  }

  return foundRootTypes;
}

function validateSchemaNode(
  node: SchemaDefinitionNode | SchemaExtensionNode,
  definitions: readonly DefinitionNode[],
  context: SubgraphValidationContext,
) {
  const definedDefaultRootTypes = findDefaultRootTypes(definitions);
  for (const operationType of node.operationTypes ?? []) {
    const defaultRootType = definedDefaultRootTypes[operationType.operation];
    const usedRootTypeName = operationType.type.name.value;

    if (defaultRootType && defaultRootType !== usedRootTypeName) {
      context.reportError(
        new GraphQLError(
          `The schema has a type named "${defaultRootType}" but it is not set as the ${operationType.operation} root type ("${usedRootTypeName}" is instead): this is not supported by federation. If a root type does not use its default name, there should be no other type with that default name.`,
          {
            nodes: node,
            extensions: {
              code: `ROOT_${operationType.operation.toUpperCase()}_USED`,
            },
          },
        ),
      );
    }
  }
}

export function RootTypeUsedRule(
  context: SubgraphValidationContext,
): ASTVisitor {
  const { definitions } = context.getDocument();

  return {
    SchemaDefinition(node) {
      validateSchemaNode(node, definitions, context);
    },
    SchemaExtension(node) {
      validateSchemaNode(node, definitions, context);
    },
  };
}
