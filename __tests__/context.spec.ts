import { DocumentNode, parse, print } from "graphql";
import { describe, expect, test } from "vitest";
import { sortSDL } from "../src/graphql/sort-sdl.js";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "./shared/testkit.js";

expect.addSnapshotSerializer({
  serialize: (value) => print(sortSDL(parse(value as string))),
  test: (value) =>
    typeof value === "string" && value.includes("specs.apollo.dev"),
});

function federationSchema(
  version: string,
  document: DocumentNode,
  extraImports: string[] = [],
) {
  const federationImports = [
    "@key",
    "@shareable",
    "@external",
    "@context",
    "@fromContext",
    "@authenticated",
    "@interfaceObject",
    ...extraImports,
  ];
  const linkedSchema = parse(/* GraphQL */ `
    extend schema
      @link(
        url: "https://specs.apollo.dev/federation/${version}"
        import: [
          ${federationImports.map((directive) => `"${directive}"`).join("\n          ")}
        ]
      )
  `);

  return {
    ...linkedSchema,
    definitions: [...linkedSchema.definitions, ...document.definitions],
  };
}

testVersions((api, version) => {
  const compose = api.composeServices;
  const subgraph = (
    name: string,
    typeDefs: DocumentNode,
    extraImports?: string[],
  ) => ({
    name,
    typeDefs: federationSchema(version, typeDefs, extraImports),
  });
  const expectContextSpecDefinitions = (supergraphSdl: string) => {
    expect(supergraphSdl).toContainGraphQL(graphql`
        schema
          @link(for: EXECUTION, url: "https://specs.apollo.dev/join/v0.5")
          @link(for: SECURITY, url: "https://specs.apollo.dev/context/v0.1")
          @link(url: "https://specs.apollo.dev/link/v1.0") {
          query: Query
        }
      `);
    expect(supergraphSdl).toContainGraphQL(graphql`
        directive @context(
          name: String!
        ) repeatable on INTERFACE | OBJECT | UNION
      `);
    expect(supergraphSdl).toContainGraphQL(graphql`
        scalar context__ContextFieldValue
      `);
    expect(supergraphSdl).toContainGraphQL(graphql`
        directive @context__fromContext(
          field: context__ContextFieldValue
        ) on ARGUMENT_DEFINITION
      `);
    expect(supergraphSdl).toContainGraphQL(graphql`
        input join__ContextArgument {
          name: String!
          type: String!
          context: String!
          selection: join__FieldValue!
        }
      `);
  };

  if (satisfiesVersionRange("< v2.8", version)) {
    test("rejects the context directives before federation 2.8", () => {
      const result = compose([
        subgraph(
          "orders",
          graphql`
              type Customer @key(fields: "id") @context(name: "customerCtx") {
                id: ID!
                segment: String!
              }

              type Query {
                customer(id: ID!): Customer
              }
            `,
        ),
      ]);

      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[orders] Cannot import unknown element "@context".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
    });
    return;
  }

  describe("@context and @fromContext location", () => {
    describe("the context name", () => {
      test("rejects a context name that has an underscore", () => {
        const result = compose([
          subgraph(
            "accounts",
            graphql`
                type Account @key(fields: "id") @context(name: "bad_name") {
                  id: ID!
                }

                type Query {
                  account(id: ID!): Account
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              api.library === "apollo"
                ? '[accounts] Context name "bad_name" may not contain an underscore.'
                : '[accounts] Context name "bad_name" is invalid. It should have only alphanumeric characters.',
            extensions: expect.objectContaining({
              code: "CONTEXT_NAME_INVALID",
            }),
          }),
        );
      });

      test("rejects an empty context name", () => {
        const result = compose([
          subgraph(
            "accounts",
            graphql`
                type Account @key(fields: "id") @context(name: "") {
                  id: ID!
                }

                type Query {
                  account(id: ID!): Account
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[accounts] Context name "" is invalid. It should have only alphanumeric characters.',
            extensions: expect.objectContaining({
              code: "CONTEXT_NAME_INVALID",
            }),
          }),
        );
      });
    });

    describe("argument", () => {
      test("rejects @fromContext on argument that has a default value", () => {
        const result = compose([
          subgraph(
            "accounts",
            graphql`
                type Account @key(fields: "id") @context(name: "accountCtx") {
                  id: ID!
                  locale: String!
                }

                type Formatter @key(fields: "id") {
                  id: ID!
                  format(
                    locale: String = "en-US"
                      @fromContext(field: "$accountCtx { locale }")
                  ): Int!
                }

                type Query {
                  account(id: ID!): Account
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[accounts] @fromContext arguments may not have a default value: "Formatter.format(locale:)".',
            extensions: expect.objectContaining({ code: "CONTEXT_NOT_SET" }),
          }),
        );
      });

      test("rejects @fromContext on the argument of a directive", () => {
        const result = compose([
          subgraph(
            "accounts",
            graphql`
                directive @tenant(
                  locale: String @fromContext(field: "$accountCtx { locale }")
                ) on FIELD_DEFINITION

                type Account @key(fields: "id") @context(name: "accountCtx") {
                  id: ID!
                  locale: String!
                }

                type Query {
                  account(id: ID!): Account
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[accounts] @fromContext argument cannot be used on a directive definition "@tenant(locale:)".',
            extensions: expect.objectContaining({ code: "CONTEXT_NOT_SET" }),
          }),
        );
      });

      test("rejects @fromContext if the parent type is abstract", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                interface MeteredDevice
                  @key(fields: "id")
                  @context(name: "meterCtx") {
                  id: ID!
                  voltage: Float!
                  trip(
                    v: Float @fromContext(field: "$meterCtx { voltage }")
                  ): Int!
                }

                type Sensor implements MeteredDevice @key(fields: "id") {
                  id: ID!
                  voltage: Float!
                  trip(v: Float): Int!
                }

                type Query {
                  device: MeteredDevice
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] @fromContext argument cannot be used on a field that exists on an abstract type "MeteredDevice.trip(v:)".',
            extensions: expect.objectContaining({ code: "CONTEXT_NOT_SET" }),
          }),
        );
      });

      test("rejects @fromContext on a field that implements an interface field", () => {
        const result = compose([
          subgraph(
            "accounts",
            graphql`
                interface Renderable {
                  id: ID!
                  render(locale: String): Int!
                }

                type Account @key(fields: "id") @context(name: "accountCtx") {
                  id: ID!
                  locale: String!
                }

                type Formatter implements Renderable @key(fields: "id") {
                  id: ID!
                  render(
                    locale: String @fromContext(field: "$accountCtx { locale }")
                  ): Int!
                }

                type Query {
                  account(id: ID!): Account
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[accounts] @fromContext argument cannot be used on a field implementing an interface field "Renderable.render".',
            extensions: expect.objectContaining({ code: "CONTEXT_NOT_SET" }),
          }),
        );
      });

      test("rejects @fromContext on an implementation if the interface field has no argument", () => {
        const result = compose([
          subgraph(
            "accounts",
            graphql`
                interface Renderable {
                  id: ID!
                  render: Int!
                }

                type Account @key(fields: "id") @context(name: "accountCtx") {
                  id: ID!
                  locale: String!
                  formatter: Formatter!
                }

                type Formatter implements Renderable @key(fields: "id") {
                  id: ID!
                  render(
                    locale: String @fromContext(field: "$accountCtx { locale }")
                  ): Int!
                }

                type Query {
                  account(id: ID!): Account
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[accounts] @fromContext argument cannot be used on a field implementing an interface field "Renderable.render".',
            extensions: expect.objectContaining({ code: "CONTEXT_NOT_SET" }),
          }),
        );
      });
    });
  });
  describe("invalid references and unsupported selection syntax", () => {
    test("rejects a selected field that the provider type does not have", () => {
      const result = compose([
        subgraph(
          "reviews",
          graphql`
              type Review @key(fields: "id") @context(name: "reviewCtx") {
                id: ID!
                sentiment: String!
              }

              type ReviewScorer @key(fields: "id") {
                id: ID!
                score(
                  language: String
                    @fromContext(field: "$reviewCtx { language }")
                ): Int!
              }

              type Query {
                review(id: ID!): Review
              }
            `,
        ),
      ]);

      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            '[reviews] Context "reviewCtx" is used in "ReviewScorer.score(language:)" but the selection is invalid for type Review. Error: Cannot query field "language" on type "Review".',
          extensions: expect.objectContaining({
            code: "CONTEXT_INVALID_SELECTION",
          }),
        }),
      );
    });

    describe("the context reference", () => {
      test("rejects @fromContext when there's no @context", () => {
        const result = compose([
          subgraph(
            "reviews",
            graphql`
                type Review @key(fields: "id") {
                  id: ID!
                  sentiment: String!
                  score(
                    sentiment: String
                      @fromContext(field: "$reviewCtx { sentiment }")
                  ): Int!
                }

                type Query {
                  review(id: ID!): Review
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[reviews] Context "reviewCtx" is used at location "Review.score(sentiment:)" but is never set.',
            extensions: expect.objectContaining({ code: "CONTEXT_NOT_SET" }),
          }),
        );
      });

      test("rejects a @fromContext that starts with a selection", () => {
        const result = compose([
          subgraph(
            "reviews",
            graphql`
                type Review @key(fields: "id") @context(name: "reviewCtx") {
                  id: ID!
                  sentiment: String!
                }

                type ReviewScorer @key(fields: "id") {
                  id: ID!
                  score(
                    sentiment: String @fromContext(field: "{ sentiment }")
                  ): Int!
                }

                type Query {
                  review(id: ID!): Review
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[reviews] @fromContext argument does not reference a context "{ sentiment }".',
            extensions: expect.objectContaining({
              code: "NO_CONTEXT_IN_SELECTION",
            }),
          }),
        );
      });

      test("rejects a @fromContext that is only a field name", () => {
        const result = compose([
          subgraph(
            "reviews",
            graphql`
                type Review @key(fields: "id") @context(name: "reviewCtx") {
                  id: ID!
                  sentiment: String!
                }

                type ReviewScorer @key(fields: "id") {
                  id: ID!
                  score(
                    sentiment: String @fromContext(field: "sentiment")
                  ): Int!
                }

                type Query {
                  review(id: ID!): Review
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[reviews] @fromContext argument does not reference a context "sentiment".',
            extensions: expect.objectContaining({
              code: "NO_CONTEXT_IN_SELECTION",
            }),
          }),
        );
      });
    });

    describe("unsupported selection syntax", () => {
      const rejectedSelectionShapes = [
        {
          title: "two sibling fields",
          source: "$reviewCtx { sentiment language }",
          message:
            '[reviews] Context "reviewCtx" is used in "ReviewScorer.score(sentiment:)" but the selection is invalid: multiple selections are made',
        },
        {
          title: "a field alias",
          source: "$reviewCtx { value: sentiment }",
          message:
            '[reviews] Context "reviewCtx" is used in "ReviewScorer.score(sentiment:)" but the selection is invalid: aliases are not allowed in the selection',
        },
        {
          title: "a query directive",
          source: "$reviewCtx { sentiment @skip(if: true) }",
          message:
            '[reviews] Context "reviewCtx" is used in "ReviewScorer.score(sentiment:)" but the selection is invalid: directives are not allowed in the selection',
        },
      ];

      for (const testCase of rejectedSelectionShapes) {
        test(`rejects ${testCase.title} inside @fromContext`, () => {
          const result = compose([
            subgraph(
              "reviews",
              graphql`
                  type Review @key(fields: "id") @context(name: "reviewCtx") {
                    id: ID!
                    sentiment: String!
                    language: String!
                  }

                  type ReviewScorer @key(fields: "id") {
                    id: ID!
                    score(sentiment: String @fromContext(field: "${testCase.source}")): Int!
                  }

                  type Query {
                    review(id: ID!): Review
                  }
                `,
            ),
          ]);

          assertCompositionFailure(result);
          expect(result.errors).toContainEqual(
            expect.objectContaining({
              message: testCase.message,
              extensions: expect.objectContaining({
                code: "CONTEXT_INVALID_SELECTION",
              }),
            }),
          );
        });
      }

      test("rejects fragment spreads inside a @fromContext", () => {
        const result = compose([
          subgraph(
            "reviews",
            graphql`
                type Review @key(fields: "id") @context(name: "reviewCtx") {
                  id: ID!
                  sentiment: String!
                }

                type ReviewScorer @key(fields: "id") {
                  id: ID!
                  score(
                    sentiment: String
                      @fromContext(field: "$reviewCtx { ...SentimentFragment }")
                  ): Int!
                }

                type Query {
                  review(id: ID!): Review
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[reviews] Context "reviewCtx" is used in "ReviewScorer.score(sentiment:)" but the selection is invalid: fragment spread is not allowed',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });

      test("rejects @fromContext that mixes fields and inline fragments", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                union DeviceSource = Sensor

                type Sensor @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    model: String
                      @fromContext(
                        field: "$deviceCtx { ... on Sensor { model } model }"
                      )
                  ): Int!
                }

                type Query {
                  source: DeviceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] Context "deviceCtx" is used in "Diagnostics.inspect(model:)" but the selection is invalid: multiple fields could be selected',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });

      test("rejects a field with an inline fragment in @fromContext", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                union DeviceSource = Sensor

                type Sensor @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    model: String
                      @fromContext(
                        field: "$deviceCtx { model ... on Sensor { model } }"
                      )
                  ): Int!
                }

                type Query {
                  source: DeviceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] Context "deviceCtx" is used in "Diagnostics.inspect(model:)" but the selection is invalid: multiple selections are made',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });
    });

    describe("type conditions", () => {
      test("rejects interface type conditions in inline fragments", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                interface Meter {
                  id: ID!
                  voltage: Float!
                }

                type Sensor implements Meter
                  @key(fields: "id")
                  @context(name: "deviceCtx") {
                  id: ID!
                  voltage: Float!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    voltage: Float
                      @fromContext(
                        field: "$deviceCtx { ... on Meter { voltage } }"
                      )
                  ): Int!
                }

                type Query {
                  sensor: Sensor
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] Context "deviceCtx" is used in "Diagnostics.inspect(voltage:)" but the selection is invalid: no type condition matches the location "Sensor"',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });

      test("rejects a type condition that the selection does not use", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                union DeviceSource = Sensor | Controller

                type Camera {
                  id: ID!
                  model: String!
                }

                type Sensor @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Controller @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    model: String
                      @fromContext(
                        field: "$deviceCtx { ... on Sensor { model } ... on Controller { model } ... on Camera { model } }"
                      )
                  ): Int!
                }

                type Query {
                  source: DeviceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] Context "deviceCtx" is used in "Diagnostics.inspect(model:)" but the selection is invalid: type condition "Camera" is never used.',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });

      test("rejects an inline fragment branch that is not a runtime type", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                union DeviceSource = Sensor | Controller

                type Camera {
                  id: ID!
                  model: String!
                }

                type Sensor @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Controller @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    model: String
                      @fromContext(
                        field: "$deviceCtx { ... on Sensor { model } ... on Controller { model } ... on Gateway { model } }"
                      )
                  ): Int!
                }

                type Query {
                  source: DeviceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] Context "deviceCtx" is used in "Diagnostics.inspect(model:)" but the selection is invalid: type condition "Gateway" is never used.',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });
    });
  });
  describe("selected context values", () => {
    describe("concrete providers", () => {
      test("accepts equivalent selections from multiple concrete providers", () => {
        const result = compose([
          subgraph(
            "pricing",
            graphql`
                union PriceSource =
                  | RetailAccount
                  | WholesaleAccount
                  | GuestQuote

                type GuestQuote {
                  id: ID!
                  note: String
                }

                type RetailAccount
                  @key(fields: "id")
                  @context(name: "priceCtx") {
                  id: ID!
                  currency: String!
                }

                type WholesaleAccount
                  @key(fields: "id")
                  @context(name: "priceCtx") {
                  id: ID!
                  currency: String!
                }

                type QuoteEngine @key(fields: "serialNumber") {
                  serialNumber: String!
                  estimateCost(
                    preferredCurrency: String
                      @fromContext(field: "$priceCtx { currency }")
                  ): Float
                }

                type Query {
                  source: PriceSource
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type QuoteEngine @join__type(graph: PRICING, key: "serialNumber") {
              serialNumber: String!
              estimateCost: Float
                @join__field(
                  graph: PRICING
                  contextArguments: [
                    {
                      context: "pricing__priceCtx"
                      name: "preferredCurrency"
                      type: "String"
                      selection: " { currency }"
                    }
                  ]
                )
            }
          `);
      });

      test("accepts __typename from an object context provider", () => {
        const result = compose([
          subgraph(
            "catalog",
            graphql`
                type Product @key(fields: "id") @context(name: "productCtx") {
                  id: ID!
                  inspector: ProductInspector!
                }

                type ProductInspector @key(fields: "id") {
                  id: ID!
                  identify(
                    typeName: String
                      @fromContext(field: "$productCtx { __typename }")
                  ): String!
                }

                type Query {
                  product(id: ID!): Product
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type ProductInspector @join__type(graph: CATALOG, key: "id") {
              id: ID!
              identify: String!
                @join__field(
                  graph: CATALOG
                  contextArguments: [
                    {
                      context: "catalog__productCtx"
                      name: "typeName"
                      type: "String"
                      selection: " { __typename }"
                    }
                  ]
                )
            }
          `);
      });

      test("rejects a selection if the value type is different between the providers", () => {
        const result = compose([
          subgraph(
            "pricing",
            graphql`
                union PriceSource =
                  | RetailAccount
                  | WholesaleAccount
                  | GuestQuote

                type GuestQuote {
                  id: ID!
                  note: String
                }

                type RetailAccount
                  @key(fields: "id")
                  @context(name: "priceCtx") {
                  id: ID!
                  currency: String!
                }

                type WholesaleAccount
                  @key(fields: "id")
                  @context(name: "priceCtx") {
                  id: ID!
                  currency: Int!
                }

                type QuoteEngine @key(fields: "id") {
                  id: ID!
                  calculate(
                    currency: String
                      @fromContext(field: "$priceCtx { currency }")
                  ): Int!
                }

                type Query {
                  source: PriceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[pricing] Context "priceCtx" is used in "QuoteEngine.calculate(currency:)" but the selection is invalid: the type of the selection "Int" does not match the expected type "String"',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });

      test("rejects nullable context values for non-null @fromContext", () => {
        const result = compose([
          subgraph(
            "pricing",
            graphql`
                type RetailAccount
                  @key(fields: "id")
                  @context(name: "priceCtx") {
                  id: ID!
                  currency: String
                }

                type QuoteEngine @key(fields: "id") {
                  id: ID!
                  calculate(
                    currency: String!
                      @fromContext(field: "$priceCtx { currency }")
                  ): Int!
                }

                type Query {
                  account(id: ID!): RetailAccount
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[pricing] Context "priceCtx" is used in "QuoteEngine.calculate(currency:)" but the selection is invalid: the type of the selection "String" does not match the expected type "String!"',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });
    });

    describe("interfaces and unions", () => {
      test("accepts __typename from an interface context provider", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                interface Node @key(fields: "id") @context(name: "nodeCtx") {
                  id: ID!
                }

                type Sensor implements Node @key(fields: "id") {
                  id: ID!
                  label: String!
                }

                type Controller implements Node @key(fields: "id") {
                  id: ID!
                  label: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    kind: String @fromContext(field: "$nodeCtx { __typename }")
                  ): String!
                }

                type Query {
                  device: Node
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Diagnostics @join__type(graph: DEVICES, key: "id") {
              id: ID!
              inspect: String!
                @join__field(
                  graph: DEVICES
                  contextArguments: [
                    {
                      context: "devices__nodeCtx"
                      name: "kind"
                      type: "String"
                      selection: " { __typename }"
                    }
                  ]
                )
            }
          `);
      });

      test("accepts a context on an interface if the interface has the selected field", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                interface MeteredDevice
                  @key(fields: "id")
                  @context(name: "meterCtx") {
                  id: ID!
                  voltage: Float!
                  amperage: Float
                }

                type Sensor implements MeteredDevice @key(fields: "id") {
                  id: ID!
                  voltage: Float!
                  amperage: Float
                }

                type Controller implements MeteredDevice @key(fields: "id") {
                  id: ID!
                  voltage: Float!
                  amperage: Float
                }

                type SafetyRelay @key(fields: "id") {
                  id: ID!
                  trip(
                    v: Float @fromContext(field: "$meterCtx { voltage }")
                  ): Int!
                }

                type Query {
                  device: MeteredDevice
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            interface MeteredDevice
              @join__type(graph: DEVICES, key: "id")
              @context(name: "devices__meterCtx") {
              id: ID!
              voltage: Float!
              amperage: Float
            }
          `);
      });

      test("accepts an interface context that concrete branches resolve", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                interface MeteredDevice
                  @key(fields: "id")
                  @context(name: "meterCtx") {
                  id: ID!
                }

                type Sensor implements MeteredDevice @key(fields: "id") {
                  id: ID!
                  reading: Float!
                }

                type Controller implements MeteredDevice @key(fields: "id") {
                  id: ID!
                  reading: Float!
                }

                type SafetyRelay @key(fields: "id") {
                  id: ID!
                  trip(
                    reading: Float
                      @fromContext(
                        field: "$meterCtx { ... on Sensor { reading } ... on Controller { reading } }"
                      )
                  ): Int!
                }

                type Query {
                  device: MeteredDevice
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
      });

      test("rejects a context field on a union if one provider does not have the field", () => {
        const result = compose([
          subgraph(
            "media",
            graphql`
                union PlayableAsset @context(name: "assetCtx") = Film | Trailer

                type Film @key(fields: "id") @context(name: "assetCtx") {
                  id: ID!
                  rating: String!
                  player: Player!
                }

                type Trailer @key(fields: "id") @context(name: "assetCtx") {
                  id: ID!
                  campaign: String!
                  player: Player!
                }

                type Player @key(fields: "id") {
                  id: ID!
                  start(
                    rating: String @fromContext(field: "$assetCtx { rating }")
                  ): Int!
                }

                type Query {
                  asset: PlayableAsset
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              api.library === "apollo"
                ? '[media] Context "assetCtx" is used in "Player.start(rating:)" but the selection is invalid for type PlayableAsset. Error: Cannot query field "rating" on type "PlayableAsset".'
                : '[media] Context "assetCtx" is used in "Player.start(rating:)" but the selection is invalid for type Trailer. Error: Cannot query field "rating" on type "Trailer".',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });
    });

    describe("type conditions", () => {
      test("accepts explicit branch selections if the providers have different field names", () => {
        const result = compose([
          subgraph(
            "fulfillment",
            graphql`
                union DeliverySource =
                  | CourierDelivery
                  | LockerPickup
                  | StorePickup

                type StorePickup {
                  id: ID!
                  desk: String
                }

                type CourierDelivery
                  @key(fields: "id")
                  @context(name: "deliveryCtx") {
                  id: ID!
                  courierZone: String!
                }

                type LockerPickup
                  @key(fields: "id")
                  @context(name: "deliveryCtx") {
                  id: ID!
                  lockerZone: String!
                }

                type RoutePlanner @key(fields: "id") {
                  id: ID!
                  plan(
                    zone: String
                      @fromContext(
                        field: "$deliveryCtx { ... on CourierDelivery { courierZone } ... on LockerPickup { lockerZone } }"
                      )
                  ): Int!
                }

                type Query {
                  source: DeliverySource
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type RoutePlanner @join__type(graph: FULFILLMENT, key: "id") {
              id: ID!
              plan: Int!
                @join__field(
                  graph: FULFILLMENT
                  contextArguments: [
                    {
                      context: "fulfillment__deliveryCtx"
                      name: "zone"
                      type: "String"
                      selection: " { ... on CourierDelivery { courierZone } ... on LockerPickup { lockerZone } }"
                    }
                  ]
                )
            }
          `);
      });

      test("rejects type conditions that do not include a concrete context provider", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                union DeviceSource = Sensor | Controller | Camera

                type Camera {
                  id: ID!
                  model: String!
                }

                type Sensor @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Controller @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    model: String
                      @fromContext(
                        field: "$deviceCtx { ... on Gateway { model } }"
                      )
                  ): Int!
                }

                type Query {
                  source: DeviceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] Context "deviceCtx" is used in "Diagnostics.inspect(model:)" but the selection is invalid: no type condition matches the location "Sensor"',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });

      test("rejects a conditional selection if no inline fragment branch is a runtime type", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                union DeviceSource = Sensor | Controller | Camera

                type Camera {
                  id: ID!
                  model: String!
                }

                type Sensor @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Controller @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    model: String
                      @fromContext(
                        field: "$deviceCtx { ... on Gateway { model } ... on Router { model } }"
                      )
                  ): Int!
                }

                type Query {
                  source: DeviceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] Context "deviceCtx" is used in "Diagnostics.inspect(model:)" but the selection is invalid: no type condition matches the location "Sensor"',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });

      test("rejects two branches that have the same type condition", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                union DeviceSource = Sensor | Controller

                type Sensor @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Controller @key(fields: "id") @context(name: "deviceCtx") {
                  id: ID!
                  model: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    model: String
                      @fromContext(
                        field: "$deviceCtx { ... on Sensor { model } ... on Sensor { model } }"
                      )
                  ): Int!
                }

                type Query {
                  source: DeviceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[devices] Context "deviceCtx" is used in "Diagnostics.inspect(model:)" but the selection is invalid: type conditions have same name',
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
      });
    });
  });
  describe("supergraph", () => {
    test("does not leak federation__ContextFieldValue from service SDL", () => {
      const result = compose([
        subgraph(
          "accounts",
          graphql`
              scalar federation__ContextFieldValue

              type Query {
                account: Account
              }

              type Account @context(name: "accountCtx") {
                locale: String!
              }
            `,
        ),
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).not.toContain(
        "scalar federation__ContextFieldValue",
      );
    });

    const materializedContextCases = [
      {
        title: "writes a nested scalar selection to the join metadata",
        services: [
          subgraph(
            "orders",
            graphql`
                type LoyaltyProfile @shareable {
                  id: ID!
                  tier: String!
                  discountCode: String
                }

                type Customer @key(fields: "id") @context(name: "customerCtx") {
                  id: ID!
                  profile: LoyaltyProfile!
                  cart: Cart!
                }

                type Cart @key(fields: "id") {
                  id: ID!
                  checkout(
                    tier: String
                      @fromContext(field: "$customerCtx { profile { tier } }")
                  ): Int!
                }

                type Query {
                  customer(id: ID!): Customer
                }
              `,
          ),
        ],
        expectedPublicType: graphql`
            type Cart {
              id: ID!
              checkout: Int!
            }
          `,
        expectedJoinField: graphql`
            type Cart @join__type(graph: ORDERS, key: "id") {
              id: ID!
              checkout: Int!
                @join__field(
                  graph: ORDERS
                  contextArguments: [
                    {
                      context: "orders__customerCtx"
                      name: "tier"
                      type: "String"
                      selection: " { profile { tier } }"
                    }
                  ]
                )
            }
          `,
      },
      {
        title: "writes a list-valued context selection to the join metadata",
        services: [
          subgraph(
            "warehouse",
            graphql`
                type StockItem {
                  sku: String!
                }

                type Shelf
                  @key(fields: "shelfCode")
                  @context(name: "shelfCtx") {
                  shelfCode: String!
                  items: [StockItem!]!
                  robot: PickRobot!
                }

                type PickRobot @key(fields: "serial") {
                  serial: ID!
                  reserveItems(
                    skus: [String]
                      @fromContext(field: "$shelfCtx { items { sku } }")
                  ): [String!]!
                }

                type Query {
                  shelf(shelfCode: String!): Shelf
                }
              `,
          ),
        ],
        expectedPublicType: graphql`
            type PickRobot {
              serial: ID!
              reserveItems: [String!]!
            }
          `,
        expectedJoinField: graphql`
            type PickRobot @join__type(graph: WAREHOUSE, key: "serial") {
              serial: ID!
              reserveItems: [String!]!
                @join__field(
                  graph: WAREHOUSE
                  contextArguments: [
                    {
                      context: "warehouse__shelfCtx"
                      name: "skus"
                      type: "[String]"
                      selection: " { items { sku } }"
                    }
                  ]
                )
            }
          `,
      },
    ];

    for (const testCase of materializedContextCases) {
      test(testCase.title, () => {
        const result = compose(testCase.services);

        assertCompositionSuccess(result);
        expect(result.publicSdl).not.toContain("@context");
        expect(result.publicSdl).not.toContain("@fromContext");
        expect(result.publicSdl).not.toContain("join__ContextArgument");
        expect(result.publicSdl).toContainGraphQL(
          testCase.expectedPublicType,
        );

        expectContextSpecDefinitions(result.supergraphSdl);
        expect(result.supergraphSdl).toContainGraphQL(
          testCase.expectedJoinField,
        );
      });
    }

    test("adds the subgraph name to each context name", () => {
      const result = compose([
        subgraph(
          "invoices",
          graphql`
              type Invoice @key(fields: "id") @context(name: "sourceCtx") {
                id: ID!
                reference: String!
              }

              type Auditor @key(fields: "id") {
                id: ID!
                auditInvoice(
                  ref: String @fromContext(field: "$sourceCtx { reference }")
                ): Int!
              }

              type Query {
                invoice(id: ID!): Invoice
              }
            `,
        ),
        subgraph(
          "shipments",
          graphql`
              type Parcel @key(fields: "id") @context(name: "sourceCtx") {
                id: ID!
                reference: String!
              }

              type Auditor @key(fields: "id") {
                id: ID!
                auditShipment(
                  ref: String @fromContext(field: "$sourceCtx { reference }")
                ): Int!
              }

              type Query {
                parcel(id: ID!): Parcel
              }
            `,
        ),
      ]);

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
  });
  describe("context providers and the public API", () => {
    describe("type and interface extensions", () => {
      test("accepts a context on a type extension", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") {
                  id: ID!
                  plan: String!
                }

                extend type Member @context(name: "memberCtx") {
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Member
              @join__type(graph: BENEFITS, key: "id")
              @context(name: "benefits__memberCtx") {
              id: ID!
              plan: String!
              wallet: Wallet!
            }
          `);
      });

      test("accepts a context on an interface extension", () => {
        const result = compose([
          subgraph(
            "devices",
            graphql`
                interface Node @key(fields: "id") {
                  id: ID!
                }

                extend interface Node @context(name: "nodeCtx") {
                  label: String!
                }

                type Sensor implements Node @key(fields: "id") {
                  id: ID!
                  label: String!
                }

                type Diagnostics @key(fields: "id") {
                  id: ID!
                  inspect(
                    label: String @fromContext(field: "$nodeCtx { label }")
                  ): String!
                }

                type Query {
                  device: Node
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Diagnostics @join__type(graph: DEVICES, key: "id") {
              id: ID!
              inspect: String!
                @join__field(
                  graph: DEVICES
                  contextArguments: [
                    {
                      context: "devices__nodeCtx"
                      name: "label"
                      type: "String"
                      selection: " { label }"
                    }
                  ]
                )
            }
          `);
      });
    });

    describe("resolvable keys", () => {
      test("accepts @fromContext on a type extension if the base type has a resolvable key", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                }

                extend type Wallet {
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Wallet @join__type(graph: BENEFITS, key: "id") {
              id: ID!
              apply: Int!
                @join__field(
                  graph: BENEFITS
                  contextArguments: [
                    {
                      context: "benefits__memberCtx"
                      name: "plan"
                      type: "String"
                      selection: " { plan }"
                    }
                  ]
                )
            }
          `);
      });

      test("accepts @fromContext if one of the keys is not resolvable", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                }

                type Wallet
                  @key(fields: "id", resolvable: false)
                  @key(fields: "legacyId") {
                  id: ID!
                  legacyId: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Wallet
              @join__type(graph: BENEFITS, key: "id", resolvable: false)
              @join__type(graph: BENEFITS, key: "legacyId") {
              id: ID!
              legacyId: ID!
              apply: Int!
                @join__field(
                  graph: BENEFITS
                  contextArguments: [
                    {
                      context: "benefits__memberCtx"
                      name: "plan"
                      type: "String"
                      selection: " { plan }"
                    }
                  ]
                )
            }
          `);
      });

      test("accepts @fromContext on a type extension if one of the base keys is not resolvable", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                  wallet: Wallet!
                }

                type Wallet
                  @key(fields: "id", resolvable: false)
                  @key(fields: "legacyId") {
                  id: ID!
                  legacyId: ID!
                }

                extend type Wallet {
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
      });

      test("accepts @fromContext if an extension declares a resolvable key and the base type does not", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id", resolvable: false) {
                  id: ID!
                  legacyId: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                extend type Wallet @key(fields: "legacyId")

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
      });

      test("rejects @fromContext if the only key of the object is not resolvable", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id", resolvable: false) {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[benefits] Object "Wallet" has no resolvable key but has a field with a contextual argument.',
            extensions: expect.objectContaining({
              code: "CONTEXT_NO_RESOLVABLE_KEY",
            }),
          }),
        );
      });

      test("rejects @fromContext on a type extension if the base type key is not resolvable", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id", resolvable: false) {
                  id: ID!
                }

                extend type Wallet {
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[benefits] Object "Wallet" has no resolvable key but has a field with a contextual argument.',
            extensions: expect.objectContaining({
              code: "CONTEXT_NO_RESOLVABLE_KEY",
            }),
          }),
        );
      });

      test("rejects @fromContext on a base type if only the type extension declares a resolvable key", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                }

                type Wallet {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                extend type Wallet @key(fields: "id", resolvable: false)

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[benefits] Object "Wallet" has no resolvable key but has a field with a contextual argument.',
            extensions: expect.objectContaining({
              code: "CONTEXT_NO_RESOLVABLE_KEY",
            }),
          }),
        );
      });
    });

    describe("the public API schema", () => {
      test("removes @fromContext if another graph defines the same nullable argument", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id") @shareable {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
          subgraph(
            "payments",
            graphql`
                type Wallet @key(fields: "id") @shareable {
                  id: ID!
                  apply(plan: String): Int!
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.publicSdl).toContainGraphQL(graphql`
            type Wallet {
              id: ID!
              apply: Int!
            }
          `);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Wallet
              @join__type(graph: BENEFITS, key: "id")
              @join__type(graph: PAYMENTS, key: "id") {
              id: ID!
              apply: Int!
                @join__field(
                  graph: BENEFITS
                  contextArguments: [
                    {
                      context: "benefits__memberCtx"
                      name: "plan"
                      type: "String"
                      selection: " { plan }"
                    }
                  ]
                )
                @join__field(graph: PAYMENTS)
            }
          `);
      });

      test("removes @fromContext if another graph gives the argument a default value", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id") @shareable {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
          subgraph(
            "payments",
            graphql`
                type Wallet @key(fields: "id") @shareable {
                  id: ID!
                  apply(plan: String = "standard"): Int!
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.publicSdl).toContainGraphQL(graphql`
            type Wallet {
              id: ID!
              apply: Int!
            }
          `);
      });

      test("rejects a required argument if another graph makes the same argument contextual", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id") @shareable {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
          subgraph(
            "payments",
            graphql`
                type Wallet @key(fields: "id") @shareable {
                  id: ID!
                  apply(plan: String!): Int!
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              'Argument "Wallet.apply(plan:)" is contextual in at least one subgraph but in "Wallet.apply(plan:)" it does not have @fromContext, is not nullable and has no default value.',
            extensions: expect.objectContaining({
              code: "CONTEXTUAL_ARGUMENT_NOT_CONTEXTUAL_IN_ALL_SUBGRAPHS",
            }),
          }),
        );
      });
    });

    describe("@interfaceObject providers", () => {
      test("rejects a provider type that has @interfaceObject", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Benefit
                  @interfaceObject
                  @key(fields: "id")
                  @context(name: "benefitCtx") {
                  id: ID!
                  plan: String!
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$benefitCtx { plan }")
                  ): Int!
                }

                type Query {
                  benefit(id: ID!): Benefit
                }
              `,
          ),
          subgraph(
            "catalog",
            graphql`
                interface Benefit @key(fields: "id") {
                  id: ID!
                }

                type Coupon implements Benefit @key(fields: "id") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                }

                type Query {
                  noop: Int
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
        expect(result.errors?.[0]?.message).toContain("interfaceObject");
      });

      test("rejects a provider type extension that has @interfaceObject", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Benefit @key(fields: "id") {
                  id: ID!
                }

                extend type Benefit
                  @interfaceObject
                  @context(name: "benefitCtx") {
                  plan: String!
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$benefitCtx { plan }")
                  ): Int!
                }

                type Query {
                  benefit(id: ID!): Benefit
                }
              `,
          ),
          subgraph(
            "catalog",
            graphql`
                interface Benefit @key(fields: "id") {
                  id: ID!
                }

                type Coupon implements Benefit @key(fields: "id") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                }

                type Query {
                  noop: Int
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
        expect(result.errors?.[0]?.message).toContain("interfaceObject");
      });

      test("rejects a provider if @interfaceObject is on the definition and @context is on an extension", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Benefit @interfaceObject @key(fields: "id") {
                  id: ID!
                }

                extend type Benefit @context(name: "benefitCtx") {
                  plan: String!
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$benefitCtx { plan }")
                  ): Int!
                }

                type Query {
                  benefit(id: ID!): Benefit
                }
              `,
          ),
          subgraph(
            "catalog",
            graphql`
                interface Benefit @key(fields: "id") {
                  id: ID!
                }

                type Coupon implements Benefit @key(fields: "id") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                }

                type Query {
                  noop: Int
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
        expect(result.errors?.[0]?.message).toContain("interfaceObject");
      });

      test("rejects a provider if @context is on the definition and @interfaceObject is on an extension", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Benefit @key(fields: "id") @context(name: "benefitCtx") {
                  id: ID!
                  plan: String!
                  wallet: Wallet!
                }

                extend type Benefit @interfaceObject

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$benefitCtx { plan }")
                  ): Int!
                }

                type Query {
                  benefit(id: ID!): Benefit
                }
              `,
          ),
          subgraph(
            "catalog",
            graphql`
                interface Benefit @key(fields: "id") {
                  id: ID!
                }

                type Coupon implements Benefit @key(fields: "id") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                }

                type Query {
                  noop: Int
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
        expect(result.errors?.[0]?.message).toContain("interfaceObject");
      });

      test("rejects a provider that has @interfaceObject if an extension has @fromContext", () => {
        const result = compose([
          subgraph(
            "benefits",
            graphql`
                type Benefit
                  @interfaceObject
                  @key(fields: "id")
                  @context(name: "benefitCtx") {
                  id: ID!
                  plan: String!
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                }

                extend type Wallet {
                  apply(
                    plan: String @fromContext(field: "$benefitCtx { plan }")
                  ): Int!
                }

                type Query {
                  benefit(id: ID!): Benefit
                }
              `,
          ),
          subgraph(
            "catalog",
            graphql`
                interface Benefit @key(fields: "id") {
                  id: ID!
                }

                type Coupon implements Benefit @key(fields: "id") {
                  id: ID!
                  plan: String!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                }

                type Query {
                  noop: Int
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            extensions: expect.objectContaining({
              code: "CONTEXT_INVALID_SELECTION",
            }),
          }),
        );
        expect(result.errors?.[0]?.message).toContain("interfaceObject");
      });
    });
  });
  describe("composition across subgraph boundaries", () => {
    test("accepts an external field if the same subgraph declares the context", () => {
      const result = compose([
        subgraph(
          "benefits",
          graphql`
              type Member @key(fields: "id") @context(name: "memberCtx") {
                id: ID!
                wallet: Wallet!
                plan: String! @external
              }

              type Wallet @key(fields: "id") {
                id: ID!
                apply(
                  plan: String @fromContext(field: "$memberCtx { plan }")
                ): Int!
              }

              type Query {
                member(id: ID!): Member
              }
            `,
        ),
        subgraph(
          "identity",
          graphql`
              type Member @key(fields: "id") {
                id: ID!
                plan: String!
              }

              type Wallet @key(fields: "id") {
                id: ID!
              }
            `,
        ),
      ]);

      assertCompositionSuccess(result);
    });

    test("marks an external field as used if only a context selection refers to it", () => {
      const result = compose([
        subgraph(
          "benefits",
          graphql`
              type Member @key(fields: "id") @context(name: "memberCtx") {
                id: ID!
                plan: String! @external
                wallet: Wallet!
              }

              type Wallet @key(fields: "id") {
                id: ID!
                apply(
                  plan: String @fromContext(field: "$memberCtx { plan }")
                ): Int!
              }

              type Query {
                member(id: ID!): Member
              }
            `,
        ),
        subgraph(
          "identity",
          graphql`
              type Member @key(fields: "id") {
                id: ID!
                plan: String!
              }

              type Wallet @key(fields: "id") {
                id: ID!
              }

              type Query {
                noop: Int
              }
            `,
        ),
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
          type Member
            @join__type(graph: BENEFITS, key: "id")
            @join__type(graph: IDENTITY, key: "id")
            @context(name: "benefits__memberCtx") {
            id: ID!
            plan: String!
              @join__field(graph: BENEFITS, external: true)
              @join__field(graph: IDENTITY)
            wallet: Wallet! @join__field(graph: BENEFITS)
          }
        `);
    });

    test("rejects a context declaration from another sybgraph", () => {
      const result = compose([
        subgraph(
          "identity",
          graphql`
              type Member @key(fields: "id") @context(name: "memberCtx") {
                id: ID!
                plan: String!
              }

              type Query {
                member(id: ID!): Member
              }
            `,
        ),
        subgraph(
          "benefits",
          graphql`
              type Member @key(fields: "id") {
                id: ID! @external
                plan: String! @external
                wallet: Wallet!
              }

              type Wallet @key(fields: "id") {
                id: ID!
                apply(
                  plan: String @fromContext(field: "$memberCtx { plan }")
                ): Int!
              }
            `,
        ),
      ]);

      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            '[benefits] Context "memberCtx" is used at location "Wallet.apply(plan:)" but is never set.',
          extensions: expect.objectContaining({ code: "CONTEXT_NOT_SET" }),
        }),
      );
    });

    test("rejects a subgraph that uses @fromContext but does not declare the context", () => {
      const result = compose([
        subgraph(
          "identity",
          graphql`
              type Member @key(fields: "id") @context(name: "memberCtx") {
                id: ID!
                age: Int!
              }

              type Query {
                member(id: ID!): Member
              }
            `,
        ),
        subgraph(
          "analytics",
          graphql`
              type Member @key(fields: "id") {
                id: ID! @external
                wallet: Wallet!
              }

              type Wallet @key(fields: "id") {
                id: ID!
                measure(
                  age: Int @fromContext(field: "$memberCtx { age }")
                ): Int!
              }
            `,
        ),
      ]);

      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            '[analytics] Context "memberCtx" is used at location "Wallet.measure(age:)" but is never set.',
          extensions: expect.objectContaining({ code: "CONTEXT_NOT_SET" }),
        }),
      );
    });
  });
  describe("transitive security requirements", () => {
    describe("@authenticated", () => {
      test("accepts authenticated context data if the field is also authenticated", () => {
        const result = compose([
          subgraph(
            "identity",
            graphql`
                type Member
                  @key(fields: "id")
                  @context(name: "memberCtx")
                  @authenticated {
                  id: ID!
                  plan: String! @authenticated
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int! @authenticated
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Wallet @join__type(graph: IDENTITY, key: "id") {
              id: ID!
              apply: Int!
                @join__field(
                  graph: IDENTITY
                  contextArguments: [
                    {
                      context: "identity__memberCtx"
                      name: "plan"
                      type: "String"
                      selection: " { plan }"
                    }
                  ]
                )
                @authenticated
            }
          `);
      });

      test("accepts authenticated conditional branches if the field is also authenticated", () => {
        const result = compose([
          subgraph(
            "pricing",
            graphql`
                union PriceSource =
                  | RetailAccount
                  | WholesaleAccount
                  | GuestQuote

                type GuestQuote {
                  id: ID!
                  note: String
                }

                type RetailAccount
                  @key(fields: "id")
                  @context(name: "priceCtx")
                  @authenticated {
                  id: ID!
                  retailCurrency: String! @authenticated
                }

                type WholesaleAccount
                  @key(fields: "id")
                  @context(name: "priceCtx")
                  @authenticated {
                  id: ID!
                  wholesaleCurrency: String! @authenticated
                }

                type QuoteEngine @key(fields: "id") {
                  id: ID!
                  calculate(
                    currency: String
                      @fromContext(
                        field: "$priceCtx { ... on RetailAccount { retailCurrency } ... on WholesaleAccount { wholesaleCurrency } }"
                      )
                  ): Int! @authenticated
                }

                type Query {
                  source: PriceSource
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type QuoteEngine @join__type(graph: PRICING, key: "id") {
              id: ID!
              calculate: Int!
                @join__field(
                  graph: PRICING
                  contextArguments: [
                    {
                      context: "pricing__priceCtx"
                      name: "currency"
                      type: "String"
                      selection: " { ... on RetailAccount { retailCurrency } ... on WholesaleAccount { wholesaleCurrency } }"
                    }
                  ]
                )
                @authenticated
            }
          `);
      });

      test("rejects a field that reads authenticated context data but has no auth requirement", () => {
        const result = compose([
          subgraph(
            "identity",
            graphql`
                type Member
                  @key(fields: "id")
                  @context(name: "memberCtx")
                  @authenticated {
                  id: ID!
                  plan: String! @authenticated
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[identity] Field "Wallet.apply" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive data in context identity__memberCtx from @fromContext selection set.',
            extensions: expect.objectContaining({
              code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
            }),
          }),
        );
      });

      test("rejects a field if the context provider type is authenticated", () => {
        const result = compose([
          subgraph(
            "identity",
            graphql`
                type Member
                  @key(fields: "id")
                  @context(name: "memberCtx")
                  @authenticated {
                  id: ID!
                  plan: String!
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[identity] Field "Wallet.apply" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive data in context identity__memberCtx from @fromContext selection set.',
            extensions: expect.objectContaining({
              code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
            }),
          }),
        );
      });

      test("examines every @fromContext of a field, not only the last one", () => {
        const result = compose([
          subgraph(
            "identity",
            graphql`
                type Member @key(fields: "id") @context(name: "memberCtx") {
                  id: ID!
                  plan: String! @authenticated
                  tier: String!
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                    tier: String @fromContext(field: "$memberCtx { tier }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            extensions: expect.objectContaining({
              code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
            }),
          }),
        );
      });
    });

    describe("@requiresScopes", () => {
      test("accepts context data if the field has the merged @requiresScopes requirements", () => {
        const result = compose([
          subgraph(
            "identity",
            graphql`
                type Member
                  @key(fields: "id")
                  @context(name: "memberCtx")
                  @requiresScopes(scopes: [["member:read"]]) {
                  id: ID!
                  plan: String! @requiresScopes(scopes: [["plan:read"]])
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                    @requiresScopes(scopes: [["member:read", "plan:read"]])
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
            ["@requiresScopes"],
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Wallet @join__type(graph: IDENTITY, key: "id") {
              id: ID!
              apply: Int!
                @join__field(
                  graph: IDENTITY
                  contextArguments: [
                    {
                      context: "identity__memberCtx"
                      name: "plan"
                      type: "String"
                      selection: " { plan }"
                    }
                  ]
                )
                @requiresScopes(scopes: [["member:read", "plan:read"]])
            }
          `);
      });

      test("rejects a field that has no scope for context data with @requiresScopes", () => {
        const result = compose([
          subgraph(
            "identity",
            graphql`
                type Member
                  @key(fields: "id")
                  @context(name: "memberCtx")
                  @requiresScopes(scopes: [["member:read"]]) {
                  id: ID!
                  plan: String! @requiresScopes(scopes: [["plan:read"]])
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
            ["@requiresScopes"],
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[identity] Field "Wallet.apply" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive data in context identity__memberCtx from @fromContext selection set.',
            extensions: expect.objectContaining({
              code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
            }),
          }),
        );
      });
    });

    describe("@policy", () => {
      test("accepts context data if the field has the merged @policy requirements", () => {
        const result = compose([
          subgraph(
            "identity",
            graphql`
                type Member
                  @key(fields: "id")
                  @context(name: "memberCtx")
                  @policy(policies: [["member_policy"]]) {
                  id: ID!
                  plan: String! @policy(policies: [["plan_policy"]])
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int! @policy(policies: [["member_policy", "plan_policy"]])
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
            ["@policy"],
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type Wallet @join__type(graph: IDENTITY, key: "id") {
              id: ID!
              apply: Int!
                @join__field(
                  graph: IDENTITY
                  contextArguments: [
                    {
                      context: "identity__memberCtx"
                      name: "plan"
                      type: "String"
                      selection: " { plan }"
                    }
                  ]
                )
                @policy(policies: [["member_policy", "plan_policy"]])
            }
          `);
      });

      test("rejects a field that has no policy for context data with @policy", () => {
        const result = compose([
          subgraph(
            "identity",
            graphql`
                type Member
                  @key(fields: "id")
                  @context(name: "memberCtx")
                  @policy(policies: [["member_policy"]]) {
                  id: ID!
                  plan: String! @policy(policies: [["plan_policy"]])
                  wallet: Wallet!
                }

                type Wallet @key(fields: "id") {
                  id: ID!
                  apply(
                    plan: String @fromContext(field: "$memberCtx { plan }")
                  ): Int!
                }

                type Query {
                  member(id: ID!): Member
                }
              `,
            ["@policy"],
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[identity] Field "Wallet.apply" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive data in context identity__memberCtx from @fromContext selection set.',
            extensions: expect.objectContaining({
              code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
            }),
          }),
        );
      });
    });

    describe("more than one provider", () => {
      test("accepts context data from many providers if the field auth covers every path", () => {
        const result = compose([
          subgraph(
            "pricing",
            graphql`
                union PriceSource =
                  | RetailAccount
                  | WholesaleAccount
                  | GuestQuote

                type GuestQuote {
                  id: ID!
                  note: String
                }

                type RetailAccount
                  @key(fields: "id")
                  @context(name: "priceCtx")
                  @authenticated {
                  id: ID!
                  currency: String! @authenticated
                }

                type WholesaleAccount
                  @key(fields: "id")
                  @context(name: "priceCtx")
                  @authenticated {
                  id: ID!
                  currency: String! @authenticated
                }

                type QuoteEngine @key(fields: "id") {
                  id: ID!
                  calculate(
                    currency: String
                      @fromContext(field: "$priceCtx { currency }")
                  ): Int! @authenticated
                }

                type Query {
                  source: PriceSource
                }
              `,
          ),
        ]);

        assertCompositionSuccess(result);
        expect(result.supergraphSdl).toContainGraphQL(graphql`
            type QuoteEngine @join__type(graph: PRICING, key: "id") {
              id: ID!
              calculate: Int!
                @join__field(
                  graph: PRICING
                  contextArguments: [
                    {
                      context: "pricing__priceCtx"
                      name: "currency"
                      type: "String"
                      selection: " { currency }"
                    }
                  ]
                )
                @authenticated
            }
          `);
      });

      test("rejects a field if only one provider path has an auth requirement", () => {
        const result = compose([
          subgraph(
            "pricing",
            graphql`
                union PriceSource =
                  | RetailAccount
                  | WholesaleAccount
                  | GuestQuote

                type GuestQuote {
                  id: ID!
                  note: String
                }

                type RetailAccount
                  @key(fields: "id")
                  @context(name: "priceCtx") {
                  id: ID!
                  currency: String!
                }

                type WholesaleAccount
                  @key(fields: "id")
                  @context(name: "priceCtx")
                  @authenticated {
                  id: ID!
                  currency: String! @authenticated
                }

                type QuoteEngine @key(fields: "id") {
                  id: ID!
                  calculate(
                    currency: String
                      @fromContext(field: "$priceCtx { currency }")
                  ): Int!
                }

                type Query {
                  source: PriceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[pricing] Field "QuoteEngine.calculate" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive data in context pricing__priceCtx from @fromContext selection set.',
            extensions: expect.objectContaining({
              code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
            }),
          }),
        );
      });

      test("rejects a field if a conditional provider branch has an auth requirement", () => {
        const result = compose([
          subgraph(
            "pricing",
            graphql`
                union PriceSource =
                  | RetailAccount
                  | WholesaleAccount
                  | GuestQuote

                type GuestQuote {
                  id: ID!
                  note: String
                }

                type RetailAccount
                  @key(fields: "id")
                  @context(name: "priceCtx") {
                  id: ID!
                  retailCurrency: String!
                }

                type WholesaleAccount
                  @key(fields: "id")
                  @context(name: "priceCtx")
                  @authenticated {
                  id: ID!
                  wholesaleCurrency: String! @authenticated
                }

                type QuoteEngine @key(fields: "id") {
                  id: ID!
                  calculate(
                    currency: String
                      @fromContext(
                        field: "$priceCtx { ... on RetailAccount { retailCurrency } ... on WholesaleAccount { wholesaleCurrency } }"
                      )
                  ): Int!
                }

                type Query {
                  source: PriceSource
                }
              `,
          ),
        ]);

        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[pricing] Field "QuoteEngine.calculate" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive data in context pricing__priceCtx from @fromContext selection set.',
            extensions: expect.objectContaining({
              code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
            }),
          }),
        );
      });
    });
  });
});
