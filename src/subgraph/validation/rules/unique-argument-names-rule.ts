import { ArgumentNode, ASTVisitor, GraphQLError } from "graphql";

export function UniqueArgumentNamesRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  return {
    Field: checkArgUniqueness,
    Directive: checkArgUniqueness,
  };

  function checkArgUniqueness(parentNode: {
    arguments?: ReadonlyArray<ArgumentNode> | undefined;
  }) {
    const argumentNodes = parentNode.arguments ?? [];
    const seenArgs = new Set<string>();

    for (const argumentNode of argumentNodes) {
      if (seenArgs.has(argumentNode.name.value)) {
        context.reportError(
          new GraphQLError(
            `There can be only one argument named "${argumentNode.name.value}".`,
            {
              extensions: {
                code: "INVALID_GRAPHQL",
              },
            },
          ),
        );
      } else {
        seenArgs.add(argumentNode.name.value);
      }
    }
  }
}
