export const sdl = (names: {
  cost: string;
  listSize: string;
}) => /* GraphQL */ `
  directive @${names.cost}(
    weight: Int!
  ) on ARGUMENT_DEFINITION | ENUM | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | OBJECT | SCALAR

  directive @${names.listSize}(
    assumedSize: Int
    slicingArguments: [String!]
    sizedFields: [String!]
    requireOneSlicingArgument: Boolean = true
  ) on FIELD_DEFINITION
`;
