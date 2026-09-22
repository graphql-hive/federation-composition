import { expect, test } from "vitest";
import {
  ensureCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("EXTERNAL_TYPE_MISMATCH", () => {
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
              tags: [String!]
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

            extend type User @key(fields: "id") {
              id: ID!
              tags: [String]! @external
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "User.tags" is incompatible across subgraphs (where marked @external): it has type "[String!]" in subgraph "users" but type "[String]!" in subgraph "feed"`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_TYPE_MISMATCH",
            }),
          }),
        ]),
      }),
    );

    expect(
      api.composeServices([
        {
          name: "scores",
          typeDefs: graphql`
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@requires"])

              type User @key(fields: "id") {
                id: ID!
                name: String! @external
                score: Int! @requires(fields: "name")
              }
          `,
        },
        {
          name: "users",
          typeDefs: graphql`
              extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key"]
              )

              type User @key(fields: "id") {
                id: ID!
                name: String!
              }

              type Query {
                users: [User]
              }
          `,
        },
        {
          name: "comments",
          typeDefs: graphql`
              extend schema
              @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@external", "@requires"]
                )
              
              type User @key(fields: "id") {
                id: ID!
                name: String @external
                comments: [String!]! @requires(fields: "name")
              }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "User.name" is incompatible across subgraphs (where marked @external): it has type "String!" in subgraphs "scores" and "users" but type "String" in subgraph "comments"`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_TYPE_MISMATCH",
            }),
          }),
        ]),
      }),
    );

    expect(
      ensureCompositionSuccess(
        api.composeServices([
          {
            name: "b",
            typeDefs: graphql`
              type User @key(fields: "id") {
                id: ID!
              }

              extend type Component @key(fields: "context { id }") {
                context: Context! @external
              }

              type Context {
                id: ID!
              }

              type Query {
                users: [User]
              }
            `,
          },
          {
            name: "a",
            typeDefs: graphql`
              extend type User @key(fields: "id") {
                id: ID @external
                age: Int
              }

              type Context {
                id: ID!
              }

              type Component @key(fields: "context { id }") {
                context: Context
                id: ID!
              }
            `,
          },
          {
            name: "c",
            typeDefs: graphql`
              extend type User @key(fields: "id") {
                id: ID! @external
                name: String
              }
            `,
          },
        ]),
      ).supergraphSdl,
    ).toContainGraphQL(/* GraphQL */ `
      type Component
        @join__type(graph: A, key: "context { id }")
        @join__type(graph: B, key: "context { id }") {
        context: Context
          @join__field(graph: A, type: "Context")
          @join__field(graph: B, type: "Context!")
        id: ID! @join__field(graph: A)
      }
    `);
  });
  test("EXTERNAL_TYPE_MISMATCH on a field selected by @requires", () => {
    // The @requires selection set is written against "pricing"'s VariantV2,
    // but the merged Product.variant points at VariantV1, which has no "sku".
    // Composition has to report the mismatch, not blow up while resolving the selection set.
    expect(
      api.composeServices([
        {
          name: "products",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              product: Product
            }

            type Product @key(fields: "id") {
              id: ID!
              variant: VariantV1!
            }

            type VariantV1 @key(fields: "id") {
              id: ID!
            }
          `,
        },
        {
          name: "pricing",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@requires"])

            type Product @key(fields: "id") {
              id: ID!
              variant: VariantV2 @external
              price: Float @requires(fields: "variant { sku }")
            }

            type VariantV2 @key(fields: "id") {
              id: ID!
              sku: String!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "Product.variant" is incompatible across subgraphs (where marked @external): it has type "VariantV1!" in subgraph "products" but type "VariantV2" in subgraph "pricing"`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_TYPE_MISMATCH",
            }),
          }),
        ]),
      }),
    );
  });
});
