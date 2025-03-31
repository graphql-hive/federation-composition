import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("PROVIDES_FIELDS_MISSING_EXTERNAL", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@provides"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              internalId: ID!
              profile: Profile @provides(fields: "name")
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
              `[users] On field "User.profile", for @provides(fields: "name"): field "Profile.name" should not be part of a @provides since it is already provided by this subgraph (it is not marked @external)`,
            ),
            extensions: expect.objectContaining({
              code: "PROVIDES_FIELDS_MISSING_EXTERNAL",
            }),
          }),
        ]),
      }),
    );
  });

  test("PROVIDES_FIELDS_MISSING_EXTERNAL on external (historical)", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
            }
          `,
        },
        {
          name: "reviews",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@provides", "@external", "@extends"]
              )

            type Query {
              review: Review
            }

            type Review {
              author: User! @provides(fields: "id")
            }

            type User @key(fields: "id") @extends {
              id: ID! @external # part of the key but also part of the @provides (which means it does not need @external, for historical reasons)
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[reviews] On field "Review.author", for @provides(fields: "id"): field "User.id" should not be part of a @provides since it is already "effectively" provided by this subgraph (while it is marked @external, it is a @key field of an extension type, which are not internally considered external for historical/backward compatibility reasons)`,
            ),
            extensions: expect.objectContaining({
              code: "PROVIDES_FIELDS_MISSING_EXTERNAL",
            }),
          }),
        ]),
      }),
    );
  });

  test("Fed v1: NO PROVIDES_FIELDS_MISSING_EXTERNAL on external (historical)", () => {
    const result = api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
          type Query {
            users: [User]
          }

          type User @key(fields: "id") {
            id: ID!
          }
        `,
      },
      {
        name: "reviews",
        typeDefs: graphql`
          type Query {
            review: Review
          }

          type Review {
            author: User! @provides(fields: "id")
          }

          type User @key(fields: "id") @extends {
            id: ID! @external # part of the key but also part of the @provides (which means it does not need @external, for historical reasons)
          }
        `,
      },
    ]);
    assertCompositionSuccess(result);
  });
});
