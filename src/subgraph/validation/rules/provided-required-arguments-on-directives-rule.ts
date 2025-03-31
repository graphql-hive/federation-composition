import {
  ASTVisitor,
  GraphQLError,
  InputValueDefinitionNode,
  Kind,
} from "graphql";
import { print } from "../../../graphql/printer.js";
import type { SimpleValidationContext } from "../validation-context.js";

export function ProvidedRequiredArgumentsOnDirectivesRule(
  context: SimpleValidationContext,
): ASTVisitor {
  const requiredArgsMap: Record<
    string,
    Record<string, InputValueDefinitionNode>
  > = Object.create(null);

  const astDefinitions = context.getDocument().definitions;
  for (const def of astDefinitions) {
    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
      const argNodes = def.arguments ?? [];

      const requiredArgs = argNodes.filter(isRequiredArgumentNode);
      requiredArgsMap[def.name.value] = {};

      for (const requiredArg of requiredArgs) {
        requiredArgsMap[def.name.value][requiredArg.name.value] = requiredArg;
      }
    }
  }

  return {
    Directive: {
      // Validate on leave to allow for deeper errors to appear first.
      leave(directiveNode) {
        const directiveName = directiveNode.name.value;
        const requiredArgs = requiredArgsMap[directiveName];
        if (requiredArgs) {
          const argNodes = directiveNode.arguments ?? [];
          const argNodeMap = new Set(argNodes.map((arg) => arg.name.value));
          for (const [argName, argDef] of Object.entries(requiredArgs)) {
            if (!argNodeMap.has(argName)) {
              const argType = print(argDef.type);
              context.reportError(
                new GraphQLError(
                  `Directive "@${directiveName}" argument "${argName}" of type "${argType}" is required, but it was not provided.`,
                  {
                    nodes: directiveNode,
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

function isRequiredArgumentNode(arg: InputValueDefinitionNode): boolean {
  return arg.type.kind === Kind.NON_NULL_TYPE && arg.defaultValue == null;
}
