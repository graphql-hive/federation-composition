import {
  DirectiveDefinitionNode,
  DirectiveNode,
  FieldDefinitionNode,
  GraphQLError,
  InterfaceTypeDefinitionNode,
  InterfaceTypeExtensionNode,
  Kind,
  NamedTypeNode,
  NonNullTypeNode,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  OperationDefinitionNode,
  parse,
  SelectionSetNode,
  TypeNode,
} from "graphql";
import { print } from "../graphql/printer.js";
import { SubgraphValidationContext } from "./validation/validation-context.js";

export function validateDirectiveAgainstOriginal(
  providedDirectiveNode: DirectiveDefinitionNode,
  directiveName: string,
  context: SubgraphValidationContext,
) {
  if (
    !context.isAvailableFederationDirective(
      directiveName,
      providedDirectiveNode,
    )
  ) {
    return;
  }

  const isFederationV2 = context.satisfiesVersionRange(">= v2.0");

  const federationDirective = context
    .getKnownFederationDirectives()
    .find((d) => context.isAvailableFederationDirective(directiveName, d));

  if (!federationDirective) {
    throw new Error(`Federation directive @${directiveName} not found`);
  }

  const errors: GraphQLError[] = [];

  const original = {
    args: new Map(
      federationDirective.arguments?.map((arg) => [arg.name.value, arg]),
    ),
    locations: federationDirective.locations.map((loc) => loc.value),
  };
  const provided = {
    args: new Map(
      providedDirectiveNode.arguments?.map((arg) => [arg.name.value, arg]),
    ),
    locations: providedDirectiveNode.locations.map((loc) => loc.value),
  };

  for (const [argName, argDef] of original.args.entries()) {
    const providedArgNode = provided.args.get(argName);

    // Compares required arguments
    if (isNonNullTypeNode(argDef.type) && !providedArgNode) {
      errors.push(
        new GraphQLError(
          `Invalid definition for directive "@${directiveName}": missing required argument "${argName}"`,
          {
            nodes: providedDirectiveNode,
            extensions: { code: "DIRECTIVE_DEFINITION_INVALID" },
          },
        ),
      );
    }

    if (providedArgNode) {
      const expectedType = print(argDef.type);
      const providedType = print(providedArgNode.type);

      // TODO: let's clean it up, it's such a mess
      if (expectedType !== providedType) {
        const isNonNullableString = providedType === "String!";
        const allowedFieldSetTypes = isFederationV2
          ? ["FieldSet!", "federation__FieldSet!", "_FieldSet!", "[String!]!"]
          : ["_FieldSet!", "String", "String!"];
        const fieldSetTypesInSpec = isFederationV2
          ? ["FieldSet!", "federation__FieldSet!", "_FieldSet!", "[String!]!"]
          : ["_FieldSet!", "FieldSet!", "String"];
        const expectsFieldSet = fieldSetTypesInSpec.includes(expectedType);

        if (!isNonNullableString && expectsFieldSet) {
          // [T!]! should be accepted as well
          const isOneOfExpected = allowedFieldSetTypes
            .concat(allowedFieldSetTypes.map((f) => `[${f}]!`))
            .includes(providedType);

          if (!isOneOfExpected) {
            errors.push(
              new GraphQLError(
                // TODO: it should be `federation__FieldSet!` or `FieldSet!`, but it depends on the import
                `Invalid definition for directive "@${directiveName}": argument "${argName}" should have type "${expectedType}" but found type "${providedType}"`,
                {
                  nodes: providedDirectiveNode,
                  extensions: { code: "DIRECTIVE_DEFINITION_INVALID" },
                },
              ),
            );
          }
        }
      }

      // Compares default values
      // We care only about default values for booleans (only `@key` directive uses a default value anyway)
      if (
        expectedType === "Boolean" &&
        argDef.defaultValue?.kind === Kind.BOOLEAN
      ) {
        let providedValue: boolean | null = null;

        if (providedArgNode.defaultValue) {
          if (providedArgNode.defaultValue.kind !== Kind.BOOLEAN) {
            throw new Error("Expected a Boolean");
          }

          providedValue = providedArgNode.defaultValue.value;
        }

        if (argDef.defaultValue?.value !== providedValue) {
          errors.push(
            new GraphQLError(
              `Invalid definition for directive "@${directiveName}": argument "${argName}" should have default value ${
                argDef.defaultValue ? "true" : "false"
              } but found default value ${providedValue ?? "null"}`,
              {
                nodes: providedDirectiveNode,
                extensions: { code: "DIRECTIVE_DEFINITION_INVALID" },
              },
            ),
          );
        }
      }
    }
  }

  // Compares locations
  const locationIntersection = provided.locations.filter((loc) =>
    original.locations.includes(loc),
  );

  if (!locationIntersection.length) {
    errors.push(
      new GraphQLError(
        `Invalid definition for directive "@${directiveName}": "@${directiveName}" should have locations ${Array.from(
          original.locations,
        ).join(
          ", ",
        )}, but found (non-subset) ${Array.from(provided.locations).join(", ")}`,
        {
          nodes: providedDirectiveNode,
          extensions: { code: "DIRECTIVE_DEFINITION_INVALID" },
        },
      ),
    );
  }

  if (errors.length) {
    for (const error of errors) {
      context.reportError(error);
    }
  } else {
    // It has no errors, we can mark it as a replacement
    context.markAsFederationDefinitionReplacement(
      providedDirectiveNode.name.value,
    );
  }
}

