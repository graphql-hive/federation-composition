import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE for progressive override with @requires", () => {
    // Verifies progressive override (`@override` with `label`) is forbidden
    // when the overridden source field uses `@requires`.
    if (satisfiesVersionRange("< v2.7", version)) {
      return;
    }

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
            paymentReceipt: String! @shareable @override(from: "original", label: "public")
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

    expect(result).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message:
              '@override with label (progressive override) cannot be used on field "Product.paymentReceipt" on subgraph "new" since "Product.paymentReceipt" on "original" is marked with directive "@requires". Use non-progressive @override (without label) for this migration.',
            extensions: expect.objectContaining({
              code: "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
            }),
          }),
        ]),
      }),
    );
  });
});
