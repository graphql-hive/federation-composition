import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("KEY_FIELDS_SELECT_INVALID_TYPE", () => {
    expect(
      api.composeServices([
        {
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "featuredItem { id }") {
              featuredItem: Node!
              sku: String!
            }

            interface Node {
              id: ID!
            }
          `,
          name: "serviceA",
        },
        {
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@external", "@requires"])
            
            extend type Product {
              sku: String! @external
              price: Int! @requires(fields: "sku")
            }
          `,
          name: "serviceB",
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[serviceA] On type "Product", for @key(fields: "featuredItem { id }"): field "Product.featuredItem" is a Interface type which is not allowed in @key`,
            ),
            extensions: expect.objectContaining({
              code: "KEY_FIELDS_SELECT_INVALID_TYPE",
            }),
          }),
        ]),
      }),
    );
  });
});
