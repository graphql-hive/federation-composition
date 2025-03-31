import { ASTVisitor, FieldDefinitionNode, GraphQLError, Kind } from "graphql";
import { print } from "../../../../graphql/printer.js";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

// Supergraph context:
// - mark a field or type as external (with the subgraph's name)

export function ExternalRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "external", context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective("external", node)) {
        return;
      }

      // TODO: T12 check if interface types should be allowed in the @external directive
      const typeDef = context.typeNodeInfo.getTypeDef();
      const fieldDef = context.typeNodeInfo.getFieldDef();

      if (
        !typeDef ||
        !(
          typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
          typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
        )
      ) {
        return; // Let regular validation handle this, it should be applied on a field or an object
      }

      const fieldDefinitions: FieldDefinitionNode[] = [];

      if (fieldDef) {
        if (fieldDef.kind !== Kind.FIELD_DEFINITION) {
          return; // Let regular validation handle this, it should be applied on a field or an object
        }
        fieldDefinitions.push(fieldDef);
      } else {
        const fields = typeDef.fields;
        if (fields) {
          // In Federation v1, we do not mark all fields as @external
          if (context.satisfiesVersionRange(">= v2.0")) {
            fieldDefinitions.push(...fields);
          }
        }
      }

      for (const field of fieldDefinitions) {
        context.markAsExternal(`${typeDef.name.value}.${field.name.value}`);
        const conflictingDirectives = field.directives?.filter(
          (directive) =>
            context.isAvailableFederationDirective("tag", directive) ||
            context.isAvailableFederationDirective("inaccessible", directive),
        );

        if (
          conflictingDirectives?.length &&
          context.satisfiesVersionRange(">= v2.0")
        ) {
          for (const directive of conflictingDirectives) {
            context.reportError(
              new GraphQLError(
                `Cannot apply merged directive ${print(directive).trim()} to external field "${
                  typeDef.name.value
                }.${field.name.value}"`,
                {
                  nodes: node,
                  extensions: {
                    code: "MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL",
                  },
                },
              ),
            );
          }
        } else {
          context.stateBuilder.objectType.field.setExternal(
            typeDef.name.value,
            field.name.value,
          );
        }
      }
    },
  };
}
