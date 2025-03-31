import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("EXTERNAL_MISSING_ON_BASE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@requires"])
            
            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID
              profile: Profile @external
              friends: [User] @requires(fields: "profile { name }")
            }

            type Profile {
              name: String
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "User.profile" is marked @external on all the subgraphs in which it is listed (subgraph "users").`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_MISSING_ON_BASE",
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
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@requires", "@extends"])
            
            type Query {
              users: [User]
            }

            type User @extends @key(fields: "userId") {
              userId: String @external
              name: String @external
              fullName: String @requires(fields: "name")
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "User.name" is marked @external on all the subgraphs in which it is listed (subgraph "users").`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_MISSING_ON_BASE",
            }),
          }),
        ]),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@extends"])
            
            type Query {
              users: [User]
            }

            type User @extends @key(fields: "id") {
              id: ID! @external
            }
          `,
        },
      ]),
    );
  });

  test("Fed v1: EXTERNAL_MISSING_ON_BASE", () => {
    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type User @extends @key(fields: "id") {
              internalId: String @external
              id: ID! @external
              comments: [String] @requires(fields: "internalId")
            }

            type Query {
              word: String
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type User @extends @key(fields: "id") {
              tags: [String!]!
              id: ID! @external
            }

            type Query {
              sentence: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "User.internalId" is marked @external on all the subgraphs in which it is listed (subgraph "a").`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_MISSING_ON_BASE",
            }),
          }),
        ]),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type User @extends @key(fields: "id") {
              internalId: String @external
              id: ID! @external
            }

            type Query {
              word: String
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type User @extends @key(fields: "id") {
              tags: [String!]!
              id: ID! @external
            }

            type Query {
              sentence: [String]
            }
          `,
        },
      ]),
    );
  });
});
