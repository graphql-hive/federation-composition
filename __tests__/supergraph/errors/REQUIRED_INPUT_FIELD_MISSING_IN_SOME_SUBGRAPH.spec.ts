import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            type Query {
              users: [User!]!
            }

            type Mutation {
              createUser(input: CreateUser!): User!
            }

            type User @key(fields: "id") {
              id: ID
            }

            input CreateUser {
              id: ID!
              profile: ProfileInput!
            }

            input ProfileInput {
              name: String!
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            extend type Mutation {
              updateUser(input: UpdateUser!): User!
            }

            extend type User @key(fields: "id") {
              id: ID
            }

            input UpdateUser {
              id: ID!
              profile: ProfileInput!
            }

            extend input ProfileInput {
              reason: String
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Input object field "ProfileInput.name" is required in some subgraphs but does not appear in all subgraphs: it is required in subgraph "users" but does not appear in subgraph "feed"`,
            ),
            extensions: expect.objectContaining({
              code: "REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH",
            }),
          }),
        ]),
      }),
    );
  });
});
