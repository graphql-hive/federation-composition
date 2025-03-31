import { ASTVisitor, Kind } from "graphql";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function TagRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "tag", context);
    },
    Directive(node, _key, _parent, paths, ancestors) {
      if (!context.isAvailableFederationDirective("tag", node)) {
        return;
      }

      const nameArg = node.arguments?.find((arg) => arg.name.value === "name");

      if (!nameArg) {
        throw new Error('Expected @tag to have a "name" argument');
      }

      if (nameArg.value.kind !== Kind.STRING) {
        throw new Error('Expected "@tag(name:)" to be a string');
      }

      const directivesKeyAt = paths.findIndex((path) => path === "directives");

      if (directivesKeyAt === -1) {
        throw new Error('Could not find "directives" key in ancestors');
      }

      // Not sure why it's not `directivesKeyAt-1`
      const parent = ancestors[directivesKeyAt];

      // TODO: T18 Support @tag on ARGUMENT_DEFINITION

      if (!parent) {
        throw new Error("Could not find the node annotated with @inaccessible");
      }

      if (Array.isArray(parent)) {
        throw new Error("Expected parent to be a single node");
      }

      if (!("kind" in parent)) {
        throw new Error("Expected parent to be a node");
      }

      const tag = nameArg.value.value;

      switch (parent.kind) {
        case Kind.SCALAR_TYPE_DEFINITION:
        case Kind.SCALAR_TYPE_EXTENSION:
          context.stateBuilder.scalarType.setTag(parent.name.value, tag);
          break;
        case Kind.FIELD_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the field annotated with @tag",
            );
          }

          if (
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION ||
            context.stateBuilder.isInterfaceObject(typeDef.name.value)
          ) {
            context.stateBuilder.interfaceType.field.setTag(
              typeDef.name.value,
              parent.name.value,
              tag,
            );
          } else {
            context.stateBuilder.objectType.field.setTag(
              typeDef.name.value,
              parent.name.value,
              tag,
            );
          }
          break;
        }
        case Kind.INPUT_VALUE_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the field annotated with @tag",
            );
          }

          if (
            typeDef.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION
          ) {
            context.stateBuilder.inputObjectType.field.setTag(
              typeDef.name.value,
              parent.name.value,
              tag,
            );
          } else if (
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
          ) {
            const fieldDef = context.typeNodeInfo.getFieldDef();
            if (!fieldDef) {
              throw new Error(
                "Could not find the parent field of the input value annotated with @tag",
              );
            }

            context.stateBuilder.objectType.field.arg.setTag(
              typeDef.name.value,
              fieldDef.name.value,
              parent.name.value,
              tag,
            );
          } else if (
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION
          ) {
            const fieldDef = context.typeNodeInfo.getFieldDef();
            if (!fieldDef) {
              throw new Error(
                "Could not find the parent field of the input value annotated with @tag",
              );
            }

            context.stateBuilder.interfaceType.field.arg.setTag(
              typeDef.name.value,
              fieldDef.name.value,
              parent.name.value,
              tag,
            );
          } else if (typeDef.kind === Kind.DIRECTIVE_DEFINITION) {
            context.stateBuilder.directive.arg.setTag(
              typeDef.name.value,
              parent.name.value,
              tag,
            );
          }

          break;
        }
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
          context.stateBuilder.objectType.setTag(parent.name.value, tag);
          break;
        case Kind.INTERFACE_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_EXTENSION:
          context.stateBuilder.interfaceType.setTag(parent.name.value, tag);
          break;
        case Kind.UNION_TYPE_DEFINITION:
        case Kind.UNION_TYPE_EXTENSION:
          context.stateBuilder.unionType.setTag(parent.name.value, tag);
          break;
        case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        case Kind.INPUT_OBJECT_TYPE_EXTENSION:
          context.stateBuilder.inputObjectType.setTag(parent.name.value, tag);
          break;
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_EXTENSION:
          context.stateBuilder.enumType.setTag(parent.name.value, tag);
          break;
        case Kind.ENUM_VALUE_DEFINITION: {
          const enumValue = parent.name.value;
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the enum value annotated with @tag",
            );
          }

          context.stateBuilder.enumType.value.setTag(
            typeDef.name.value,
            enumValue,
            tag,
          );
          break;
        }
      }

      context.stateBuilder.markSpecAsUsed("tag");
    },
  };
}
