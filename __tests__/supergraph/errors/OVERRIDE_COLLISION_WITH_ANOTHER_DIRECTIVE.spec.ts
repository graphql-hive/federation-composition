import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE", () => {
    expect(
      api.composeServices([
        {
          name: "billing",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@override", "@external", "@provides"]
              )

            extend type Payment @key(fields: "id") {
              id: ID!
              amount: Int! @override(from: "payments") @external
            }

            type Invoice @key(fields: "id") {
              id: ID!
              amount: Int!
              payment: Payment @provides(fields: "amount")
            }
          `,
        },
        {
          name: "payments",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              payments: [Payment]
            }

            type Payment @key(fields: "id") {
              id: ID!
              amount: Int!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `@override cannot be used on field "Payment.amount" on subgraph "billing" since "Payment.amount" on "billing" is marked with directive "@${
                api.library === "apollo" ? "federation__external" : "external"
              }"`,
            ),
            extensions: expect.objectContaining({
              code: "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
            }),
          }),
        ]),
      }),
    );
    // KNOW: detect if the `@override` directive is applied on `@external` field
  });
});
