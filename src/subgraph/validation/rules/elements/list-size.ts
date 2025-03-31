import {
  ArgumentNode,
  ASTVisitor,
  GraphQLError,
  Kind,
  TypeNode,
} from "graphql";
import {
  namedTypeFromTypeNode,
  validateDirectiveAgainstOriginal,
} from "../../../helpers.js";
import { isScalarType } from "../../validate-state.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function ListSizeRule(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "listSize", context);
    },
    Directive(node, _key, _parent, paths, ancestors) {
      if (!context.isAvailableFederationDirective("listSize", node)) {
        return;
      }

      let assumedSizeArg: ArgumentNode | null = null;
      let assumedSize: number | null = null;
      let slicingArgumentsArg: ArgumentNode | null = null;
      let slicingArguments: string[] | null = null;
      let sizedFieldsArg: ArgumentNode | null = null;
      let sizedFields: string[] | null = null;
      let requireOneSlicingArgumentArg: ArgumentNode | null = null;
      let requireOneSlicingArgument = true;

      for (const arg of node.arguments || []) {
        if (arg.name.value === "assumedSize") {
          assumedSizeArg = arg;
        } else if (arg.name.value === "slicingArguments") {
          slicingArgumentsArg = arg;
        } else if (arg.name.value === "sizedFields") {
          sizedFieldsArg = arg;
        } else if (arg.name.value === "requireOneSlicingArgument") {
          requireOneSlicingArgumentArg = arg;
        }
      }

      if (assumedSizeArg) {
        if (assumedSizeArg.value.kind !== Kind.INT) {
          context.reportError(
            new GraphQLError(
              `The value of @listSize(assumedSize:) must be an integer`,
              {
                extensions: {
                  code: "LIST_SIZE_INVALID_ASSUMED_SIZE",
                },
              },
            ),
          );
          return;
        }

        try {
          assumedSize = parseInt(assumedSizeArg.value.value, 10);
        } catch (error) {
          context.reportError(
            new GraphQLError(
              `The value of @listSize(assumedSize:) is not a valid integer`,
              {
                extensions: {
                  code: "LIST_SIZE_INVALID_ASSUMED_SIZE",
                },
              },
            ),
          );
          return;
        }
      }

      if (slicingArgumentsArg) {
        if (slicingArgumentsArg.value.kind !== Kind.LIST) {
          context.reportError(
            new GraphQLError(
              `The value of @listSize(slicingArguments:) must be a list of strings`,
              {
                extensions: {
                  code: "LIST_SIZE_INVALID_SLICING_ARGUMENT",
                },
              },
            ),
          );
          return;
        }

        const values = slicingArgumentsArg.value.values;
        if (values.some((val) => val.kind !== Kind.STRING)) {
          context.reportError(
            new GraphQLError(
              `The value of @listSize(slicingArguments:) must be a list of strings`,
              {
                extensions: {
                  code: "LIST_SIZE_INVALID_SLICING_ARGUMENT",
                },
              },
            ),
          );
          return;
        }

        slicingArguments = values.map((val) => {
          if (val.kind !== Kind.STRING) {
            // We validate it before, so it shouldn't be a surprise
            throw new Error(
              "Expected @listSize(slicingArguments:) to be a list of strings",
            );
          }
          return val.value;
        });
      }

      if (sizedFieldsArg) {
        if (sizedFieldsArg.value.kind !== Kind.LIST) {
          context.reportError(
            new GraphQLError(
              `The value of @listSize(sizedFields:) must be a list of strings`,
              {
                extensions: {
                  code: "LIST_SIZE_INVALID_SIZED_FIELD",
                },
              },
            ),
          );
          return;
        }

        const values = sizedFieldsArg.value.values;
        if (values.some((val) => val.kind !== Kind.STRING)) {
          context.reportError(
            new GraphQLError(
              `The value of @listSize(sizedFields:) must be a list of strings`,
              {
                extensions: {
                  code: "LIST_SIZE_INVALID_SIZED_FIELD",
                },
              },
            ),
          );
          return;
        }

        sizedFields = values.map((val) => {
          if (val.kind !== Kind.STRING) {
            // We validate it before, so it shouldn't be a surprise
            throw new Error(
              "Expected @listSize(sizedFields:) to be a list of strings",
            );
          }
          return val.value;
        });
      }

      if (requireOneSlicingArgumentArg) {
        if (requireOneSlicingArgumentArg.value.kind !== Kind.BOOLEAN) {
          context.reportError(
            new GraphQLError(
              `The value of @listSize(requireOneSlicingArgument:) must be a boolean when defined`,
              {
                extensions: {
                  code: "LIST_SIZE_INVALID_REQUIRE_ONE_SLICING_ARGUMENT",
                },
              },
            ),
          );
          return;
        }

        requireOneSlicingArgument = requireOneSlicingArgumentArg.value.value;
      }

      const directivesKeyAt = paths.findIndex((path) => path === "directives");

      if (directivesKeyAt === -1) {
        throw new Error('Could not find "directives" key in ancestors');
      }

      // Not sure why it's not `directivesKeyAt-1`
      const parent = ancestors[directivesKeyAt];

      if (!parent) {
        throw new Error("Could not find the node annotated with @listSize");
      }

      if (Array.isArray(parent)) {
        throw new Error("Expected parent to be a single node");
      }

      if (!("kind" in parent)) {
        throw new Error("Expected parent to be a node");
      }

      context.stateBuilder.markCostSpecAsUsed("listSize", node.name.value);

      switch (parent.kind) {
        case Kind.FIELD_DEFINITION: {
          const typeDef = context.typeNodeInfo.getTypeDef();
          const fieldDef = parent;

          if (!typeDef) {
            throw new Error(
              "Could not find the parent type of the field annotated with @listSize",
            );
          }

          const coordinate = `"${typeDef.name.value}.${parent.name.value}"`;

          if (typeof assumedSize === "number" && assumedSize < 0) {
            context.reportError(
              new GraphQLError(
                `${coordinate} has negative @listSize(assumedSize:) value`,
                {
                  extensions: {
                    code: "LIST_SIZE_INVALID_ASSUMED_SIZE",
                  },
                },
              ),
            );
            return;
          }

          if (typeof assumedSize === "number" && assumedSize < 0) {
            context.reportError(
              new GraphQLError(
                `${coordinate} has negative @listSize(assumedSize:) value`,
                {
                  extensions: {
                    code: "LIST_SIZE_INVALID_ASSUMED_SIZE",
                  },
                },
              ),
            );
            return;
          }

          if (
            (sizedFields === null || sizedFields.length === 0) &&
            !isListType(fieldDef.type)
          ) {
            context.reportError(
              new GraphQLError(
                `${coordinate} is not a list. Try to add @listSize(sizedFields:) argument.`,
                {
                  extensions: {
                    code: "LIST_SIZE_INVALID_SIZED_FIELD",
                  },
                },
              ),
            );
            return;
          }

          if (sizedFields?.length) {
            const knownObjectsAndInterfaces =
              context.getSubgraphObjectOrInterfaceTypes();

            const outputType = namedTypeFromTypeNode(fieldDef.type);
            const targetType = knownObjectsAndInterfaces.get(
              outputType.name.value,
            );

            if (!targetType) {
              context.reportError(
                new GraphQLError(
                  `${coordinate} has @listSize(sizedFields:) applied, but the output type is not an object`,
                  {
                    extensions: {
                      code: "LIST_SIZE_INVALID_SIZED_FIELD",
                    },
                  },
                ),
              );
              return;
            }

            const nonIntFields: string[] = [];
            const nonExistingFields: string[] = [];

            for (const sizedField of sizedFields) {
              const targetField = targetType.fields?.find(
                (f) => f.name.value === sizedField,
              );

              if (!targetField) {
                nonExistingFields.push(sizedField);
              } else if (!isIntTypeOrNullableIntType(targetField.type)) {
                nonIntFields.push(sizedField);
              }
            }

            if (nonIntFields.length || nonExistingFields.length) {
              nonIntFields.forEach((fieldName) => {
                context.reportError(
                  new GraphQLError(
                    `${coordinate} references "${fieldName}" field in @listSize(sizedFields:) argument that is not an integer.`,
                    {
                      extensions: {
                        code: "LIST_SIZE_INVALID_SIZED_FIELD",
                      },
                    },
                  ),
                );
              });

              nonExistingFields.forEach((fieldName) => {
                context.reportError(
                  new GraphQLError(
                    `${coordinate} references "${fieldName}" field in @listSize(sizedFields:) argument that does not exist.`,
                    {
                      extensions: {
                        code: "LIST_SIZE_INVALID_SIZED_FIELD",
                      },
                    },
                  ),
                );
              });

              return;
            }
          }

          if (slicingArguments?.length) {
            const nonIntArgument: string[] = [];
            const nonExistingArgument: string[] = [];

            for (const slicingArgument of slicingArguments) {
              const targetArgument = fieldDef.arguments?.find(
                (a) => a.name.value === slicingArgument,
              );

              if (!targetArgument) {
                nonExistingArgument.push(slicingArgument);
              } else if (!isIntTypeOrNullableIntType(targetArgument.type)) {
                nonIntArgument.push(slicingArgument);
              }
            }

            if (nonIntArgument.length || nonExistingArgument.length) {
              nonIntArgument.forEach((argumentName) => {
                context.reportError(
                  new GraphQLError(
                    `${coordinate} references "${argumentName}" argument in @listSize(slicingArguments:) that is not an integer.`,
                    {
                      extensions: {
                        code: "LIST_SIZE_INVALID_SLICING_ARGUMENT",
                      },
                    },
                  ),
                );
              });

              nonExistingArgument.forEach((argumentName) => {
                context.reportError(
                  new GraphQLError(
                    `${coordinate} references "${argumentName}" argument in @listSize(slicingArguments:) that does not exist.`,
                    {
                      extensions: {
                        code: "LIST_SIZE_INVALID_SLICING_ARGUMENT",
                      },
                    },
                  ),
                );
              });

              return;
            }
          }

          if (
            typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
            typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
          ) {
            context.stateBuilder.objectType.field.setListSize(
              typeDef.name.value,
              parent.name.value,
              {
                assumedSize,
                slicingArguments,
                sizedFields,
                requireOneSlicingArgument,
              },
            );
          }

          if (
            typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION
          ) {
            context.stateBuilder.interfaceType.field.setListSize(
              typeDef.name.value,
              parent.name.value,
              {
                assumedSize,
                slicingArguments,
                sizedFields,
                requireOneSlicingArgument,
              },
            );
          }
          break;
        }
      }
    },
  };
}

function isListType(typeNode: TypeNode): boolean {
  if (typeNode.kind === Kind.LIST_TYPE) {
    return true;
  }

  if (typeNode.kind === Kind.NAMED_TYPE) {
    return false;
  }

  return isListType(typeNode.type);
}

function isIntTypeOrNullableIntType(typeNode: TypeNode): boolean {
  if (typeNode.kind === Kind.LIST_TYPE) {
    return false;
  }

  if (typeNode.kind === Kind.NAMED_TYPE) {
    return typeNode.name.value === "Int";
  }

  return isIntTypeOrNullableIntType(typeNode.type);
}
