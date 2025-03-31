import { ASTVisitor, GraphQLError, Kind, SelectionSetNode } from "graphql";
import { print } from "../../../../graphql/printer.js";
import {
  getFieldsArgument,
  namedTypeFromTypeNode,
  parseFields,
  validateDirectiveAgainstOriginal,
  visitFields,
} from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function ProvidesRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "provides", context);
    },
    Directive(directiveNode) {
      if (!context.isAvailableFederationDirective("provides", directiveNode)) {
        return;
      }

      const annotatedType = context.typeNodeInfo.getTypeDef();
      const annotatedField = context.typeNodeInfo.getFieldDef();

      // `@provides` needs to be used on a field of an object type or interface type
      if (!annotatedType || !annotatedField) {
        // Let regular validation handle this
        return;
      }

      const fieldCoordinate = `${annotatedType.name.value}.${annotatedField.name.value}`;

      const usedOnInterface =
        annotatedType.kind === Kind.INTERFACE_TYPE_DEFINITION ||
        annotatedType?.kind === Kind.INTERFACE_TYPE_EXTENSION;

      const knownObjectsAndInterfaces =
        context.getSubgraphObjectOrInterfaceTypes();

      const outputType = namedTypeFromTypeNode(annotatedField.type);
      const targetType = knownObjectsAndInterfaces.get(outputType.name.value);

      if (!targetType) {
        context.reportError(
          new GraphQLError(
            `Invalid @provides directive on field "${fieldCoordinate}": field has type "${print(
              annotatedField.type,
            )}" which is not a Composite Type`,
            {
              nodes: directiveNode,
              extensions: {
                code: "PROVIDES_ON_NON_OBJECT_FIELD",
              },
            },
          ),
        );
        return;
      }

      if (usedOnInterface) {
        context.reportError(
          new GraphQLError(
            `Cannot use @provides on field "${fieldCoordinate}" of parent type "${annotatedType.name.value}": @provides is not yet supported within interfaces`,
            {
              nodes: directiveNode,
              extensions: { code: "PROVIDES_UNSUPPORTED_ON_INTERFACE" },
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

      if (fieldsArg.value.kind !== Kind.STRING) {
        context.reportError(
          new GraphQLError(
            `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): Invalid value for argument "fields": must be a string.`,
            {
              nodes: directiveNode,
              extensions: {
                code: "PROVIDES_INVALID_FIELDS_TYPE",
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
              `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): ${error.message}`,
              {
                nodes: directiveNode,
                extensions: {
                  code: "PROVIDES_INVALID_FIELDS",
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

      visitFields({
        context,
        selectionSet,
        typeDefinition: targetType,
        interceptFieldWithMissingSelectionSet(info) {
          isValid = false;
          context.reportError(
            new GraphQLError(
              `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): Invalid empty selection set for field "${info.typeDefinition.name.value}.${info.fieldName}" of non-leaf type ${info.outputType}`,
              {
                nodes: directiveNode,
                extensions: { code: "PROVIDES_INVALID_FIELDS" },
              },
            ),
          );
        },
        interceptUnknownField(info) {
          isValid = false;
          context.reportError(
            new GraphQLError(
              `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): Cannot query field "${info.fieldName}" on type "${info.typeDefinition.name.value}" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).`,
              {
                nodes: directiveNode,
                extensions: { code: "PROVIDES_INVALID_FIELDS" },
              },
            ),
          );
        },
        interceptDirective(info) {
          isValid = false;
          if (info.isKnown) {
            context.reportError(
              new GraphQLError(
                `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): cannot have directive applications in the @provides(fields:) argument but found @${info.directiveName}.`,
                {
                  nodes: directiveNode,
                  extensions: { code: "PROVIDES_DIRECTIVE_IN_FIELDS_ARG" },
                },
              ),
            );
          } else {
            context.reportError(
              new GraphQLError(
                `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): Unknown directive "@${info.directiveName}" in selection`,
                {
                  nodes: directiveNode,
                  extensions: { code: "PROVIDES_INVALID_FIELDS" },
                },
              ),
            );
          }
        },
        interceptArguments(info) {
          isValid = false;
          context.reportError(
            new GraphQLError(
              `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): field ${info.typeDefinition.name.value}.${info.fieldName} cannot be included because it has arguments (fields with argument are not allowed in @provides)`,
              {
                nodes: directiveNode,
                extensions: { code: "PROVIDES_FIELDS_HAS_ARGS" },
              },
            ),
          );
        },
        interceptNonExternalField(info) {
          if (context.satisfiesVersionRange("> v1.0")) {
            isValid = false;
            context.reportError(
              new GraphQLError(
                `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): field "${info.typeDefinition.name.value}.${info.fieldName}" should not be part of a @provides since it is already provided by this subgraph (it is not marked @external)`,
                {
                  extensions: {
                    code: "PROVIDES_FIELDS_MISSING_EXTERNAL",
                  },
                },
              ),
            );
          }
        },
        interceptExternalField(info) {
          // Oh, it hurts performance. We will fix it later. First, we need to make sure it works.
          const keyDirectives = info.typeDefinition.directives?.filter(
            (directive) =>
              context.isAvailableFederationDirective("key", directive),
          );

          // If a field is part of the @key but also part of the @provides
          // then it should not be marked @external (because it is already provided by this subgraph - historical/backward compatibility reasons...)

          if (!keyDirectives?.length) {
            return;
          }

          let interceptedFieldIsPrimaryKeyFromExtension = false;

          for (const keyDirective of keyDirectives) {
            if (interceptedFieldIsPrimaryKeyFromExtension) {
              break;
            }

            const fieldsArg = keyDirective.arguments?.find(
              (arg) =>
                arg.name.value === "fields" && arg.value.kind === Kind.STRING,
            );

            if (fieldsArg) {
              const keyFields = parseFields((fieldsArg.value as any).value);
              const mergedTypeDef = context
                .getSubgraphObjectOrInterfaceTypes()
                .get(info.typeDefinition.name.value);

              if (!mergedTypeDef) {
                throw new Error(
                  `Could not find type "${info.typeDefinition.name.value}"`,
                );
              }

              if (keyFields) {
                visitFields({
                  context,
                  selectionSet: keyFields,
                  typeDefinition: mergedTypeDef,
                  interceptField(keyFieldInfo) {
                    if (
                      keyFieldInfo.typeDefinition.name.value ===
                        info.typeDefinition.name.value &&
                      keyFieldInfo.fieldName === info.fieldName
                    ) {
                      const isInterfaceType =
                        keyFieldInfo.typeDefinition.kind ===
                          Kind.INTERFACE_TYPE_DEFINITION ||
                        keyFieldInfo.typeDefinition.kind ===
                          Kind.INTERFACE_TYPE_EXTENSION;

                      if (isInterfaceType) {
                        // If it's an interface, we shouldn't report it as an error
                        return;
                      }

                      const isExtension =
                        // Check if it's type extension
                        keyFieldInfo.typeDefinition.kind ===
                          Kind.OBJECT_TYPE_EXTENSION ||
                        keyFieldInfo.typeDefinition.kind ===
                          Kind.INTERFACE_TYPE_EXTENSION ||
                        // Check if type is marked with @extends
                        keyFieldInfo.typeDefinition.directives?.some(
                          (directive) =>
                            context.isAvailableFederationDirective(
                              "extends",
                              directive,
                            ),
                        );

                      // if it is an extension, we should report it as an error (historical thingy)
                      if (isExtension) {
                        interceptedFieldIsPrimaryKeyFromExtension = true;
                      }
                    }

                    if (
                      info.typeDefinition.kind ===
                        Kind.OBJECT_TYPE_DEFINITION ||
                      info.typeDefinition.kind === Kind.OBJECT_TYPE_EXTENSION
                    ) {
                      if (info.fieldName !== "__typename") {
                        context.stateBuilder.objectType.field.markAsProvided(
                          info.typeDefinition.name.value,
                          info.fieldName,
                        );
                      }
                    }
                  },
                });
              }
            }
          }

          if (
            context.satisfiesVersionRange(">= v2.0") &&
            interceptedFieldIsPrimaryKeyFromExtension
          ) {
            isValid = false;
            context.reportError(
              new GraphQLError(
                `On field "${fieldCoordinate}", for @provides(fields: ${printedFieldsValue}): field "${info.typeDefinition.name.value}.${info.fieldName}" should not be part of a @provides since it is already "effectively" provided by this subgraph (while it is marked @external, it is a @key field of an extension type, which are not internally considered external for historical/backward compatibility reasons)`,
                {
                  extensions: {
                    code: "PROVIDES_FIELDS_MISSING_EXTERNAL",
                  },
                },
              ),
            );
          }
        },
      });

      if (isValid) {
        context.stateBuilder.objectType.field.setProvides(
          annotatedType.name.value,
          annotatedField.name.value,
          fieldsArg.value.value,
        );
      }
    },
  };
}
