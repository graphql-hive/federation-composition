import { parse } from "graphql";
import { describe, expect, test } from "vitest";
import { assertCompositionFailure, assertCompositionSuccess } from "../src";
import { testImplementations } from "./shared/testkit";

testImplementations((api) => {
  describe("interface object composition", () => {
    test("if link directive is not present on all subgraphs, composition should fail", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: String
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            type Query {
              otherField: String
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[b] Unknown directive "@interfaceObject". If you meant the "@interfaceObject" federation 2 directive, note that this schema is a federation 1 schema. To be a federation 2 schema, it needs to @link to the federation ${
            api.library === "apollo" ? "specifcation" : "specification"
          } v2.`,
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      );
    });

    test("link directive should have url pointing to federation > 2.3 to enable @interfaceObject on all subgraphs", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.1"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: MyInterface
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: MyInterface
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]);
      assertCompositionFailure(result);
      expect(result.errors).toMatchInlineSnapshot(`
        [
          [GraphQLError: [a] Cannot import unknown element "@interfaceObject".],
        ]
      `);
    });

    test("@external + @requires + @interfaceObject", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject", "@shareable"]
              )

            type Query {
              hello: MyInterface
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String @shareable
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
        {
          name: "c",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: [
                  "@key"
                  "@interfaceObject"
                  "@shareable"
                  "@requires"
                  "@external"
                ]
              )

            type MyInterface
              @key(fields: "id", resolvable: false)
              @interfaceObject {
              id: ID!
              newField: String @external
              field: String @shareable @requires(fields: "newField")
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface MyInterface
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", isInterfaceObject: true)
          @join__type(
            graph: C
            key: "id"
            isInterfaceObject: true
            resolvable: false
          ) {
          id: ID!
          field: String
            @join__field(graph: A)
            @join__field(graph: C, requires: "newField")
          newField: String
            @join__field(external: true, graph: C)
            @join__field(graph: B)
        }
      `);
    });

    test("link directive does not have to import @interfaceObject in all subgraphs", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key"]
              )

            type Query {
              hello: MyInterface
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: MyInterface
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]);
      assertCompositionSuccess(result);
    });

    test(`target interface must have @key directive on subgraph where it's defined`, () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: MyInterface
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: MyInterface
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);
    });

    // Subgraph A must define every entity type in your entire supergraph that implements MyInterface.
    // Certain other subgraphs can also define these entities, but Subgraph A must define all of them.
    // You can think of a subgraph that defines an entity interface as also owning every entity that implements that interface.
    // this case is really unclear.
    // documentation: https://www.apollographql.com/docs/federation/federated-types/interfaces/#usage-rules
    test(`subgraph where interface is defined must have all entity types which implement that interface defined `, () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              hello: MyInterface
            }

            interface MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )
            type Query {
              otherField: MyInterface
            }

            type MyInterface @key(fields: "id") @interfaceObject {
              id: ID!
              newField: String
            }

            type MyType implements MyInterface @key(fields: "id") {
              id: ID!
              field: String
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            "[b] Cannot implement non-interface type MyInterface (of type ObjectType)",
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      );
    });

    describe(`@interfaceObject definition`, () => {
      describe(`at least one other subgraph must define an interface type with @key directive which has the same name as the object type with @interfaceObject`, () => {
        test(`interface type is not present on any subgraph. Should fail`, () => {
          const result = api.composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )

                type Query {
                  hello: String
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  otherField: MyInterface
                }

                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  newField: String
                }
              `),
            },
          ]);

          assertCompositionFailure(result);

          expect(result.errors).toContainEqual(
            expect.objectContaining({
              message:
                api.library === "apollo"
                  ? `Type "MyInterface" is declared with @interfaceObject in all the subgraphs in which is is defined (it is defined in subgraph "b" but should be defined as an interface in at least one subgraph)`
                  : 'Type "MyInterface" is declared with @interfaceObject in all the subgraphs in which is is defined',
              extensions: expect.objectContaining({
                code: "INTERFACE_OBJECT_USAGE_ERROR",
              }),
            }),
          );
        });

        test(`interface type is present on other subgraph but doesn't have @key directive. Should fail`, () => {
          const result = api.composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )

                type Query {
                  hello: MyInterface
                }

                interface MyInterface {
                  id: ID!
                  field: String
                }

                type SomeType implements MyInterface @key(fields: "id") {
                  id: ID!
                  field: String
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  otherField: MyInterface
                }

                type MyInterface @interfaceObject {
                  id: ID!
                  newField: String
                }
              `),
            },
          ]);

          assertCompositionFailure(result);
          expect(result.errors).toContainEqual(
            expect.objectContaining({
              message:
                '[b] The @interfaceObject directive can only be applied to entity types but type "MyInterface" has no @key in this subgraph.',
              extensions: expect.objectContaining({
                code: "INTERFACE_OBJECT_USAGE_ERROR",
              }),
            }),
          );
        });

        test(`interface type is present on other subgraph with @key directive. Should succeed and add fields from interfaceObject`, () => {
          const result = api.composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )

                type Query {
                  hello: MyInterface
                }

                interface MyInterface @key(fields: "id") {
                  id: ID!
                  field: String
                }

                type IimplementMyInterface implements MyInterface
                  @key(fields: "id") {
                  id: ID!
                  field: String
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  otherField: MyInterface
                }

                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  hello: Int
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            type IimplementMyInterface implements MyInterface
              @join__type(graph: A, key: "id")
              @join__implements(graph: A, interface: "MyInterface") {
              id: ID!
              field: String
              hello: Int @join__field
            }
          `);
          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            interface MyInterface
              @join__type(graph: A, key: "id")
              @join__type(graph: B, isInterfaceObject: true, key: "id") {
              id: ID!
              field: String @join__field(graph: A)
              hello: Int @join__field(graph: B)
            }
          `);
        });

        test("interface type is present on other subgraph with @key directive. Should succeed and add fields from a child of an interfaceObject", () => {
          const result = api.composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.6"
                    import: ["@key", "@interfaceObject"]
                  )

                interface Media @key(fields: "id") {
                  id: ID!
                  title: String!
                }

                type Book implements Media @key(fields: "id") {
                  id: ID!
                  title: String!
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.6"
                    import: ["@key", "@interfaceObject"]
                  )

                type Media @key(fields: "id") @interfaceObject {
                  id: ID!
                  reviews: [Review!]!
                }

                type Review {
                  score: Int!
                }

                type Query {
                  topRatedMedia: [Media!]!
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);
        });
      });

      describe(`fields contribution`, () => {
        test(`several subgraphs contribute fields to the same interface through interfaceObject. Should succeed`, () => {
          const result = api.composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )

                type Query {
                  hello: MyInterface
                }

                interface MyInterface @key(fields: "id") {
                  id: ID!
                  field: String
                }

                type IimplementMyInterface implements MyInterface
                  @key(fields: "id") {
                  id: ID!
                  field: String
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  otherField: MyInterface
                }

                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  hello: Int
                }
              `),
            },
            {
              name: "c",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/v2.3"
                    import: ["@key", "@interfaceObject"]
                  )
                type Query {
                  someNewField: MyInterface
                }

                type MyInterface @key(fields: "id") @interfaceObject {
                  id: ID!
                  hello2: Int
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            type IimplementMyInterface implements MyInterface
              @join__type(graph: A, key: "id")
              @join__implements(graph: A, interface: "MyInterface") {
              id: ID!
              field: String
              hello: Int @join__field
              hello2: Int @join__field
            }
          `);
          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            interface MyInterface
              @join__type(graph: A, key: "id")
              @join__type(graph: B, isInterfaceObject: true, key: "id")
              @join__type(graph: C, isInterfaceObject: true, key: "id") {
              id: ID!
              field: String @join__field(graph: A)
              hello: Int @join__field(graph: B)
              hello2: Int @join__field(graph: C)
            }
          `);
        });

        test.skip(`interfaceObject tries to contribute field with conflicting type. Should Fail`, () => {});
        test.skip(`several interfaces and several interface objects. Should succeed`, () => {});
      });
    });
  });
});
