import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("REQUIRES_INVALID_FIELDS", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              users: [User!]!
            }

            type User @key(fields: "id") {
              id: ID
            }
          `,
        },
        {
          name: "friends",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@requires"])

            extend type User @key(fields: "id") {
              id: ID
              favoriteFriend: Friend @requires(fields: "id { }")
              friends: [Friend!]! @requires(fields: "id name")
              topFriends: [Friend!]! @requires(fields: "leastFavoriteFriend { id }")
              topLeastFavoriteFriends: [Friend!]! @requires(fields: "leastFavoriteFriend {}")
              leastFavoriteFriend: Friend @requires(fields: "leastFavoriteFriend { name }")
            }

            type Friend {
              id: ID
              friendsCount: Int
              comment: String
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[friends] On field "User.favoriteFriend", for @requires(fields: "id { }"): Syntax Error: Expected Name, found "}".`,
            ),
            extensions: expect.objectContaining({
              code: "REQUIRES_INVALID_FIELDS",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `[friends] On field "User.topLeastFavoriteFriends", for @requires(fields: "leastFavoriteFriend {}"): Syntax Error: Expected Name, found "}".`,
            ),
            extensions: expect.objectContaining({
              code: "REQUIRES_INVALID_FIELDS",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `[friends] On field "User.friends", for @requires(fields: "id name"): Cannot query field "name" on type "User" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).`,
            ),
            extensions: expect.objectContaining({
              code: "REQUIRES_INVALID_FIELDS",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `[friends] On field "User.leastFavoriteFriend", for @requires(fields: "leastFavoriteFriend { name }"): Cannot query field "name" on type "Friend" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).`,
            ),
            extensions: expect.objectContaining({
              code: "REQUIRES_INVALID_FIELDS",
            }),
          }),
        ]),
      }),
    );
  });
});