type ObjectOrInterface =
  | ObjectTypeDefinitionNode
  | ObjectTypeExtensionNode
  | InterfaceTypeDefinitionNode
  | InterfaceTypeExtensionNode;

export function visitFields({
  context,
  selectionSet,
  typeDefinition,
  interceptField,
  interceptArguments,
  interceptUnknownField,
  interceptDirective,
  interceptInterfaceType,
  interceptExternalField,
  interceptNonExternalField,
  interceptFieldWithMissingSelectionSet,
}: {
  context: SubgraphValidationContext;
  selectionSet: SelectionSetNode;
  typeDefinition: ObjectOrInterface;
  interceptField?(info: {
    typeDefinition: ObjectOrInterface;
    fieldName: string;
  }): void;
  interceptFieldWithMissingSelectionSet?(info: {
    typeDefinition: ObjectOrInterface;
    fieldName: string;
    outputType: string;
  }): void;
  interceptArguments?(info: {
    typeDefinition: ObjectOrInterface;
    fieldName: string;
  }): void;
  interceptUnknownField?(info: {
    typeDefinition: ObjectOrInterface;
    fieldName: string;
  }): void;
  interceptDirective?(info: { directiveName: string; isKnown: boolean }): void;
  interceptInterfaceType?(info: {
    typeDefinition: ObjectOrInterface;
    fieldName: string;
  }): void;
  interceptExternalField?(info: {
    typeDefinition: ObjectOrInterface;
    fieldName: string;
  }): void;
  interceptNonExternalField?(info: {
    typeDefinition: ObjectOrInterface;
    fieldName: string;
  }): void;
}) {
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      continue; // TODO: we should error here I believe, but we need to check what Apollo Composition yields
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      if (!selection.typeCondition) {
        continue; // TODO: we should error here I believe, but we need to check what Apollo Composition yields
      }

      const interfaceName = selection.typeCondition!.name.value;
      const interfaceDefinition = context
        .getSubgraphObjectOrInterfaceTypes()
        .get(interfaceName);

      if (!interfaceDefinition) {
        continue;
      }

      visitFields({
        context,
        selectionSet: selection.selectionSet,
        typeDefinition: interfaceDefinition,
        interceptArguments,
        interceptUnknownField,
        interceptInterfaceType,
      });
      continue;
    }

    const selectionFieldDef: FieldDefinitionNode | undefined =
      selection.name.value === "__typename"
        ? {
            kind: Kind.FIELD_DEFINITION,
            name: {
              kind: Kind.NAME,
              value: "__typename",
            },
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: "String",
              },
            },
          }
        : typeDefinition.fields?.find(
            (field) => field.name.value === selection.name.value,
          );

    if (!selectionFieldDef) {
      if (interceptUnknownField) {
        interceptUnknownField({
          typeDefinition,
          fieldName: selection.name.value,
        });
      }
      break;
    }

    const isTypename = selection.name.value === "__typename";

    if (!isTypename && interceptDirective && selection.directives?.length) {
      for (const directive of selection.directives) {
        interceptDirective({
          directiveName: directive.name.value,
          isKnown: context
            .getSubgraphDirectiveDefinitions()
            .has(directive.name.value),
        });
      }
    }

    if (!isTypename) {
      context.markAsUsed(
        "fields",
        typeDefinition.kind,
        typeDefinition.name.value,
        selectionFieldDef.name.value,
      );
    }

    if (!isTypename && interceptField) {
      interceptField({
        typeDefinition,
        fieldName: selection.name.value,
      });
    }

    if (
      !isTypename &&
      selectionFieldDef.arguments?.length &&
      interceptArguments
    ) {
      interceptArguments({
        typeDefinition,
        fieldName: selection.name.value,
      });
      continue;
    }

    if (!isTypename && (interceptNonExternalField || interceptExternalField)) {
      const isExternal = selectionFieldDef.directives?.some((d) =>
        context.isAvailableFederationDirective("external", d),
      );
      const fieldName = selection.name.value;

      // ignore if it's not a leaf
      const fieldDef = typeDefinition.fields?.find(
        (field) => field.name.value === fieldName,
      );

      if (!fieldDef) {
        continue;
      }

      const namedType = namedTypeFromTypeNode(fieldDef.type);
      const isLeaf = context.isLeafType(namedType.name.value);

      if (isLeaf) {
        if (isExternal && interceptExternalField) {
          interceptExternalField({
            typeDefinition,
            fieldName,
          });
        } else if (!isExternal && interceptNonExternalField) {
          interceptNonExternalField({
            typeDefinition,
            fieldName,
          });
        }
      }
    }

    const outputType = namedTypeFromTypeNode(selectionFieldDef.type).name.value;
    const innerTypeDef = context
      .getSubgraphObjectOrInterfaceTypes()
      .get(outputType);

    if (!innerTypeDef) {
      continue;
    }

    if (
      !isTypename &&
      interceptInterfaceType &&
      (innerTypeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
        innerTypeDef.kind === Kind.INTERFACE_TYPE_EXTENSION)
    ) {
      interceptInterfaceType({
        typeDefinition,
        fieldName: selection.name.value,
      });
    }

    const innerSelection = selection.selectionSet;

    if (!innerSelection) {
      if (interceptFieldWithMissingSelectionSet) {
        interceptFieldWithMissingSelectionSet({
          typeDefinition,
          fieldName: selection.name.value,
          outputType: print(selectionFieldDef.type),
        });
      }
      continue;
    }

    visitFields({
      context,
      selectionSet: innerSelection,
      typeDefinition: innerTypeDef,
      interceptField,
      interceptArguments,
      interceptUnknownField,
      interceptInterfaceType,
      interceptDirective,
      interceptExternalField,
      interceptFieldWithMissingSelectionSet,
    });
  }
}

