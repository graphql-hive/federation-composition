import { ASTVisitor, GraphQLError } from "graphql";

export function LoneSchemaDefinitionRule(context: {
  reportError: (error: GraphQLError) => void;
}): ASTVisitor {
  let schemaDefinitionsCount = 0;
  return {
    SchemaDefinition() {
      if (schemaDefinitionsCount > 0) {
        context.reportError(
          new GraphQLError("Must provide only one schema definition.", {
            extensions: {
              code: "INVALID_GRAPHQL",
            },
          }),
        );
      }
      ++schemaDefinitionsCount;
    },
  };
}
