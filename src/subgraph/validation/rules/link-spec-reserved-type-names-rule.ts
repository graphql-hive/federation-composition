import {
  ASTVisitor,
  GraphQLError,
  TypeDefinitionNode,
  TypeExtensionNode,
} from "graphql";
import type { SubgraphValidationContext } from "../validation-context.js";

/**
 * Apollo Link spec v1.0 reserves these type names.
 * https://specs.apollo.dev/link/v1.0/
 *
 * - Purpose: An enum used by @link directive's `for` argument
 * - Import: A scalar used by @link directive's `import` argument
 */
const LINK_SPEC_RESERVED_TYPE_NAMES = new Set(["Purpose", "Import"]);

/**
 * Validates that user-defined types don't conflict with Apollo Link spec reserved type names.
 *
 * This rule only applies to Federation v2+ schemas where the link spec is used.
 */
export function LinkSpecReservedTypeNamesRule(
  context: SubgraphValidationContext,
): ASTVisitor {
  // Only enforce for Federation v2+ where link spec is used
  if (!context.satisfiesVersionRange("> v1.0")) {
    return {};
  }

  function checkTypeName(node: TypeDefinitionNode | TypeExtensionNode) {
    const typeName = node.name.value;

    if (LINK_SPEC_RESERVED_TYPE_NAMES.has(typeName)) {
      context.reportError(
        new GraphQLError(
          `Type "${typeName}" is reserved by the Apollo Link spec (https://specs.apollo.dev/link/v1.0/). Please rename your type.`,
          {
            nodes: node,
            extensions: {
              code: "LINK_SPEC_RESERVED_TYPE_NAME",
            },
          },
        ),
      );
    }
  }

  return {
    ScalarTypeDefinition: checkTypeName,
    ScalarTypeExtension: checkTypeName,
    ObjectTypeDefinition: checkTypeName,
    ObjectTypeExtension: checkTypeName,
    InterfaceTypeDefinition: checkTypeName,
    InterfaceTypeExtension: checkTypeName,
    UnionTypeDefinition: checkTypeName,
    UnionTypeExtension: checkTypeName,
    EnumTypeDefinition: checkTypeName,
    EnumTypeExtension: checkTypeName,
    InputObjectTypeDefinition: checkTypeName,
    InputObjectTypeExtension: checkTypeName,
  };
}
