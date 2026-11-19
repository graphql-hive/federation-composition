import {
  ASTVisitor,
  GraphQLError,
  Kind,
  specifiedScalarTypes,
  TypeNode,
  ValueNode,
} from "graphql";
import { print } from "../../../graphql/printer.js";
import { namedTypeFromTypeNode } from "../../helpers.js";
import type { SimpleValidationContext } from "../validation-context.js";

export function ProvidedArgumentsOnDirectivesRule(
  context: SimpleValidationContext,
): ASTVisitor {
  return {
    Directive: {
      // Validate on leave to allow for deeper errors to appear first.
      leave(directiveNode, _k, _p, _pp, ancestors) {
        const directiveName = directiveNode.name.value;
        const directiveDefinition =
          context.getKnownDirectiveDefinition(directiveName);

        if (!directiveDefinition) {
          return; // Let KnownDirectivesRule handle this
        }

        const args = directiveNode.arguments;
        if (args && directiveDefinition.arguments) {
          const coordinate = context.getSchemaCoordinate(ancestors);

          for (const arg of args) {
            const argDefinition = directiveDefinition.arguments.find(
              (a) => a.name.value === arg.name.value,
            );

            if (
              argDefinition &&
              arg.value &&
              // `null` for a non-null argument is reported by
              // RequiredArgumentsOnDirectivesRule, not here
              arg.value.kind !== Kind.NULL &&
              !isValidValue(argDefinition.type, arg.value, context)
            ) {
              context.reportError(
                new GraphQLError(
                  `Invalid value for "@${directiveName}(${arg.name.value}:)" of type "${print(
                    argDefinition.type,
                  )}" in application of "@${directiveName}" to "${coordinate}".`,
                  {
                    nodes: arg,
                    extensions: {
                      code: "INVALID_GRAPHQL",
                    },
                  },
                ),
              );
            }
          }
        }
      },
    },
  };
}

/**
 * Whether `value` can be used where `type` is expected, checked at every level
 * of the type so nested lists are matched against the type they are declared
 * with rather than against the innermost named type.
 */
function isValidValue(
  type: TypeNode,
  value: ValueNode,
  context: SimpleValidationContext,
): boolean {
  if (type.kind === Kind.NON_NULL_TYPE) {
    // a null item of a non-null item type is invalid; a null argument is
    // RequiredArgumentsOnDirectivesRule's business and never reaches this
    return value.kind !== Kind.NULL && isValidValue(type.type, value, context);
  }

  if (value.kind === Kind.NULL) {
    return true;
  }

  if (type.kind === Kind.LIST_TYPE) {
    // A single value is coerced to a list of one, so only a list value has to
    // be unwrapped here.
    return value.kind === Kind.LIST
      ? value.values.every((item) => isValidValue(type.type, item, context))
      : isValidValue(type.type, value, context);
  }

  const printedType = printTypeNode(type, context);

  if (!printedType || printedType === "Any") {
    // unknown types are KnownTypesRule's business, custom scalars accept anything
    return true;
  }

  if (value.kind === Kind.LIST) {
    return false; // a list value never fits a non-list type
  }

  const printedValue = printValueNode(value);

  if (printedValue === printedType) {
    return true;
  }

  const typeName = type.name.value;

  // Float accepts Int, but not the other way around
  if (printedValue === "Int" && typeName === "Float") {
    return true;
  }

  // ID accepts both string and int literals
  return (
    typeName === "ID" && (printedValue === "String" || printedValue === "Int")
  );
}

function printValueNode(valueNode: ValueNode): string {
  switch (valueNode.kind) {
    case Kind.ENUM:
      return "Enum";
    case Kind.NULL:
      return "Null";
    case Kind.INT:
      return "Int";
    case Kind.FLOAT:
      return "Float";
    case Kind.STRING:
      return "String";
    case Kind.BOOLEAN:
      return "Boolean";
    case Kind.OBJECT:
      return "Object";
  }

  throw new Error(`Unknown value node kind: ${valueNode}`);
}

function printTypeNode(
  typeNode: TypeNode,
  context: SimpleValidationContext,
): string | null {
  if (typeNode.kind === Kind.NAMED_TYPE) {
    const def = context.getKnownTypeDefinition(typeNode.name.value);

    if (!def) {
      const specifiedScalar = specifiedScalarTypes.find(
        (s) => s.name === typeNode.name.value,
      );

      if (specifiedScalar) {
        return specifiedScalar.name;
      }

      return null;
    }

    switch (def.kind) {
      case Kind.SCALAR_TYPE_DEFINITION:
      case Kind.SCALAR_TYPE_EXTENSION:
        // Accept any value for scalars, we don't know what they are
        return "Any";
      case Kind.ENUM_TYPE_DEFINITION:
      case Kind.ENUM_TYPE_EXTENSION:
        return "Enum";
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
      case Kind.INPUT_OBJECT_TYPE_EXTENSION:
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.OBJECT_TYPE_EXTENSION:
      case Kind.INTERFACE_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_EXTENSION:
      case Kind.UNION_TYPE_DEFINITION:
      case Kind.UNION_TYPE_EXTENSION:
        return "Object";
    }
  }

  return printTypeNode(typeNode.type, context);
}
