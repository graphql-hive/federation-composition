import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("KEY_INVALID_FIELDS: syntax error", () => {
    expect(
      api.composeServices([
        {
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "featuredItem { id") {
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
              `[serviceA] On type "Product", for @key(fields: "featuredItem { id"): Syntax Error: Expected Name, found <EOF>.`,
            ),
            extensions: expect.objectContaining({
              code: "KEY_INVALID_FIELDS",
            }),
          }),
        ]),
      }),
    );
  });

  test("KEY_INVALID_FIELDS - unknown directive", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id name @lowercase ") {
              id: ID!
              name: String
            }

            extend type Query {
              user(id: ID!): User
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] On type "User", for @key(fields: "id name @lowercase "): Unknown directive "@lowercase"`,
            ),
            extensions: expect.objectContaining({
              code: "KEY_INVALID_FIELDS",
            }),
          }),
        ]),
      }),
    );
  });

  test("KEY_INVALID_FIELDS: unknown field", () => {
    expect(
      api.composeServices([
        {
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Product @key(fields: "skucha") {
              sku: String!
            }
          `,
          name: "serviceA",
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[serviceA] On type "Product", for @key(fields: "skucha"): Cannot query field "skucha" on type "Product" (the field should either be added to this subgraph or, if it should not be resolved by this subgraph, you need to add it to this subgraph with @external).`,
            ),
            extensions: expect.objectContaining({
              code: "KEY_INVALID_FIELDS",
            }),
          }),
        ]),
      }),
    );
  });
});
