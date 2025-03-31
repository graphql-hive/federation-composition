import { ASTVisitor, GraphQLError, Kind, SelectionSetNode } from "graphql";
import { print } from "../../../../graphql/printer.js";
import {
  getFieldsArgument,
  parseFields,
  validateDirectiveAgainstOriginal,
  visitFields,
} from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function RequiresRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "requires", context);
    },
    Directive(directiveNode) {
      if (!context.isAvailableFederationDirective("requires", directiveNode)) {
        return;
      }

      const annotatedType = context.typeNodeInfo.getTypeDef();
      const annotatedField = context.typeNodeInfo.getFieldDef();

      // `@requires` needs to be used on a field of an object type or interface type
      if (!annotatedType || !annotatedField) {
        // Let regular validation handle this
        return;
      }

      const fieldCoordinate = `${annotatedType.name.value}.${annotatedField.name.value}`;

      const usedOnInterface =
        annotatedType.kind === Kind.INTERFACE_TYPE_DEFINITION ||
        annotatedType?.kind === Kind.INTERFACE_TYPE_EXTENSION;

      if (annotatedField && usedOnInterface) {
        context.reportError(
          new GraphQLError(
            `Cannot use @requires on field "${fieldCoordinate}" of parent type "${annotatedType.name.value}": @requires is not yet supported within interfaces`,
            {
              nodes: directiveNode,
              extensions: { code: "REQUIRES_UNSUPPORTED_ON_INTERFACE" },
            },
          ),
        );
        return;
      }

      const fieldsArg = getFieldsArgument(directiveNode);

      if (!fieldsArg) {
        return;
      }

      const printedFieldsValue = print(fieldsArg.value);

      if (
        fieldsArg.value.kind !== Kind.STRING &&
        fieldsArg.value.kind !== Kind.ENUM
      ) {
        context.reportError(
          new GraphQLError(
            `On field "${fieldCoordinate}", for @requires(fields: ${printedFieldsValue}): Invalid value for argument "fields": must be a string.`,
            {
              nodes: directiveNode,
              extensions: {
                code: "REQUIRES_INVALID_FIELDS_TYPE",
              },
            },
          ),
        );
        return;
      }

      let selectionSet: SelectionSetNode | undefined;

      try {
        selectionSet = parseFields(fieldsArg.value.value);
      } catch (error) {
        if (error instanceof GraphQLError) {
          context.reportError(
            new GraphQLError(
              `On field "${fieldCoordinate}", for @requires(fields: ${printedFieldsValue}): ${error.message}`,
              {
                nodes: directiveNode,
                extensions: {
                  code: "REQUIRES_INVALID_FIELDS",
                },
              },
            ),
          );
          return;
        }

        throw error;
      }

      if (!selectionSet) {
        // error already reported
        return;
      }

      let isValid = true;

      if (
        annotatedType.kind !== Kind.INTERFACE_TYPE_DEFINITION &&
        annotatedType.kind !== Kind.INTERFACE_TYPE_EXTENSION &&
        annotatedType.kind !== Kind.OBJECT_TYPE_DEFINITION &&
        annotatedType.kind !== Kind.OBJECT_TYPE_EXTENSION
      ) {
        return;
      }

      const mergedTypeDef = context
        .getSubgraphObjectOrInterfaceTypes()
        .get(annotatedType.name.value);

      if (!mergedTypeDef) {
        throw new Error(`Could not find type "${annotatedType.name.value}"`);
      }

      visitFields({
        context,
        selectionSet,
        typeDefinition: mergedTypeDef,
        interceptField(info) {
          if (
            info.typeDefinition.kind === Kind.OBJECT_TYPE_DEFINITION ||
            info.typeDefinition.kind === Kind.OBJECT_TYPE_EXTENSION
          ) {
            if (info.fieldName !== "__typename") {
              context.stateBuilder.objectType.field.markedAsRequired(
                info.typeDefinition.name.value,
                info.fieldName,
              );
            }
          }
        },
        interceptUnknownField(info) {
          isValid = false;
          context.reportError(
            new GraphQLError(
              `On field "${fieldCoordinate}", for @requires(fields: ${printedFieldsValue}): Cannot query field "${info.fieldName}" on type "${info.typeDefinition.name.value}" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).`,
              {
                nodes: directiveNode,
                extensions: { code: "REQUIRES_INVALID_FIELDS" },
              },
            ),
          );
        },
        interceptDirective(info) {
          isValid = false;
          if (info.isKnown) {
            context.reportError(
              new GraphQLError(
                `On field "${fieldCoordinate}", for @requires(fields: ${printedFieldsValue}): cannot have directive applications in the @requires(fields:) argument but found @${info.directiveName}.`,
                {
                  nodes: directiveNode,
                  extensions: { code: "REQUIRES_DIRECTIVE_IN_FIELDS_ARG" },
                },
              ),
            );
          } else {
            context.reportError(
              new GraphQLError(
                `On field "${fieldCoordinate}", for @requires(fields: ${printedFieldsValue}): Unknown directive "@${info.directiveName}" in selection`,
                {
                  nodes: directiveNode,
                  extensions: { code: "REQUIRES_INVALID_FIELDS" },
                },
              ),
            );
          }
        },
        interceptNonExternalField(info) {
          if (context.satisfiesVersionRange("> v1.0")) {
            isValid = false;
            context.reportError(
              new GraphQLError(
                `On field "${fieldCoordinate}", for @requires(fields: ${printedFieldsValue}): field "${info.typeDefinition.name.value}.${info.fieldName}" should not be part of a @requires since it is already provided by this subgraph (it is not marked @external)`,
                {
                  extensions: {
                    code: "REQUIRES_FIELDS_MISSING_EXTERNAL",
                  },
                },
              ),
            );
          }
        },
      });

      if (isValid) {
        if (usedOnInterface) {
          context.stateBuilder.interfaceType.field.setRequires(
            annotatedType.name.value,
            annotatedField.name.value,
            fieldsArg.value.value,
          );
          return;
        }

        context.stateBuilder.objectType.field.setRequires(
          annotatedType.name.value,
          annotatedField.name.value,
          fieldsArg.value.value,
        );
      }
    },
  };
}
