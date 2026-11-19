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

            if (argDefinition && arg.value) {
              if (arg.value.kind === Kind.NULL) {
                // `null` is a valid value for a nullable type,
                // and RequiredArgumentsOnDirectivesRule handles a non-null one
                continue;
              }

              const printedType = printTypeNode(argDefinition.type, context);
              const printedValue = printValueNode(arg.value);

              if (!printedType) {
                continue; // Let KnownTypesRule handle this
              }

              if (printedType !== "Any") {
                const isListType =
                  argDefinition.type.kind === Kind.LIST_TYPE ||
                  (argDefinition.type.kind === Kind.NON_NULL_TYPE &&
                    argDefinition.type.type.kind === Kind.LIST_TYPE);
                const namedType = namedTypeFromTypeNode(argDefinition.type);
                const typeName = namedType.name.value;

                const isValid =
                  arg.value.kind === Kind.LIST
                    ? // A list value fits a list type only. The other way around is
                      // fine: a single value is coerced to a list of one.
                      isListType &&
                      // an empty list fits any list type
                      arg.value.values.every((item) =>
                        item.kind === Kind.NULL
                          ? allowsNullItems(argDefinition.type)
                          : isAssignable(
                              printValueNode(item),
                              typeName,
                              printedType,
                            ),
                      )
                    : isAssignable(printedValue, typeName, printedType);

                if (!isValid) {
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
          }
        }
      },
    },
  };
}

/**
 * Whether `null` is a valid item of a list of `typeNode`.
 */
function allowsNullItems(typeNode: TypeNode): boolean {
  const listType =
    typeNode.kind === Kind.NON_NULL_TYPE ? typeNode.type : typeNode;

  return (
    listType.kind === Kind.LIST_TYPE &&
    listType.type.kind !== Kind.NON_NULL_TYPE
  );
}

/**
 * Whether a value of kind `printedValue` can be used where `printedType` is
 * expected, ignoring list and non-null wrappers (`typeName` is the named type).
 */
function isAssignable(
  printedValue: string,
  typeName: string,
  printedType: string,
): boolean {
  if (printedValue === printedType) {
    return true;
  }

  // Float accepts Int, but not the other way around
  if (printedValue === "Int" && typeName === "Float") {
    return true;
  }

  // ID accepts both string and int literals
  if (
    typeName === "ID" &&
    (printedValue === "String" || printedValue === "Int")
  ) {
    return true;
  }

  return false;
}

function printValueNode(valueNode: ValueNode): string {
  switch (valueNode.kind) {
    case Kind.LIST:
      if (!valueNode.values.length) {
        return "[]";
      }
      return printValueNode(valueNode.values[0]);
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
