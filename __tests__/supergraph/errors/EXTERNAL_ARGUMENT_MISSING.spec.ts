import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("EXTERNAL_ARGUMENT_MISSING", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              tags(limit: Int!): [String]
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@provides", "@external"])

            type Query {
              feed: [Article]
            }

            type Article @key(fields: "id") {
              id: ID!
              author: User! @provides(fields: "tags")
            }

            extend type User @key(fields: "id") {
              id: ID!
              tags: [String] @external
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "User.tags" is missing argument "User.tags(limit:)" in some subgraphs where it is marked @external: argument "User.tags(limit:)" is declared in subgraph "users" but not in subgraph "feed" (where "User.tags" is @external)`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_ARGUMENT_MISSING",
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
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              tags(limit: Int): [String]
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@requires", "@external"])

            type Query {
              feed: [Article]
            }

            type Article @key(fields: "id") {
              id: ID!
              author: User! @requires(fields: "author { tags }")
            }

            extend type User @key(fields: "id") {
              id: ID!
              tags: [String] @external
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "User.tags" is missing argument "User.tags(limit:)" in some subgraphs where it is marked @external: argument "User.tags(limit:)" is declared in subgraph "users" but not in subgraph "feed" (where "User.tags" is @external)`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_ARGUMENT_MISSING",
            }),
          }),
        ]),
      }),
    );
  });
});
