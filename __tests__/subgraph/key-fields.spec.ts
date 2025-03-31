import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  createStarsStuff,
  graphql,
  testVersions,
} from "../shared/testkit.js";

testVersions((api, version) => {
  test("__typename allowed in @provides", () => {
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
              profile: Profile!
            }

            type Profile {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "reviews",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@provides", "@external"]
              )

            type Query {
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              title: String!
              author: User! @provides(fields: "profile { id __typename }")
            }

            extend type User @key(fields: "id") {
              id: ID! @external
              profile: Profile! @external
            }

            extend type Profile {
              id: ID! @external
            }
          `,
        },
      ]),
    ).not.toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(`__typename`),
          }),
        ]),
      }),
    );
  });

  test("__typename allowed in @requires", () => {
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
              profile: Profile!
            }

            type Profile {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "reviews",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@requires", "@external"]
              )

            type Query {
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              title: String!
              author: User!
            }

            extend type User @key(fields: "id") {
              id: ID! @external
              profile: Profile! @external
              reviews: [Review] @requires(fields: "profile { id __typename }")
            }

            extend type Profile {
              id: ID! @external
            }
          `,
        },
      ]),
    ).not.toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(`__typename`),
          }),
        ]),
      }),
    );
  });

  test("fragments in @requires", () => {
    const starsStuff = createStarsStuff();

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "inventory",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@shareable", "@external", "@requires"]
              )

            type Product implements ProductItf @key(fields: "id") {
              id: ID!
              dimensions: ProductDimension @external
              delivery(zip: String): DeliveryEstimates
                @requires(fields: "dimensions { ... on ProductDimension { size weight } }")
            }

            type ProductDimension @shareable {
              size: String
              weight: Float
            }

            type DeliveryEstimates {
              estimatedDelivery: String
              fastestDelivery: String
            }

            interface ProductItf {
              id: ID!
              dimensions: ProductDimension
              delivery(zip: String): DeliveryEstimates
            }

            enum ShippingClass {
              STANDARD
              EXPRESS
              OVERNIGHT
            }
          `,
        },
        starsStuff.pandas,
        starsStuff.products,
        starsStuff.reviews,
        starsStuff.users,
      ]),
    );
  });

  test("missing _FieldSet definition", () => {
    expect(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
            directive @key(fields: _FieldSet!) repeatable on OBJECT | INTERFACE

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
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
            message: expect.stringContaining(`[foo] Unknown type _FieldSet`),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
        ]),
      }),
    );
  });
});
