import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("FIELD_ARGUMENT_TYPE_MISMATCH", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              users(type: UserType!): [User!]!
            }

            type User @key(fields: "id") {
              id: ID
              type: UserType
            }

            enum UserType {
              REGULAR
              ADMIN
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            extend type Query {
              users(type: String!): [User!]!
            }

            extend type User @key(fields: "id") {
              id: ID
              type: UserType
            }

            enum UserType {
              REGULAR
              ADMIN
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of argument "Query.users(type:)" is incompatible across subgraphs: it has type "String!" in subgraph "feed" but type "UserType!" in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "FIELD_ARGUMENT_TYPE_MISMATCH",
            }),
          }),
        ]),
      }),
    );
  });
});
