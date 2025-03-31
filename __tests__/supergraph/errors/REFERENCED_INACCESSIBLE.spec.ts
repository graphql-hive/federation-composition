import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("REFERENCED_INACCESSIBLE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible"]
              )

            type Query {
              users(filter: Filter, access: Access): [User]
            }

            enum Access @inaccessible {
              PUBLIC
              PRIVATE
            }

            type User @inaccessible {
              id: ID!
            }

            input Filter @inaccessible {
              limit: Int
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "User" is @inaccessible but is referenced by "Query.users", which is in the API schema.`,
            ),
            extensions: expect.objectContaining({
              code: "REFERENCED_INACCESSIBLE",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "Filter" is @inaccessible but is referenced by "Query.users(filter:)", which is in the API schema.`,
            ),
            extensions: expect.objectContaining({
              code: "REFERENCED_INACCESSIBLE",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "Access" is @inaccessible but is referenced by "Query.users(access:)", which is in the API schema.`,
            ),
            extensions: expect.objectContaining({
              code: "REFERENCED_INACCESSIBLE",
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
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              profile: Profile! @inaccessible
            }

            type Profile {
              name: String
              address: Address
            }

            type Address @inaccessible {
              street: String
              postalCode: String
            }
          `,
        },
        {
          name: "products",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key"]
              )

            type Query {
              products: [Product]
            }

            type Product @key(fields: "id") {
              id: ID!
              name: String!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "Address" is @inaccessible but is referenced by "Profile.address", which is in the API schema.`,
            ),
            extensions: expect.objectContaining({
              code: "REFERENCED_INACCESSIBLE",
            }),
          }),
        ]),
      }),
    );

    // KNOW: check if a type is accessible when it's directly referenced by a field from a Query type
  });
});
