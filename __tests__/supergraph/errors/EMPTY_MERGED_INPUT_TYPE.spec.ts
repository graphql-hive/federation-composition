import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("EMPTY_MERGED_INPUT_TYPE", () => {
    expect(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            input CreateUserInput {
              name: String
              email: String
            }

            type User @key(fields: "id") {
              id: ID!
              name: String!
            }

            type Query {
              users: [User]
            }
          `,
        },
        {
          name: "bar",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            extend input CreateUserInput {
              tags: [String]
            }

            type Drink @key(fields: "id") {
              id: ID!
              name: String!
            }

            type Query {
              drinks: [Drink]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `None of the fields of input object type "CreateUserInput" are consistently defined in all the subgraphs defining that type. As only fields common to all subgraphs are merged, this would result in an empty type.`,
            ),
            extensions: expect.objectContaining({
              code: "EMPTY_MERGED_INPUT_TYPE",
            }),
          }),
        ]),
      }),
    );
  });
});
