import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible", "@requires", "@provides", "@external", "@tag"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              internalId: ID! @inaccessible @external @tag(name: "public")
              profile: Profile @requires(fields: "internalId")
            }

            type Profile {
              name: String
            }
          `,
        },
        {
          name: "ext",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible", "@external"]
              )

            type Query {
              users: [User]
            }

            extend type User @key(fields: "id") {
              id: ID!
              internalId: ID! @inaccessible
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Cannot apply merged directive @inaccessible to external field "User.internalId"`,
            ),
            extensions: expect.objectContaining({
              code: "MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Cannot apply merged directive @tag(name: "public") to external field "User.internalId"`,
            ),
            extensions: expect.objectContaining({
              code: "MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL",
            }),
          }),
        ]),
      }),
    );
  });

  test("Fed v1 has no MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "inventory",
          typeDefs: graphql`
            directive @tag(name: String!) repeatable on FIELD_DEFINITION

            extend type Product @key(fields: "id") {
              id: ID! @external @tag(name: "public")
              dimensions: ProductDimension @external
              delivery(zip: String): DeliveryEstimates
                @requires(fields: "dimensions { size weight }")
            }

            type ProductDimension {
              size: String
              weight: Float @tag(name: "public")
            }

            type DeliveryEstimates {
              estimatedDelivery: String
            }
          `,
        },
        {
          name: "ext",
          typeDefs: graphql`
            directive @tag(name: String!) repeatable on FIELD_DEFINITION

            type Product @key(fields: "id") @key(fields: "sku package") {
              id: ID!
              sku: String
              package: String
              dimensions: ProductDimension
            }

            type ProductDimension {
              size: String
              weight: Float
            }

            type Query {
              allProducts: [Product]
              product(id: ID!): Product
            }
          `,
        },
      ]),
    );
  });
});
