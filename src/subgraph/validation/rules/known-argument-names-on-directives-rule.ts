import { ASTVisitor, DocumentNode, GraphQLError, Kind } from "graphql";

export function KnownArgumentNamesOnDirectivesRule(context: {
  reportError: (error: GraphQLError) => void;
  getDocument: () => DocumentNode;
}): ASTVisitor {
  const directiveArgs = new Map<string, Set<string>>();

  const astDefinitions = context.getDocument().definitions;
  for (const def of astDefinitions) {
    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
      const argsNodes = def.arguments ?? [];

      directiveArgs.set(
        def.name.value,
        new Set(argsNodes.map((arg) => arg.name.value)),
      );
    }
  }

  return {
    Directive(directiveNode) {
      const directiveName = directiveNode.name.value;
      const knownArgs = directiveArgs.get(directiveName);

      if (directiveNode.arguments && knownArgs) {
        for (const argNode of directiveNode.arguments) {
          const argName = argNode.name.value;
          if (!knownArgs.has(argName)) {
            context.reportError(
              new GraphQLError(
                `Unknown argument "${argName}" on directive "@${directiveName}".`,
                {
                  nodes: argNode,
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
  };
}
