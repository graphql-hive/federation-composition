import { ASTVisitor, GraphQLError, Kind } from "graphql";
import {
  isDirectiveDefinitionNode,
  validateDirectiveAgainstOriginal,
} from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

export function ComposeDirectiveRules(
  context: SubgraphValidationContext,
): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "composeDirective", context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective("composeDirective", node)) {
        return;
      }

      if (!context.satisfiesVersionRange(">= v2.1")) {
        return;
      }

      const nameArg = node.arguments?.find((arg) => arg.name.value === "name");

      if (!nameArg || nameArg.value.kind !== Kind.STRING) {
        return;
      }

      const name = nameArg.value.value.replace(/^@/, "");

      const definedDirectives = context
        .getDocument()
        .definitions.filter(isDirectiveDefinitionNode);
      const matchingDirective = definedDirectives.find(
        (directive) => directive.name.value === name,
      );

      if (matchingDirective) {
        // check if it has a linked spec
        const hasSpec = context.stateBuilder.state.links.some((link) =>
          link.imports.some(
            (im) =>
              im.kind === "directive" &&
              (im.alias
                ? im.alias.replace(/^@/, "") === name
                : im.name.replace(/^@/, "") === name),
          ),
        );

        if (!hasSpec) {
          context.reportError(
            new GraphQLError(
              `Directive "@${name}" in subgraph "${context.getSubgraphName()}" cannot be composed because it is not a member of a core feature`,
              {
                extensions: {
                  code: "DIRECTIVE_COMPOSITION_ERROR",
                  subgraphName: context.getSubgraphName(),
                },
              },
            ),
          );
          return;
        }

        context.stateBuilder.directive.setComposed(
          matchingDirective.name.value,
        );
        context.stateBuilder.composedDirectives.add(
          matchingDirective.name.value,
        );
      } else {
        context.reportError(
          new GraphQLError(
            `Could not find matching directive definition for argument to @composeDirective "@${name}" in subgraph "${context.getSubgraphName()}".`,
            {
              nodes: node,
              extensions: {
                code: "DIRECTIVE_COMPOSITION_ERROR",
                subgraphName: context.getSubgraphName(),
              },
            },
          ),
        );
      }
    },
  };
}
