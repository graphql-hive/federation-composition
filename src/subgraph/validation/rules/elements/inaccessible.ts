import { ASTVisitor, Kind } from "graphql";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function InaccessibleRules(
  context: SubgraphValidationContext,
): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "inaccessible", context);
    },
    Directive(node, _key, _parent, paths, ancestors) {
      if (!context.isAvailableFederationDirective("inaccessible", node)) {
        return;
      }

      const directivesKeyAt = paths.findIndex((path) => path === "directives");

      if (directivesKeyAt === -1) {
        throw new Error('Could not find "directives" key in ancestors');
      }

      // Not sure why it's not `directivesKeyAt-1`
      const parent = ancestors[directivesKeyAt];

      if (!parent) {
        throw new Error("Could not find the node annotated with @inaccessible");
      }

      if (Array.isArray(parent)) {
        throw new Error("Expected parent to be a single node");
      }

      if (!("kind" in parent)) {
        throw new Error("Expected parent to be a node");
      }

      switch (parent.kind) {
        case Kind.SCALAR_TYPE_DEFINITION:
        case Kind.SCALAR_TYPE_EXTENSION:
          context.stateBuilder.scalarType.setInaccessible(parent.name.value);
          break;
        case Kind.FIELD_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the field annotated with @inaccessible",
            );
          }

          if (
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION
          ) {
            context.stateBuilder.interfaceType.field.setInaccessible(
              typeDef.name.value,
              parent.name.value,
            );
          } else {
            context.stateBuilder.objectType.field.setInaccessible(
              typeDef.name.value,
              parent.name.value,
            );
          }
          break;
        }
        case Kind.INPUT_VALUE_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the field annotated with @inaccessible",
            );
          }

          if (
            typeDef.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION
          ) {
            context.stateBuilder.inputObjectType.field.setInaccessible(
              typeDef.name.value,
              parent.name.value,
            );
          } else if (
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
          ) {
            const fieldDef = context.typeNodeInfo.getFieldDef();
            if (!fieldDef) {
              throw new Error(
                "Could not find the parent field of the input value annotated with @inaccessible",
              );
            }

            context.stateBuilder.objectType.field.arg.setInaccessible(
              typeDef.name.value,
              fieldDef.name.value,
              parent.name.value,
            );
          } else if (
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION
          ) {
            const fieldDef = context.typeNodeInfo.getFieldDef();
            if (!fieldDef) {
              throw new Error(
                "Could not find the parent field of the input value annotated with @inaccessible",
              );
            }

            context.stateBuilder.interfaceType.field.arg.setInaccessible(
              typeDef.name.value,
              fieldDef.name.value,
              parent.name.value,
            );
          } else if (typeDef.kind === Kind.DIRECTIVE_DEFINITION) {
            context.stateBuilder.directive.arg.setInaccessible(
              typeDef.name.value,
              parent.name.value,
            );
          }

          break;
        }
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
          context.stateBuilder.objectType.setInaccessible(parent.name.value);
          break;
        case Kind.INTERFACE_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_EXTENSION:
          context.stateBuilder.interfaceType.setInaccessible(parent.name.value);
          break;
        case Kind.UNION_TYPE_DEFINITION:
        case Kind.UNION_TYPE_EXTENSION:
          context.stateBuilder.unionType.setInaccessible(parent.name.value);
          break;
        case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        case Kind.INPUT_OBJECT_TYPE_EXTENSION:
          context.stateBuilder.inputObjectType.setInaccessible(
            parent.name.value,
          );
          break;
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_EXTENSION:
          context.stateBuilder.enumType.setInaccessible(parent.name.value);
          break;
        case Kind.ENUM_VALUE_DEFINITION: {
          const enumValue = parent.name.value;
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the enum value annotated with @inaccessible",
            );
          }

          context.stateBuilder.enumType.value.setInaccessible(
            typeDef.name.value,
            enumValue,
          );
          break;
        }
      }

      context.stateBuilder.markSpecAsUsed("inaccessible");
    },
  };
}
