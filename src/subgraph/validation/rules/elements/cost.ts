import { ASTVisitor, GraphQLError, Kind } from 'graphql';
import { validateDirectiveAgainstOriginal } from '../../../helpers.js';
import type { SubgraphValidationContext } from '../../validation-context.js';

export function CostRule(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, 'cost', context);
    },
    Directive(node, _key, _parent, paths, ancestors) {
      if (!context.isAvailableFederationDirective('cost', node)) {
        return;
      }

      const weightArg = node.arguments?.find(arg => arg.name.value === 'weight');

      if (!weightArg) {
        throw new Error('Expected @cost to have a "weight" argument');
      }

      if (weightArg.value.kind !== Kind.INT) {
        throw new Error('Expected "@cost(weight:)" to be of type Int');
      }

      let weight: number;
      try {
        weight = parseInt(weightArg.value.value, 10);
      } catch (error) {
        context.reportError(
          new GraphQLError(
            `Expected "@cost(weight:)" to be a valid integer, but got: ${weightArg.value.value}`,
            {
              extensions: {
                code: 'DIRECTIVE_COST_INVALID_WEIGHT',
              },
            },
          ),
        );
        return;
      }

      context.stateBuilder.markCostSpecAsUsed('cost', node.name.value);

      const directivesKeyAt = paths.findIndex(path => path === 'directives');

      if (directivesKeyAt === -1) {
        throw new Error('Could not find "directives" key in ancestors');
      }

      // Not sure why it's not `directivesKeyAt-1`
      const parent = ancestors[directivesKeyAt];

      if (!parent) {
        throw new Error('Could not find the node annotated with @cost');
      }

      if (Array.isArray(parent)) {
        throw new Error('Expected parent to be a single node');
      }

      if (!('kind' in parent)) {
        throw new Error('Expected parent to be a node');
      }

      switch (parent.kind) {
        case Kind.FIELD_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error('Could not find the parent type of the field annotated with @cost');
          }

          if (
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
          ) {
            context.stateBuilder.objectType.field.setCost(
              typeDef.name.value,
              parent.name.value,
              weight,
            );
          }

          if (
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION
          ) {
            context.stateBuilder.interfaceType.field.setCost(
              typeDef.name.value,
              parent.name.value,
              weight,
            );
          }
          break;
        }
        case Kind.INPUT_VALUE_DEFINITION:
          const typeDef = context.typeNodeInfo.getTypeDef();
          const fieldDef = context.typeNodeInfo.getFieldDef();

          if (!typeDef) {
            throw new Error('Could not find the parent type of the field annotated with @cost');
          }

          if (!fieldDef) {
            throw new Error('Could not find the parent field of the argument annotated with @cost');
          }

          if (
            typeDef.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION
          ) {
            context.stateBuilder.inputObjectType.field.setCost(
              typeDef.name.value,
              fieldDef.name.value,
              weight,
            );
          }

          if (
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
          ) {
            const argDef = context.typeNodeInfo.getArgumentDef();

            if (!argDef) {
              throw new Error('Could not find the argument annotated with @cost');
            }

            context.stateBuilder.objectType.field.arg.setCost(
              typeDef.name.value,
              fieldDef.name.value,
              argDef.name.value,
              weight,
            );
          }

          if (
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION
          ) {
            const argDef = context.typeNodeInfo.getArgumentDef();

            if (!argDef) {
              throw new Error('Could not find the argument annotated with @cost');
            }

            context.stateBuilder.interfaceType.field.arg.setCost(
              typeDef.name.value,
              fieldDef.name.value,
              argDef.name.value,
              weight,
            );
          }

          break;
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
          context.stateBuilder.objectType.setCost(parent.name.value, weight);
          break;
        case Kind.SCALAR_TYPE_DEFINITION:
        case Kind.SCALAR_TYPE_EXTENSION:
          context.stateBuilder.scalarType.setCost(parent.name.value, weight);
          break;
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_EXTENSION:
          context.stateBuilder.enumType.setCost(parent.name.value, weight);
          break;
      }
    },
  };
}
