import { Kind, parse, print, visit, type DocumentNode } from "graphql";
import { describe, expect, test } from "vitest";
import { buildSubgraph, printSchema } from "@apollo/federation-internals";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "../shared/testkit.js";

/**
 * Regression tests for https://github.com/graphql-hive/federation-composition/issues/326
 *
 * A subgraph built with `@apollo/subgraph` exposes its schema via `_service { sdl }`.
 * That SDL is the *expanded* subgraph schema: it declares every directive and scalar
 * of the linked federation spec, namespaced with `federation__` unless imported.
 *
 * Since federation v2.8 the list includes `@federation__context` and
 * `@federation__fromContext`. Composition used to fail on those two with
 * `There can be only one directive named "@federation__context"` because the
 * definitions were not recognized as (valid) copies of the built-in ones.
 *
 * This matters for every introspection-based workflow (`hive dev --url`, registry
 * ingestion, `rover subgraph introspect`, ...).
 */

const DUPLICATE_DIRECTIVE_ERROR = "There can be only one directive named";

/**
 * Produces the same document `@apollo/subgraph` returns from `_service { sdl }`
 * (`printSubgraphSchema`): the subgraph schema built by `@apollo/federation-internals`
 * with the federation-specific `_service` / `_entities` / `_Any` / `_Service` / `_Entity`
 * definitions removed.
 */
function serviceSdl(typeDefs: string, name = "subgraph"): DocumentNode {
  const subgraph = buildSubgraph(name, `http://${name}`, typeDefs);
  const printed = printSchema(subgraph.schema);

  return visit(parse(printed), {
    ObjectTypeDefinition(node) {
      if (node.name.value === "_Service") {
        return null;
      }

      if (node.name.value === "Query") {
        return {
          ...node,
          fields: node.fields?.filter(
            (f) => !["_service", "_entities"].includes(f.name.value),
          ),
        };
      }
    },
    ScalarTypeDefinition(node) {
      return node.name.value === "_Any" ? null : undefined;
    },
    UnionTypeDefinition(node) {
      return node.name.value === "_Entity" ? null : undefined;
    },
  });
}

function directiveDefinitionNames(doc: DocumentNode) {
  return doc.definitions
    .filter((d) => d.kind === Kind.DIRECTIVE_DEFINITION)
    .map((d) => (d as { name: { value: string } }).name.value);
}

function expectNoDuplicateDirectiveErrors(result: {
  errors?: readonly { message: string }[];
}) {
  const messages = (result.errors ?? []).map((e) => e.message);
  expect(messages.filter((m) => m.includes(DUPLICATE_DIRECTIVE_ERROR))).toEqual(
    [],
  );
}

