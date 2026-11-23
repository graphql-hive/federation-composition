import { expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("interface field -> object field subtype", () => {
    const result = api.composeServices([
      {
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.6"
              import: ["@shareable"]
            )

          type Query {
            a: Admin
          }

          type Admin implements Node {
            id: ID! @shareable
          }

          type User implements Node {
            id: ID!
          }

          interface Node {
            id: ID!
          }
        `,
        name: "a",
      },
      {
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.6"
              import: ["@key"]
            )

          type Query {
            b: Admin
          }

          type Admin @key(fields: "id") {
            id: ID
            name: String!
          }
        `,
        name: "b",
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message:
          "Interface field Node.id expects type ID! but Admin.id of type ID is not a proper subtype.",
        extensions: expect.objectContaining({ code: "INVALID_GRAPHQL" }),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.6"
                import: ["@shareable"]
              )

            type Query {
              a: Admin
            }

            type Admin implements Node {
              id: ID! @shareable
              parent: Node
            }

            type User implements Node {
              id: ID!
              parent: User
            }

            interface Node {
              id: ID!
              parent: Node
            }
          `,
          name: "a",
        },
      ]),
    );
  });

  // Apollo composes this, but the result is rejected by graphql-js 17.
  api.runIf("guild", () => {
    test("deprecated field -> interface field not deprecated", () => {
      const compose = (nodeIdDirectives: string) =>
        api.composeServices([
          {
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key"]
                )

              type Query {
                node: Node
              }

              interface Node {
                id: ID! ${nodeIdDirectives}
              }

              interface Entity implements Node {
                id: ID! @deprecated(reason: "a")
              }

              type Foo implements Entity & Node @key(fields: "id") {
                id: ID!
              }
            `,
            name: "a",
          },
          {
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key"]
                )

              type Foo @key(fields: "id") {
                id: ID! @deprecated(reason: "b")
                name: String
              }
            `,
            name: "b",
          },
        ]);

      const result = compose("");

      assertCompositionFailure(result);

      expect(result.errors).toEqual([
        expect.objectContaining({
          message:
            "Interface field Node.id is not deprecated, so implementation field Foo.id must not be deprecated.",
          extensions: expect.objectContaining({ code: "INVALID_GRAPHQL" }),
        }),
        expect.objectContaining({
          message:
            "Interface field Node.id is not deprecated, so implementation field Entity.id must not be deprecated.",
          extensions: expect.objectContaining({ code: "INVALID_GRAPHQL" }),
        }),
      ]);

      assertCompositionSuccess(compose('@deprecated(reason: "c")'));
    });
  });
});
