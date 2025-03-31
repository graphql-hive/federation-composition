import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("OVERRIDE_SOURCE_HAS_OVERRIDE", () => {
    expect(
      api.composeServices([
        {
          name: "billing",
          typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@override"]
                  )
                type Query {
                  bills: [Bill]
                }
                type Bill @key(fields: "id") {
                  id: ID!
                  amount: Int! @override(from: "payments")
                }
              `,
        },
        {
          name: "payments",
          typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@override"]
                  )
                type Query {
                  payments: [Bill]
                }
                type Bill @key(fields: "id") {
                  id: ID!
                  amount: Int @override(from: "billing")
                }
              `,
        },
        {
          name: "invoices",
          typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@override"]
                  )
                type Query {
                  invoices: [Bill]
                }
                type Bill @key(fields: "id") {
                  id: ID!
                  amount: Int @override(from: "billing")
                }
              `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "Bill.amount" on subgraph "billing" is also marked with directive @override in subgraph "payments". Only one @override directive is allowed per field.`,
            ),
            extensions: expect.objectContaining({
              code: "OVERRIDE_SOURCE_HAS_OVERRIDE",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "Bill.amount" on subgraph "invoices" is also marked with directive @override in subgraph "billing". Only one @override directive is allowed per field.`,
            ),
            extensions: expect.objectContaining({
              code: "OVERRIDE_SOURCE_HAS_OVERRIDE",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "Bill.amount" on subgraph "payments" is also marked with directive @override in subgraph "billing". Only one @override directive is allowed per field.`,
            ),
            extensions: expect.objectContaining({
              code: "OVERRIDE_SOURCE_HAS_OVERRIDE",
            }),
          }),
        ]),
      }),
    );
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "bar",
          typeDefs: graphql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/${version}"
            import: ["@shareable", "@override"]
          )

          type Query {
            user: String @shareable @override(from: "mono")
          }
      `,
        },
        {
          name: "foo",
          typeDefs: graphql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/${version}"
            import: ["@shareable", "@override"]
          )

        type Query {
          user: String @shareable @override(from: "mono")
        }
      `,
        },
        {
          name: "main",
          typeDefs: graphql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/${version}"
            import: ["@shareable"]
          )

          type Query {
            user: String @shareable
          }
      `,
        },
      ]),
    );
  });
});
