import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("TYPE_KIND_MISMATCH", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              usernames: [String!]!
            }

            type User {
              id: ID!
            }
          `,
        },
        {
          name: "friends",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            extend interface User {
              id: ID!
              friends: [User!]!
            }
          `,
        },
        {
          name: "pets",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            input Pet {
              name: String!
            }

            extend input User {
              id: ID!
              pets: [Pet!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "User" has mismatched kind: it is defined as Interface Type in subgraph "friends" but InputObject Type in subgraph "pets" and Object Type in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "TYPE_KIND_MISMATCH",
            }),
          }),
        ]),
      }),
    );
  });
});
