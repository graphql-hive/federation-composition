import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "./shared/testkit.js";

testVersions((api, version) => {
  test("non-progressive override with @requires source keeps current implementation behavior", () => {
    const result = api.composeServices([
      {
        name: "original",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@external", "@requires", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCardNumber: String! @external
            paymentReceipt: String! @shareable @requires(fields: "creditCardNumber")
          }

          type Query {
            product(id: ID!): Product
          }
        `,
      },
      {
        name: "new",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@override", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCardNumber: String! @shareable
            paymentReceipt: String! @shareable @override(from: "original")
          }
        `,
      },
    ]);

    if (api.library === "guild") {
      assertCompositionSuccess(result);
      return;
    }

    // Apollo currently rejects this scenario.
    expect(result).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              '@override cannot be used on field "Product.paymentReceipt" on subgraph "new" since "Product.paymentReceipt" on "original" is marked with directive "@requires"',
            ),
            extensions: expect.objectContaining({
              code: "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
            }),
          }),
        ]),
      }),
    );
  });

  test("deep @requires override prunes stale @join__field and @join__type", () => {
    // Verifies our composition handles overriding a source field with deep
    // nested `@requires` by pruning stale source @join__ metadata.
    const result = api.composeServices([
      {
        name: "core",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@shareable"]
            )

          type Query {
            product(id: ID!): Product
          }

          type Product @key(fields: "id") {
            id: ID!
            creditCard: CreditCard! @shareable
          }

          type CreditCard {
            details: CreditCardDetails! @shareable
          }

          type CreditCardDetails {
            number: String! @shareable
          }
        `,
      },
      {
        name: "original",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@external", "@requires", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCard: CreditCard! @external
            paymentReceipt: String!
              @shareable
              @requires(fields: "creditCard { details { number } }")
          }

          extend type CreditCard {
            details: CreditCardDetails! @external
          }

          extend type CreditCardDetails {
            number: String! @external
          }
        `,
      },
      {
        name: "new",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@override", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCard: CreditCard! @shareable
            paymentReceipt: String! @shareable @override(from: "original")
          }

          type CreditCard {
            details: CreditCardDetails! @shareable
          }

          type CreditCardDetails {
            number: String! @shareable
          }
        `,
      },
    ]);

    if (api.library === "apollo") {
      // Apollo currently rejects this scenario.
      expect(result).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                '@override cannot be used on field "Product.paymentReceipt" on subgraph "new" since "Product.paymentReceipt" on "original" is marked with directive "@requires"',
              ),
              extensions: expect.objectContaining({
                code: "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
              }),
            }),
          ]),
        }),
      );

      return;
    }

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Product
        @join__type(graph: CORE, key: "id")
        @join__type(graph: NEW, key: "id")
        @join__type(graph: ORIGINAL, key: "id") {
        id: ID!
        creditCard: CreditCard!
          @join__field(graph: CORE)
          @join__field(graph: NEW)
        paymentReceipt: String! @join__field(graph: NEW, override: "original")
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type CreditCard @join__type(graph: CORE) @join__type(graph: NEW) {
        details: CreditCardDetails!
          @join__field(graph: CORE)
          @join__field(graph: NEW)
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type CreditCardDetails @join__type(graph: CORE) @join__type(graph: NEW) {
        number: String! @join__field(graph: CORE) @join__field(graph: NEW)
      }
    `);
  });

  test("nested external remains when another @requires still uses it", () => {
    // If one requiring field is overridden but another still actively requires
    // part of the same nested path, required externals must remain.
    const result = api.composeServices([
      {
        name: "core",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@shareable"]
            )

          type Query {
            product(id: ID!): Product
          }

          type Product @key(fields: "id") {
            id: ID!
            creditCard: CreditCard! @shareable
          }

          type CreditCard {
            details: CreditCardDetails! @shareable
          }

          type CreditCardDetails {
            number: String! @shareable
            cvv: String! @shareable
          }
        `,
      },
      {
        name: "original",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@external", "@requires", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCard: CreditCard! @external
            paymentReceipt: String!
              @shareable
              @requires(fields: "creditCard { details { number cvv } }")
            fraudScore: Int!
              @shareable
              @requires(fields: "creditCard { details { number } }")
          }

          extend type CreditCard {
            details: CreditCardDetails! @external
          }

          extend type CreditCardDetails {
            number: String! @external
            cvv: String! @external
          }
        `,
      },
      {
        name: "new",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@override", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCard: CreditCard! @shareable
            paymentReceipt: String! @shareable @override(from: "original")
          }

          type CreditCard {
            details: CreditCardDetails! @shareable
          }

          type CreditCardDetails {
            number: String! @shareable
            cvv: String! @shareable
          }
        `,
      },
    ]);

    if (api.library === "apollo") {
      expect(result).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                '@override cannot be used on field "Product.paymentReceipt" on subgraph "new" since "Product.paymentReceipt" on "original" is marked with directive "@requires"',
              ),
              extensions: expect.objectContaining({
                code: "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
              }),
            }),
          ]),
        }),
      );

      return;
    }

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Product
        @join__type(graph: CORE, key: "id")
        @join__type(graph: NEW, key: "id")
        @join__type(graph: ORIGINAL, key: "id") {
        id: ID!
        creditCard: CreditCard!
          @join__field(external: true, graph: ORIGINAL)
          @join__field(graph: CORE)
          @join__field(graph: NEW)
        paymentReceipt: String! @join__field(graph: NEW, override: "original")
        fraudScore: Int!
          @join__field(
            graph: ORIGINAL
            requires: "creditCard { details { number } }"
          )
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type CreditCard
        @join__type(graph: CORE)
        @join__type(graph: NEW)
        @join__type(graph: ORIGINAL) {
        details: CreditCardDetails!
          @join__field(external: true, graph: ORIGINAL)
          @join__field(graph: CORE)
          @join__field(graph: NEW)
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type CreditCardDetails
        @join__type(graph: CORE)
        @join__type(graph: NEW)
        @join__type(graph: ORIGINAL) {
        number: String!
          @join__field(external: true, graph: ORIGINAL)
          @join__field(graph: CORE)
          @join__field(graph: NEW)
        cvv: String! @join__field(graph: CORE) @join__field(graph: NEW)
      }
    `);
  });

  test("overriding one source graph does not drop external usage from another active source", () => {
    // Verifies requires usage is tracked per source graph.
    // Overriding one source must not remove external metadata still required
    // by another non-overridden source field.
    const result = api.composeServices([
      {
        name: "core",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@shareable"]
            )

          type Query {
            product(id: ID!): Product
          }

          type Product @key(fields: "id") {
            id: ID!
            creditCardNumber: String! @shareable
          }
        `,
      },
      {
        name: "original",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@external", "@requires", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCardNumber: String! @external
            paymentReceipt: String! @shareable @requires(fields: "creditCardNumber")
          }
        `,
      },
      {
        name: "legacy",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@external", "@requires", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCardNumber: String! @external
            fraudScore: Int! @shareable @requires(fields: "creditCardNumber")
          }
        `,
      },
      {
        name: "new",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@override", "@shareable"]
            )

          type Product @key(fields: "id") {
            id: ID!
            creditCardNumber: String! @shareable
            paymentReceipt: String! @shareable @override(from: "original")
          }
        `,
      },
    ]);

    if (api.library === "apollo") {
      expect(result).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              extensions: expect.objectContaining({
                code: "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
              }),
            }),
          ]),
        }),
      );
      return;
    }

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Product
        @join__type(graph: CORE, key: "id")
        @join__type(graph: LEGACY, key: "id")
        @join__type(graph: NEW, key: "id")
        @join__type(graph: ORIGINAL, key: "id") {
        id: ID!
        creditCardNumber: String!
          @join__field(graph: CORE)
          @join__field(graph: LEGACY, external: true)
          @join__field(graph: NEW)
        paymentReceipt: String! @join__field(graph: NEW, override: "original")
        fraudScore: Int!
          @join__field(graph: LEGACY, requires: "creditCardNumber")
      }
    `);
  });
});
