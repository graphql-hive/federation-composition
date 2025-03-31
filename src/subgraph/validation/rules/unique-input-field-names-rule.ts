import { ASTVisitor, GraphQLError } from "graphql";

export function UniqueInputFieldNamesRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  const knownNameStack: Array<Set<string>> = [];
  let knownNames = new Set<string>();

  return {
    ObjectValue: {
      enter() {
        knownNameStack.push(knownNames);
        knownNames = new Set();
      },
      leave() {
        const prevKnownNames = knownNameStack.pop();

        if (!prevKnownNames) {
          throw new Error("Assertion failed: nothing else in the stack");
        }

        knownNames = prevKnownNames;
      },
    },
    ObjectField(node) {
      const fieldName = node.name.value;
      if (knownNames.has(fieldName)) {
        context.reportError(
          new GraphQLError(
            `There can be only one input field named "${fieldName}".`,
            {
              extensions: {
                code: "INVALID_GRAPHQL",
              },
            },
          ),
        );
      } else {
        knownNames.add(fieldName);
      }
    },
  };
}
