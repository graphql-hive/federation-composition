import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../shared/testkit.js";

testVersions((api, version) => {
  test("INVALID_LINK_IDENTIFIER", () => {
    expect(
      api.composeServices([
        {
          name: "billing",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@override", "@external", "@provides"]
              )
              @link(url: "https://specs.apollo.dev", import: [{ name: "@key", as: "@renamed" }])

            extend type Payment @key(fields: "id") {
              id: ID!
              amount: Int! @external
            }

            type Invoice @key(fields: "id") {
              id: ID!
              amount: Int!
              payment: Payment
            }
          `,
        },
        {
          name: "payments",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: [{ name: "@key", as: "@renamed" }]
              )

            type Query {
              payments: [Payment]
            }

            type Payment @renamed(fields: "id") {
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
            message: expect.stringMatching(
              "Missing path in feature url 'https://specs.apollo.dev",
            ),
            extensions: expect.objectContaining({
              code: "INVALID_LINK_IDENTIFIER",
            }),
          }),
        ]),
      }),
    );

    expect(
      api.composeServices([
        {
          name: "billing",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/not-a-version"
                import: ["@override", "@external", "@provides"]
              )
              @link(
                url: "https://specs.apollo.dev"
                import: [{ name: "@key", as: "@renamed" }]
              )

            extend type Payment @key(fields: "id") {
              id: ID!
              amount: Int! @external
            }

            type Invoice @key(fields: "id") {
              id: ID!
              amount: Int!
              payment: Payment
            }
          `,
        },
        {
          name: "payments",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/not-a-version"
                import: [{ name: "@key", as: "@renamed" }]
              )

            type Query {
              payments: [Payment]
            }

            type Payment @renamed(fields: "id") {
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
              "[billing] Expected a version string (of the form v1.2), got not-a-version",
            ),
            extensions: expect.objectContaining({
              code: "INVALID_LINK_IDENTIFIER",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              "[payments] Expected a version string (of the form v1.2), got not-a-version",
            ),
            extensions: expect.objectContaining({
              code: "INVALID_LINK_IDENTIFIER",
            }),
          }),
        ]),
      }),
    );
  });

  test("INVALID_LINK_DIRECTIVE_USAGE: Duplicate inclusion of feature", () => {
    expect(
      api.composeServices([
        {
          name: "billing",
          typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@override", "@external", "@provides"]
                )
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: [{ name: "@key", as: "@renamed" }]
                )

              extend type Payment @key(fields: "id") {
                id: ID!
                amount: Int! @override(from: "payments") @external
              }

              type Invoice @key(fields: "id") {
                id: ID!
                amount: Int!
                payment: Payment @provides(fields: true)
              }
            `,
        },
        {
          name: "payments",
          typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: [{ name: "@key", as: "@renamed" }]
                )

              type Query {
                payments: [Payment]
              }

              type Payment @renamed(fields: "id") {
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
              `[billing] Duplicate inclusion of feature https://specs.apollo.dev/federation`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_LINK_DIRECTIVE_USAGE",
            }),
          }),
        ]),
      }),
    );
  });

  test(" INVALID_LINK_DIRECTIVE_USAGE: unknown element", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@flexibility"])

            type User @key(fields: "name") {
              name: String
            }

            type Query {
              users: [User!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Cannot import unknown element "@flexibility".`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_LINK_DIRECTIVE_USAGE",
            }),
          }),
        ],
      }),
    );
  });

  test("UNKNOWN_FEDERATION_LINK_VERSION", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v6.9"
                import: ["@key"]
              )

            type Query {
              words: [String!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              "[users] Invalid version v6.9 for the federation feature in @link directive on schema",
            ),
            extensions: expect.objectContaining({
              code: "UNKNOWN_FEDERATION_LINK_VERSION",
            }),
          }),
        ]),
      }),
    );
  });

  test("UNKNOWN_LINK_VERSION", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/link/v6.9")

            type Query {
              words: [String!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Schema uses unknown version v6.9 of the link spec`,
            ),
            extensions: expect.objectContaining({
              code: "UNKNOWN_LINK_VERSION",
            }),
          }),
        ]),
      }),
    );
  });

  test("remove duplicated link spec definitions", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            schema
              @link(url: "https://specs.apollo.dev/link/v1.0")
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@shareable"]
              ) {
              query: Query
            }

            directive @link(
              url: String!
              as: String
              for: link__Purpose
              import: [link__Import]
            ) repeatable on SCHEMA

            scalar link__Import

            enum link__Purpose {
              SECURITY
              EXECUTION
            }

            type Query {
              foo: String
            }
          `,
        },
      ]),
    );
  });
});
