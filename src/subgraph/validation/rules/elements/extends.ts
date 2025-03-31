import { ASTVisitor, Kind } from "graphql";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function ExtendsRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "extends", context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective("extends", node)) {
        return;
      }

      const typeDef = context.typeNodeInfo.getTypeDef();

      if (
        !typeDef ||
        !(
          typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
          typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION
        )
      ) {
        return; // Let regular validation handle this, it should be applied on a field
      }

      if (typeDef.kind === Kind.OBJECT_TYPE_DEFINITION) {
        context.stateBuilder.objectType.setExtension(
          typeDef.name.value,
          "@extends",
        );
      } else {
        context.stateBuilder.interfaceType.setExtension(typeDef.name.value);
      }

      const fields = typeDef.fields;

      for (const field of fields ?? []) {
        // TODO: T11 make sure it's actually correct to mark extended types as used
        context.markAsUsed(
          "@extends",
          typeDef.kind,
          typeDef.name.value,
          field.name.value,
        );
      }
    },
  };
}
