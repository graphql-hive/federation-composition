import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("FIELD_ARGUMENT_DEFAULT_MISMATCH", () => {
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
              friends(type: FriendType = FAMILY): [User!]!
            }

            enum FriendType {
              FAMILY
              FRIEND
            }
          `,
        },
        {
          name: "friends",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            extend type User @key(fields: "id") {
              id: ID
              friends(type: FriendType = FRIEND): [User!]!
            }

            enum FriendType {
              FAMILY
              FRIEND
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
                ? `Argument "User.friends(type:)" has incompatible default values across subgraphs: it has default value "FRIEND" in undefined but default value FRIEND in subgraph "friends" and default value FAMILY in subgraph "users"`
                : `Argument "User.friends(type:)" has incompatible default values across subgraphs: it has default value FRIEND in subgraph "friends" but default value FAMILY in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "FIELD_ARGUMENT_DEFAULT_MISMATCH",
            }),
          }),
        ]),
      }),
    );
  });
});
