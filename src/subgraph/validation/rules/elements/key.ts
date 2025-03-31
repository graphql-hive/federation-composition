import {
  ASTVisitor,
  BooleanValueNode,
  GraphQLError,
  Kind,
  SelectionSetNode,
  StringValueNode,
} from "graphql";
import { print } from "../../../../graphql/printer.js";
import {
  getFieldsArgument,
  parseFields,
  validateDirectiveAgainstOriginal,
  visitFields,
} from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function KeyRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "key", context);
    },
    Directive(directiveNode) {
      if (!context.isAvailableFederationDirective("key", directiveNode)) {
        return;
      }

      const typeDef = context.typeNodeInfo.getTypeDef();

      // `@key` needs to be used on an object type or an interface type
      if (!typeDef) {
        // Let regular validation handle this
        return;
      }

      const typeCoordinate = typeDef.name.value;

      const usedOnObject =
        typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
        typeDef.kind === Kind.OBJECT_TYPE_EXTENSION;
      const usedOnInterface =
        typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
        typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION ||
        (usedOnObject &&
          context.stateBuilder.isInterfaceObject(typeDef.name.value));

      if (!usedOnObject && !usedOnInterface) {
        return; // Let regular validation handle this
      }

      if (
        usedOnInterface &&
        context.satisfiesVersionRange("> v1.0") &&
        context.satisfiesVersionRange("< v2.3")
      ) {
        context.reportError(
          new GraphQLError(
            `Cannot use @key on interface "${typeCoordinate}": @key is not yet supported on interfaces`,
            {
              nodes: directiveNode,
              extensions: { code: "KEY_UNSUPPORTED_ON_INTERFACE" },
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
        // In Federation v1, a string ["id", "name"] is equal to "id name" (that is not true for Federation v2)
        const isListWithStrings =
          fieldsArg.value.kind === Kind.LIST &&
          fieldsArg.value.values.every((value) => value.kind === Kind.STRING);
        if (context.satisfiesVersionRange("> v1.0") || !isListWithStrings) {
          // V2
          context.reportError(
            new GraphQLError(
              `On type "${typeCoordinate}", for @key(fields: ${printedFieldsValue}): Invalid value for argument "fields": must be a string.`,
              {
                nodes: directiveNode,
                extensions: {
                  code: "KEY_INVALID_FIELDS_TYPE",
                },
              },
            ),
          );
          return;
        }
      }

      let selectionSet: SelectionSetNode | undefined;
      let normalizedFieldsArgValue =
        fieldsArg.value.kind === Kind.STRING
          ? fieldsArg.value
          : ({
              kind: Kind.STRING,
              value: fieldsArg.value.values
                .map((v) => {
                  if (v.kind !== Kind.STRING) {
                    // We checked if it's a string before, it should be at this point
                    throw new Error(
                      "Expected fields argument value to be a string",
                    );
                  }

                  return v.value;
                })
                .join(" "),
            } satisfies StringValueNode);

      if (normalizedFieldsArgValue.kind !== Kind.STRING) {
        // We checked if it's a string before, it should be at this point
        throw new Error("Expected fields argument value to be a string");
      }

      try {
        selectionSet = parseFields(normalizedFieldsArgValue.value);
      } catch (error) {
        if (error instanceof GraphQLError) {
          context.reportError(
            new GraphQLError(
              `On type "${typeCoordinate}", for @key(fields: ${printedFieldsValue}): ${error.message}`,
              {
                nodes: directiveNode,
                extensions: {
                  code: "KEY_INVALID_FIELDS",
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

      const knownObjectsAndInterfaces =
        context.getSubgraphObjectOrInterfaceTypes();

      let isValid = true;

      const fieldsUsedInKey = new Set<string>();

      const mergedTypeDef = context
        .getSubgraphObjectOrInterfaceTypes()
        .get(typeDef.name.value);

      if (!mergedTypeDef) {
        throw new Error(`Could not find type "${typeDef.name.value}"`);
      }

      visitFields({
        context,
        selectionSet,
        typeDefinition: mergedTypeDef,
        interceptField(info) {
          // Mark the field as used in the key when it's a field of the type annotated with @key
          if (info.typeDefinition.name.value === typeDef.name.value) {
            fieldsUsedInKey.add(info.fieldName);
          }
          context.markAsKeyField(
            `${info.typeDefinition.name.value}.${info.fieldName}`,
          );
        },
        interceptUnknownField(info) {
          isValid = false;
          context.reportError(
            new GraphQLError(
              `On type "${typeCoordinate}", for @key(fields: ${printedFieldsValue}): Cannot query field "${info.fieldName}" on type "${info.typeDefinition.name.value}" (the field should either be added to this subgraph or, if it should not be resolved by this subgraph, you need to add it to this subgraph with @external).`,
              {
                nodes: directiveNode,
                extensions: { code: "KEY_INVALID_FIELDS" },
              },
            ),
          );
        },
        interceptDirective(info) {
          isValid = false;
          if (info.isKnown) {
            context.reportError(
              new GraphQLError(
                `On type "${typeCoordinate}", for @key(fields: ${printedFieldsValue}): cannot have directive applications in the @key(fields:) argument but found @${info.directiveName}.`,
                {
                  nodes: directiveNode,
                  extensions: { code: "KEY_DIRECTIVE_IN_FIELDS_ARG" },
                },
              ),
            );
          } else {
            context.reportError(
              new GraphQLError(
                `On type "${typeCoordinate}", for @key(fields: ${printedFieldsValue}): Unknown directive "@${info.directiveName}"`,
                {
                  nodes: directiveNode,
                  extensions: { code: "KEY_INVALID_FIELDS" },
                },
              ),
            );
          }
        },
        interceptArguments(info) {
          isValid = false;
          context.reportError(
            new GraphQLError(
              `On type "${typeCoordinate}", for @key(fields: ${printedFieldsValue}): field ${info.typeDefinition.name.value}.${info.fieldName} cannot be included because it has arguments (fields with argument are not allowed in @key)`,
              {
                nodes: directiveNode,
                extensions: { code: "KEY_FIELDS_HAS_ARGS" },
              },
            ),
          );
        },
        interceptInterfaceType(info) {
          isValid = false;
          context.reportError(
            new GraphQLError(
              `On type "${typeCoordinate}", for @key(fields: ${printedFieldsValue}): field "${info.typeDefinition.name.value}.${info.fieldName}" is a Interface type which is not allowed in @key`,
              {
                nodes: directiveNode,
                extensions: { code: "KEY_FIELDS_SELECT_INVALID_TYPE" },
              },
            ),
          );
        },
      });

      // check if the key directive from the interface is implemented on all implementations

      if (usedOnInterface) {
        // TODO: It's a poor's man implementation of the check, we should compare the selected fields, but just a string
        const expectedFieldsValue = normalizedFieldsArgValue.value;
        knownObjectsAndInterfaces.forEach((def) => {
          if (
            def.interfaces?.some((i) => i.name.value === typeDef.name.value)
          ) {
            let shouldError = true;
            const keyDirectives = def.directives?.filter((d) =>
              context.isAvailableFederationDirective("key", d),
            );

            if (!!keyDirectives?.length) {
              for (const keyDirective of keyDirectives) {
                const fieldsArg = getFieldsArgument(keyDirective);

                if (
                  fieldsArg &&
                  fieldsArg.value.kind === Kind.STRING &&
                  fieldsArg.value.value === expectedFieldsValue
                ) {
                  shouldError = false;
                }
              }
            }

            if (shouldError && context.satisfiesVersionRange("> v1.0")) {
              isValid = false;
              context.reportError(
                new GraphQLError(
                  `Key @key(fields: ${printedFieldsValue}) on interface type "${typeDef.name.value}" is missing on implementation type "${def.name.value}".`,
                  {
                    nodes: directiveNode,
                    extensions: { code: "INTERFACE_KEY_NOT_ON_IMPLEMENTATION" },
                  },
                ),
              );
            }
          }
        });
      }

      if (isValid) {
        const resolvableArgValue = directiveNode.arguments?.find(
          (arg) =>
            arg.name.value === "resolvable" && arg.value.kind === Kind.BOOLEAN,
        )?.value as BooleanValueNode | undefined;

        const resolvable = resolvableArgValue?.value ?? true;

        if (usedOnInterface) {
          context.stateBuilder.interfaceType.setKey(
            typeDef.name.value,
            normalizedFieldsArgValue.value,
            fieldsUsedInKey,
            resolvable,
          );
          return;
        }

        context.stateBuilder.objectType.setKey(
          typeDef.name.value,
          normalizedFieldsArgValue.value,
          fieldsUsedInKey,
          resolvable,
        );
      }
    },
  };
}
