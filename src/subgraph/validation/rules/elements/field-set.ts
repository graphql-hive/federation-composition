import { ASTNode, ASTVisitor, GraphQLError } from "graphql";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function FieldSetRules(context: SubgraphValidationContext): ASTVisitor {
  function validateFieldSet<
    T extends {
      name: { value: string };
    } & ASTNode,
  >(node: T, receivedType: string) {
    if (
      node.name.value === "FieldSet" &&
      context.isAvailableFederationType("FieldSet")
    ) {
      context.reportError(
        new GraphQLError(
          `Invalid definition for type FieldSet: FieldSet should be a ScalarType but is defined as a ${receivedType}`,
          {
            nodes: node,
            extensions: { code: "TYPE_DEFINITION_INVALID" },
          },
        ),
      );
    }
  }

  return {
    ScalarTypeDefinition(node) {
      if (
        node.name.value === "FieldSet" &&
        context.isAvailableFederationType("FieldSet")
      ) {
        context.markAsFederationDefinitionReplacement("FieldSet");
      }
    },
    ObjectTypeDefinition(node) {
      validateFieldSet(node, "ObjectType");
    },
    InterfaceTypeDefinition(node) {
      validateFieldSet(node, "InterfaceType");
    },
    UnionTypeDefinition(node) {
      validateFieldSet(node, "UnionType");
    },
    EnumTypeDefinition(node) {
      validateFieldSet(node, "EnumType");
    },
    InputObjectTypeDefinition(node) {
      validateFieldSet(node, "InputObjectType");
    },
  };
}
