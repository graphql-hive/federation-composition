export const sdl = /* GraphQL */ `
  directive @context(
    name: String!
  ) repeatable on OBJECT | INTERFACE | UNION

  directive @context__fromContext(
    field: context__ContextFieldValue
  ) on ARGUMENT_DEFINITION

  scalar context__ContextFieldValue
`;
