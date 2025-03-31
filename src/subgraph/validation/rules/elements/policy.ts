import { ASTVisitor, GraphQLError, Kind } from "graphql";
import { print } from "../../../../graphql/printer.js";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function PolicyRule(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "policy", context);
    },
    Directive(node, _key, _parent, paths, ancestors) {
      if (!context.isAvailableFederationDirective("policy", node)) {
        return;
      }

      const policiesArg = node.arguments?.find(
        (arg) => arg.name.value === "policies",
      );

      if (!policiesArg) {
        throw new Error('Expected @policy to have a "policies" argument');
      }

      if (policiesArg.value.kind !== Kind.LIST) {
        throw new Error('Expected "@policy(policies:)" to be a list');
      }

      const policies: string[][] = [];
      for (const policyValues of policiesArg.value.values) {
        if (policyValues.kind !== Kind.LIST) {
          throw new Error(
            'Expected "@policy(policies:)" to be in [[policy__Policy!]!]! format',
          );
        }

        const policyOR: string[] = [];
        for (const policy of policyValues.values) {
          if (policy.kind !== Kind.STRING) {
            throw new Error(
              `Expected "@policy(policies:)" to be in [[policy__Policy!]!]! format, received [[${print(
                policiesArg.value,
              )}]!]!`,
            );
          }

          policyOR.push(policy.value);
        }
        policies.push(policyOR);
      }

      context.stateBuilder.markSpecAsUsed("policy");

      const directivesKeyAt = paths.findIndex((path) => path === "directives");

      if (directivesKeyAt === -1) {
        throw new Error('Could not find "directives" key in ancestors');
      }

      // Not sure why it's not `directivesKeyAt-1`
      const parent = ancestors[directivesKeyAt];

      if (!parent) {
        throw new Error("Could not find the node annotated with @policy");
      }

      if (Array.isArray(parent)) {
        throw new Error("Expected parent to be a single node");
      }

      if (!("kind" in parent)) {
        throw new Error("Expected parent to be a node");
      }

      switch (parent.kind) {
        case Kind.FIELD_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the field annotated with @policy",
            );
          }

          if (
            (typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
              typeDef.kind === Kind.OBJECT_TYPE_EXTENSION) &&
            !context.stateBuilder.isInterfaceObject(typeDef.name.value)
          ) {
            context.stateBuilder.objectType.field.setPolicies(
              typeDef.name.value,
              parent.name.value,
              policies,
            );
          }
          break;
        }
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
          context.stateBuilder.objectType.setPolicies(
            parent.name.value,
            policies,
          );
          break;
        case Kind.INTERFACE_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_DEFINITION:
          context.stateBuilder.interfaceType.setPolicies(
            parent.name.value,
            policies,
          );
          break;
        case Kind.SCALAR_TYPE_DEFINITION:
        case Kind.SCALAR_TYPE_EXTENSION:
          context.stateBuilder.scalarType.setPolicies(
            parent.name.value,
            policies,
          );
          break;
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_EXTENSION:
          context.stateBuilder.enumType.setPolicies(
            parent.name.value,
            policies,
          );
          break;
      }
    },
  };
}
