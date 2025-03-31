import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("PROVIDES_FIELDS_HAS_ARGS", () => {
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
              tags(limit: UserType = ADMIN): [String]
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
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external", "@provides"]
              )

            type Query {
              feed: [Article]
            }

            type Article @key(fields: "id") {
              id: ID!
              author: User! @provides(fields: "tags")
            }

            extend type User @key(fields: "isd") {
              id: ID!
              tags(limit: UserType = REGULAR): [String] @external
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
              `[feed] On field "Article.author", for @provides(fields: "tags"): field User.tags cannot be included because it has arguments (fields with argument are not allowed in @provides)`,
            ),
            extensions: expect.objectContaining({
              code: "PROVIDES_FIELDS_HAS_ARGS",
            }),
          }),
        ]),
      }),
    );
  });
});
