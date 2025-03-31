import { expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../shared/testkit.js";

testVersions((api, version) => {
  test("federation v1 directives should be available when schema @link(federation) is NOT provided", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          type User @key(fields: "name") {
            name: String
          }

          type Query {
            user: User
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);
  });

  test("federation v1 directives prefixed with federation__ should NOT be available when schema @link(federation) is NOT provided", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          type User @federation__key(fields: "name") {
            name: String
          }

          type Query {
            user: User
          }
        `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Unknown directive "@federation__key"`,
            ),
          }),
        ]),
      }),
    );
  });

  test("federation directives should not be available when not imported but schema @link(federation) is provided", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

          type User @key(fields: "name") {
            name: String
          }

          type Query {
            user: User
          }
        `,
      },
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[a] Unknown directive "@key". If you meant the "@key" federation directive, you should use fully-qualified name "@federation__key" or add "@key" to the \`import\` argument of the @link to the federation specification.`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
        ]),
      }),
    );
  });

  test("federation directives prefixed with federation__ should be available when not imported but schema @link(federation) is provided", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

          type User @federation__key(fields: "name") {
            name: String
          }

          type Query {
            user: User
          }
        `,
      },
    ]);
    assertCompositionSuccess(result);
  });

  test("support basic aliasing", () => {
    const result = api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: [{ name: "@key", as: "@myKey" }]
            )

          type Query {
            users: [User]
          }

          type User @myKey(fields: "id") {
            id: ID!
            name: String!
            age: String!
          }
        `,
      },
      {
        name: "reviews",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", { name: "@external", as: "@myExternal" }]
            )

          type Query {
            reviews: [Review]
          }

          type Review @key(fields: "id") {
            id: ID!
            title: String!
          }

          extend type User @key(fields: "id") {
            id: ID! @myExternal
            reviews: [Review!]!
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);
  });
});