testVersions((api, version) => {
  const link = (imports: string[]) =>
    `@link(url: "https://specs.apollo.dev/federation/${version}", import: [${imports
      .map((i) => `"${i}"`)
      .join(", ")}])`;

  describe("composing `_service.sdl` printed by @apollo/subgraph", () => {
    test("a single subgraph with every federation__ definition of the spec", () => {
      const typeDefs = serviceSdl(
        /* GraphQL */ `
          extend schema ${link(["@key"])}

          type Query {
            product(id: ID!): Product
          }

          type Product @key(fields: "id") {
            id: ID!
            name: String
          }
        `,
        "products",
      );

      // sanity check that the fixture is what the issue describes
      const names = directiveDefinitionNames(typeDefs);
      expect(names).toContain("key");
      expect(names).toContain("federation__requires");
      if (satisfiesVersionRange(">= v2.8", version)) {
        expect(names).toContain("federation__context");
        expect(names).toContain("federation__fromContext");
      } else {
        expect(names).not.toContain("federation__context");
        expect(names).not.toContain("federation__fromContext");
      }

      const result = api.composeServices([
        { name: "products", typeDefs, url: "http://products" },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Product @join__type(graph: PRODUCTS, key: "id") {
          id: ID!
          name: String
        }
      `);
    });

    test("multiple subgraphs, each with its own full set of federation__ definitions", () => {
      const result = api.composeServices([
        {
          name: "products",
          url: "http://products",
          typeDefs: serviceSdl(
            /* GraphQL */ `
              extend schema ${link(["@key", "@shareable"])}

              type Query {
                product(id: ID!): Product
              }

              type Product @key(fields: "id") {
                id: ID!
                name: String @shareable
              }
            `,
            "products",
          ),
        },
        {
          name: "reviews",
          url: "http://reviews",
          typeDefs: serviceSdl(
            /* GraphQL */ `
              extend schema ${link(["@key", "@shareable", "@external", "@requires"])}

              type Product @key(fields: "id") {
                id: ID!
                name: String @external
                reviews: [Review!]! @requires(fields: "name")
              }

              type Review {
                id: ID!
                body: String
              }

              type Query {
                reviews: [Review!]!
              }
            `,
            "reviews",
          ),
        },
        {
          name: "inventory",
          url: "http://inventory",
          typeDefs: serviceSdl(
            /* GraphQL */ `
              extend schema ${link(["@key"])}

              type Product @key(fields: "id") {
                id: ID!
                inStock: Boolean!
              }
            `,
            "inventory",
          ),
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Product
          @join__type(graph: INVENTORY, key: "id")
          @join__type(graph: PRODUCTS, key: "id")
          @join__type(graph: REVIEWS, key: "id") {
          id: ID!
          inStock: Boolean! @join__field(graph: INVENTORY)
          name: String
            @join__field(graph: PRODUCTS)
            @join__field(external: true, graph: REVIEWS)
          reviews: [Review!]! @join__field(graph: REVIEWS, requires: "name")
        }
      `);
    });

    test("a `_service.sdl` subgraph mixed with a hand-written subgraph", () => {
      const result = api.composeServices([
        {
          name: "products",
          url: "http://products",
          typeDefs: serviceSdl(
            /* GraphQL */ `
              extend schema ${link(["@key"])}

              type Query {
                product(id: ID!): Product
              }

              type Product @key(fields: "id") {
                id: ID!
                name: String
              }
            `,
            "products",
          ),
        },
        {
          name: "inventory",
          url: "http://inventory",
          typeDefs: graphql`
            extend schema ${link(["@key"])}

            type Product @key(fields: "id") {
              id: ID!
              inStock: Boolean!
            }
          `,
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
    });

    test("every federation__ directive definition of the spec can be declared on its own", () => {
      const full = serviceSdl(
        /* GraphQL */ `
          extend schema ${link(["@key"])}

          type Query {
            product(id: ID!): Product
          }

          type Product @key(fields: "id") {
            id: ID!
          }
        `,
        "products",
      );

      const definitions = full.definitions.filter(
        (d) =>
          d.kind === Kind.DIRECTIVE_DEFINITION &&
          d.name.value.startsWith("federation__"),
      );
      expect(definitions.length).toBeGreaterThan(0);

      for (const definition of definitions) {
        const result = api.composeServices([
          {
            name: "products",
            url: "http://products",
            typeDefs: parse(/* GraphQL */ `
              extend schema ${link(["@key"])}

              ${print(definition)}

              scalar federation__FieldSet
              scalar federation__Scope
              scalar federation__Policy
              scalar federation__ContextFieldValue

              type Query {
                product(id: ID!): Product
              }

              type Product @key(fields: "id") {
                id: ID!
              }
            `),
          },
        ]);

        expectNoDuplicateDirectiveErrors(result);
        assertCompositionSuccess(
          result,
          `Failed for directive definition: ${print(definition)}`,
        );
      }
    });
  });

  // The rest of this file is only about @context / @fromContext (federation >= v2.8)
  if (satisfiesVersionRange("< v2.8", version)) {
    return;
  }

  describe("@federation__context and @federation__fromContext definitions", () => {
    // Hand-written copy of what @apollo/subgraph prints, so this test is independent
    // from the printer of @apollo/federation-internals.
    const federationDefinitions = /* GraphQL */ `
      directive @federation__requires(
        fields: federation__FieldSet!
      ) on FIELD_DEFINITION
      directive @federation__provides(
        fields: federation__FieldSet!
      ) on FIELD_DEFINITION
      directive @federation__external(
        reason: String
      ) on OBJECT | FIELD_DEFINITION
      directive @federation__tag(
        name: String!
      ) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION | SCHEMA
      directive @federation__extends on OBJECT | INTERFACE
      directive @federation__shareable repeatable on OBJECT | FIELD_DEFINITION
      directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
      directive @federation__override(
        from: String!
        label: String
      ) on FIELD_DEFINITION
      directive @federation__composeDirective(name: String) repeatable on SCHEMA
      directive @federation__interfaceObject on OBJECT
      directive @federation__authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
      directive @federation__requiresScopes(
        scopes: [[federation__Scope!]!]!
      ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
      directive @federation__policy(
        policies: [[federation__Policy!]!]!
      ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
      directive @federation__context(
        name: String!
      ) repeatable on INTERFACE | OBJECT | UNION
      directive @federation__fromContext(
        field: federation__ContextFieldValue
      ) on ARGUMENT_DEFINITION

      scalar federation__FieldSet
      scalar federation__Scope
      scalar federation__Policy
      scalar federation__ContextFieldValue
    `;

    // When a subgraph uses `@federation__context` (namespaced, not imported),
    // Apollo names the directive `@federation__context` in the supergraph as well,
    // while we always emit the canonical `@context`. Both are accepted by the routers.
    const expectNamespacedContextInSupergraph = (supergraphSdl: string) => {
      expect(supergraphSdl).toMatch(
        /@(federation__)?context\(name: "accounts__accountCtx"\)/,
      );
      expect(supergraphSdl).toContainGraphQL(graphql`
        type Formatter @join__type(graph: ACCOUNTS, key: "id") {
          id: ID!
          format: String!
            @join__field(
              graph: ACCOUNTS
              contextArguments: [
                {
                  context: "accounts__accountCtx"
                  name: "locale"
                  type: "String"
                  selection: " { locale }"
                }
              ]
            )
        }
      `);

      api.runIf("guild", () => {
        expect(supergraphSdl).toContainGraphQL(graphql`
          type Account
            @join__type(graph: ACCOUNTS, key: "id")
            @context(name: "accounts__accountCtx") {
            id: ID!
            locale: String!
          }
        `);
      });
    };

    test("reproduction from the issue: full `_service.sdl` with @link(link/v1.0) and all definitions", () => {
      const result = api.composeServices([
        {
          name: "products",
          url: "http://products",
          typeDefs: parse(/* GraphQL */ `
            schema
              @link(url: "https://specs.apollo.dev/link/v1.0")
              ${link(["@key"])} {
              query: Query
            }

            directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA
            directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE
            ${federationDefinitions}

            type Query {
              product(id: ID!): Product
            }

            type Product @key(fields: "id") {
              id: ID!
              name: String
            }

            enum link__Purpose {
              SECURITY
              EXECUTION
            }

            scalar link__Import
          `),
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
    });

    test("only the two context definitions, without using them", () => {
      const result = api.composeServices([
        {
          name: "products",
          url: "http://products",
          typeDefs: graphql`
            extend schema ${link(["@key"])}

            directive @federation__context(name: String!) repeatable on INTERFACE | OBJECT | UNION
            directive @federation__fromContext(field: federation__ContextFieldValue) on ARGUMENT_DEFINITION

            scalar federation__ContextFieldValue

            type Query {
              product(id: ID!): Product
            }

            type Product @key(fields: "id") {
              id: ID!
            }
          `,
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
      // the context spec is not used, so it must not leak into the supergraph
      expect(result.supergraphSdl).not.toMatch(/specs\.apollo\.dev\/context/);
    });

    test("non-namespaced @context and @fromContext definitions when imported", () => {
      const result = api.composeServices([
        {
          name: "products",
          url: "http://products",
          typeDefs: graphql`
            extend schema ${link(["@key", "@context", "@fromContext"])}

            directive @context(name: String!) repeatable on INTERFACE | OBJECT | UNION
            directive @fromContext(field: federation__ContextFieldValue) on ARGUMENT_DEFINITION

            scalar federation__ContextFieldValue

            type Query {
              product(id: ID!): Product
            }

            type Product @key(fields: "id") {
              id: ID!
            }
          `,
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
    });

    test("the definitions and a namespaced usage of @federation__context / @federation__fromContext", () => {
      const result = api.composeServices([
        {
          name: "accounts",
          url: "http://accounts",
          typeDefs: parse(/* GraphQL */ `
            extend schema ${link(["@key"])}

            directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE
            ${federationDefinitions}

            type Account @key(fields: "id") @federation__context(name: "accountCtx") {
              id: ID!
              locale: String!
            }

            type Formatter @key(fields: "id") {
              id: ID!
              format(
                locale: String @federation__fromContext(field: "$accountCtx { locale }")
              ): String!
            }

            type Query {
              account(id: ID!): Account
            }
          `),
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
      expectNamespacedContextInSupergraph(result.supergraphSdl);
    });

    test("`_service.sdl` of a subgraph that imports and uses @context / @fromContext", () => {
      const typeDefs = serviceSdl(
        /* GraphQL */ `
          extend schema ${link(["@key", "@context", "@fromContext"])}

          type Account @key(fields: "id") @context(name: "accountCtx") {
            id: ID!
            locale: String!
          }

          type Formatter @key(fields: "id") {
            id: ID!
            format(
              locale: String @fromContext(field: "$accountCtx { locale }")
            ): String!
          }

          type Query {
            account(id: ID!): Account
          }
        `,
        "accounts",
      );

      const names = directiveDefinitionNames(typeDefs);
      expect(names).toContain("context");
      expect(names).toContain("fromContext");
      expect(names).not.toContain("federation__context");

      const result = api.composeServices([
        { name: "accounts", typeDefs, url: "http://accounts" },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Account
          @join__type(graph: ACCOUNTS, key: "id")
          @context(name: "accounts__accountCtx") {
          id: ID!
          locale: String!
        }
      `);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Formatter @join__type(graph: ACCOUNTS, key: "id") {
          id: ID!
          format: String!
            @join__field(
              graph: ACCOUNTS
              contextArguments: [
                {
                  context: "accounts__accountCtx"
                  name: "locale"
                  type: "String"
                  selection: " { locale }"
                }
              ]
            )
        }
      `);
    });

    test("`_service.sdl` of a subgraph that uses the namespaced directives without importing them", () => {
      const typeDefs = serviceSdl(
        /* GraphQL */ `
          extend schema ${link(["@key"])}

          type Account @key(fields: "id") @federation__context(name: "accountCtx") {
            id: ID!
            locale: String!
          }

          type Formatter @key(fields: "id") {
            id: ID!
            format(
              locale: String @federation__fromContext(field: "$accountCtx { locale }")
            ): String!
          }

          type Query {
            account(id: ID!): Account
          }
        `,
        "accounts",
      );

      const result = api.composeServices([
        { name: "accounts", typeDefs, url: "http://accounts" },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
      expectNamespacedContextInSupergraph(result.supergraphSdl);
    });

    test("`_service.sdl` from two subgraphs sharing a context name", () => {
      const subgraph = (name: string, type: string) =>
        serviceSdl(
          /* GraphQL */ `
            extend schema ${link(["@key", "@context", "@fromContext"])}

            type ${type} @key(fields: "id") @context(name: "sourceCtx") {
              id: ID!
              reference: String!
            }

            type Auditor @key(fields: "id") {
              id: ID!
              audit${type}(
                ref: String @fromContext(field: "$sourceCtx { reference }")
              ): Int!
            }

            type Query {
              ${type.toLowerCase()}(id: ID!): ${type}
            }
          `,
          name,
        );

      const result = api.composeServices([
        {
          name: "invoices",
          url: "http://invoices",
          typeDefs: subgraph("invoices", "Invoice"),
        },
        {
          name: "shipments",
          url: "http://shipments",
          typeDefs: subgraph("shipments", "Parcel"),
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Invoice
          @join__type(graph: INVOICES, key: "id")
          @context(name: "invoices__sourceCtx") {
          id: ID!
          reference: String!
        }
      `);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Parcel
          @join__type(graph: SHIPMENTS, key: "id")
          @context(name: "shipments__sourceCtx") {
          id: ID!
          reference: String!
        }
      `);
    });

    test("`_service.sdl` of federation v2.7 and v2.8+ subgraphs composed together", () => {
      const result = api.composeServices([
        {
          name: "legacy",
          url: "http://legacy",
          typeDefs: serviceSdl(
            /* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/v2.7"
                  import: ["@key"]
                )

              type Query {
                product(id: ID!): Product
              }

              type Product @key(fields: "id") {
                id: ID!
                name: String
              }
            `,
            "legacy",
          ),
        },
        {
          name: "modern",
          url: "http://modern",
          typeDefs: serviceSdl(
            /* GraphQL */ `
              extend schema ${link(["@key"])}

              type Product @key(fields: "id") {
                id: ID!
                inStock: Boolean!
              }
            `,
            "modern",
          ),
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
    });

    test("a definition with a subset of locations is accepted", () => {
      const result = api.composeServices([
        {
          name: "products",
          url: "http://products",
          typeDefs: graphql`
            extend schema ${link(["@key"])}

            directive @federation__context(name: String!) repeatable on OBJECT
            directive @federation__fromContext(field: federation__ContextFieldValue) on ARGUMENT_DEFINITION

            scalar federation__ContextFieldValue

            type Query {
              product(id: ID!): Product
            }

            type Product @key(fields: "id") {
              id: ID!
            }
          `,
        },
      ]);

      expectNoDuplicateDirectiveErrors(result);
      assertCompositionSuccess(result);
    });

    test("a definition with wrong locations is rejected with DIRECTIVE_DEFINITION_INVALID", () => {
      const result = api.composeServices([
        {
          name: "products",
          url: "http://products",
          typeDefs: graphql`
            extend schema ${link(["@key"])}

            directive @federation__context(name: String!) repeatable on FIELD_DEFINITION

            type Query {
              product(id: ID!): Product
            }

            type Product @key(fields: "id") {
              id: ID!
            }
          `,
        },
      ]);

      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          // Apollo reports the name used in the subgraph, we report the spec name
          message:
            api.library === "apollo"
              ? '[products] Invalid definition for directive "@federation__context": "@federation__context" should have locations INTERFACE, OBJECT, UNION, but found (non-subset) FIELD_DEFINITION'
              : '[products] Invalid definition for directive "@context": "@context" should have locations INTERFACE, OBJECT, UNION, but found (non-subset) FIELD_DEFINITION',
          extensions: expect.objectContaining({
            code: "DIRECTIVE_DEFINITION_INVALID",
          }),
        }),
      );
    });

    test("a definition with a missing required argument is rejected with DIRECTIVE_DEFINITION_INVALID", () => {
      const result = api.composeServices([
        {
          name: "products",
          url: "http://products",
          typeDefs: graphql`
            extend schema ${link(["@key"])}

            directive @federation__context repeatable on INTERFACE | OBJECT | UNION

            type Query {
              product(id: ID!): Product
            }

            type Product @key(fields: "id") {
              id: ID!
            }
          `,
        },
      ]);

      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? '[products] Invalid definition for directive "@federation__context": missing required argument "name"'
              : '[products] Invalid definition for directive "@context": missing required argument "name"',
          extensions: expect.objectContaining({
            code: "DIRECTIVE_DEFINITION_INVALID",
          }),
        }),
      );
    });

    // Apollo throws on a duplicated directive definition instead of reporting a composition error
    if (api.library === "guild") {
      test("a directive defined twice by the user is still reported as a duplicate", () => {
        const result = api.composeServices([
          {
            name: "products",
            url: "http://products",
            typeDefs: graphql`
            extend schema ${link(["@key"])}

            directive @federation__context(name: String!) repeatable on INTERFACE | OBJECT | UNION
            directive @federation__context(name: String!) repeatable on INTERFACE | OBJECT | UNION

            type Query {
              product(id: ID!): Product
            }

            type Product @key(fields: "id") {
              id: ID!
            }
          `,
          },
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining(
              'There can be only one directive named "@federation__context"',
            ),
          }),
        );
      });
    }
  });
});
