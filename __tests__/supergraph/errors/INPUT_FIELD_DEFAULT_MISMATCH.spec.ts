import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("INPUT_FIELD_DEFAULT_MISMATCH", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            type Query {
              users: [User!]!
            }

            type User @key(fields: "id") {
              id: ID
            }

            input Filter {
              limit: Int = 5
            }
          `,
        },
        {
          name: "friends",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            input Filter {
              limit: Int = 10
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Input field "Filter.limit" has incompatible default values across subgraphs: it has default value 10 in subgraph "friends" but default value 5 in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "INPUT_FIELD_DEFAULT_MISMATCH",
            }),
          }),
        ]),
      }),
    );

    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            type Query {
              users: [User!]!
            }

            type User @key(fields: "id") {
              id: ID
            }

            enum FriendType {
              FAMILY
              FRIEND
            }

            input Filter {
              type: FriendType = FAMILY
            }
          `,
        },
        {
          name: "friends",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            enum FriendType {
              FAMILY
              FRIEND
            }

            input Filter {
              type: FriendType = FRIEND
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              api.library === "apollo"
                ? `Input field "Filter.type" has incompatible default values across subgraphs: it has default value "FRIEND" in undefined but default value FRIEND in subgraph "friends" and default value FAMILY in subgraph "users"`
                : `Input field "Filter.type" has incompatible default values across subgraphs: it has default value FRIEND in subgraph "friends" but default value FAMILY in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "INPUT_FIELD_DEFAULT_MISMATCH",
            }),
          }),
        ]),
      }),
    );
  });
});