export function getFieldsArgument(directiveNode: DirectiveNode) {
  const fieldsArg = directiveNode.arguments?.find(
    (arg) => arg.name.value === "fields",
  );

  if (!fieldsArg) {
    return;
  }

  return fieldsArg;
}

export function parseFields(fields: string) {
  const parsed = parse(
    fields.trim().startsWith(`{`) ? `query ${fields}` : `query { ${fields} }`,
  ).definitions.find((d) => d.kind === Kind.OPERATION_DEFINITION) as
    | OperationDefinitionNode
    | undefined;

  return parsed?.selectionSet;
}

export function namedTypeFromTypeNode(type: TypeNode): NamedTypeNode {
  if (type.kind === Kind.NAMED_TYPE) {
    return type;
  }

  if (type.kind === Kind.LIST_TYPE) {
    return namedTypeFromTypeNode(type.type);
  }

  if (type.kind === Kind.NON_NULL_TYPE) {
    return namedTypeFromTypeNode(type.type);
  }

  throw new Error("Unknown type node: " + type);
}

export function isDirectiveDefinitionNode(
  node: any,
): node is DirectiveDefinitionNode {
  return node.kind === Kind.DIRECTIVE_DEFINITION;
}

export function printOutputType(type: TypeNode): string {
  if (type.kind === Kind.NAMED_TYPE) {
    return type.name.value;
  }

  if (type.kind === Kind.LIST_TYPE) {
    return `[${printOutputType(type.type)}]`;
  }

  return `${printOutputType(type.type)}!`;
}

function isNonNullTypeNode(node: TypeNode): node is NonNullTypeNode {
  return node.kind === Kind.NON_NULL_TYPE;
}
