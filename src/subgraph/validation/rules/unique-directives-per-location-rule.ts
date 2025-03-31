import {
  ASTVisitor,
  DocumentNode,
  GraphQLError,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  Kind,
} from "graphql";

export function UniqueDirectivesPerLocationRule(context: {
  reportError: (error: GraphQLError) => void;
  getDocument(): DocumentNode;
}): ASTVisitor {
  const uniqueDirectiveMap = new Map<string, boolean>();

  const astDefinitions = context.getDocument().definitions;
  for (const def of astDefinitions) {
    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
      uniqueDirectiveMap.set(def.name.value, !def.repeatable);
    }
  }

  const schemaDirectives = new Set<string>();
  const typeDirectivesMap = new Map<string, Set<string>>();

  return {
    // Many different AST nodes may contain directives. Rather than listing
    // them all, just listen for entering any node, and check to see if it
    // defines any directives.
    enter(node) {
      if (!("directives" in node) || !node.directives) {
        return;
      }

      let seenDirectives: Set<string>;
      if (
        node.kind === Kind.SCHEMA_DEFINITION ||
        node.kind === Kind.SCHEMA_EXTENSION
      ) {
        seenDirectives = schemaDirectives;
      } else if (isTypeDefinitionNode(node) || isTypeExtensionNode(node)) {
        const typeName = node.name.value;
        if (!typeDirectivesMap.has(typeName)) {
          typeDirectivesMap.set(typeName, new Set<string>());
        }
        seenDirectives = typeDirectivesMap.get(typeName)!;
      } else {
        seenDirectives = new Set<string>();
      }

      for (const directive of node.directives) {
        const directiveName = directive.name.value;

        if (uniqueDirectiveMap.get(directiveName)) {
          if (seenDirectives.has(directiveName)) {
            context.reportError(
              new GraphQLError(
                `The directive "@${directiveName}" can only be used once at this location.`,
                {
                  extensions: {
                    code: "INVALID_GRAPHQL",
                  },
                },
              ),
            );
          } else {
            seenDirectives.add(directive.name.value);
          }
        }
      }
    },
  };
}
