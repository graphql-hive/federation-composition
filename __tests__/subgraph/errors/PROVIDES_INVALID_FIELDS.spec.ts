import { describe, expect, test } from "vitest";
import {
  assertCompositionFailure,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  describe("PROVIDES_INVALID_FIELDS", () => {
    test("Cannot query field", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
              extend schema
              @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key"]
                )
              
              type Query {
                users: [User]
              }
  
              type User @key(fields: "id") {
                id: ID!
              }
            `,
          },
          {
            name: "feed",
            typeDefs: graphql`
            extend schema
              @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@external", "@provides"]
                )
  
              type Query {
                feed: [Post]
              }
  
              type Post @key(fields: "id") {
                id: ID!
                author: User @provides(fields: "userId")
              }
  
              extend type User @key(fields: "id") {
                id: ID! @external
              }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[feed] On field "Post.author", for @provides(fields: "userId"): Cannot query field "userId" on type "User" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).`,
              ),
              extensions: expect.objectContaining({
                code: "PROVIDES_INVALID_FIELDS",
              }),
            }),
          ]),
        }),
      );
    });
  });

  test("empty selection set", () => {
    const result = api.composeServices([
      {
        typeDefs: graphql`
          type Query {
            team: Team! @provides(fields: "users")
          }

          type User @key(fields: "id") @extends {
            id: String! @external
            role: [Role!]
          }

          type Team @key(fields: "id") @extends {
            id: String! @external
            users: [User!]
          }

          type Role {
            id: ID!
            name: String
          }
        `,
        name: "roles",
      },
      {
        typeDefs: graphql`
          type Team @key(fields: "id") {
            id: String!
            name: String
          }

          type User @key(fields: "id") {
            id: String!
            name: String
          }
        `,
        name: "teams",
      },
      {
        typeDefs: graphql`
          type Query {
            organization(id: String!): Organization! @provides(fields: "teams")
          }

          type Organization {
            name: String
            teams: [Team!]!
          }

          type Team @key(fields: "id") @extends {
            id: String! @external
          }
        `,
        name: "organization",
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message:
          '[roles] On field "Query.team", for @provides(fields: "users"): Invalid empty selection set for field "Team.users" of non-leaf type [User!]',
        extensions: expect.objectContaining({
          code: "PROVIDES_INVALID_FIELDS",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message:
          '[organization] On field "Query.organization", for @provides(fields: "teams"): Invalid empty selection set for field "Organization.teams" of non-leaf type [Team!]!',
        extensions: expect.objectContaining({
          code: "PROVIDES_INVALID_FIELDS",
        }),
      }),
    );
  });
});
