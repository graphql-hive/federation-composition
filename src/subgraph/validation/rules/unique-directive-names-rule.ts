import { ASTVisitor, GraphQLError } from "graphql";

export function UniqueDirectiveNamesRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  const knownDirectiveNameNodes = new Set<string>();

  return {
    DirectiveDefinition(node) {
      const directiveName = node.name.value;
      const existingNameNode = knownDirectiveNameNodes.has(directiveName);

      if (existingNameNode) {
        context.reportError(
          new GraphQLError(
            `There can be only one directive named "@${directiveName}".`,
            {
              extensions: {
                code: "INVALID_GRAPHQL",
              },
            },
          ),
        );
      } else {
        knownDirectiveNameNodes.add(directiveName);
      }
    },
  };
}
