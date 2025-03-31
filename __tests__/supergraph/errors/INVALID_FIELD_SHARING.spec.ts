import { describe, expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  describe("INVALID_FIELD_SHARING", () => {
    test("set of tests", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@shareable"]
                )

              type Query {
                users: [User]
              }

              type User @key(fields: "id") {
                id: ID
                profile: Profile
              }

              type Profile @shareable {
                name: String
              }
            `,
          },
          {
            name: "feed",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@shareable"]
                )

              type User @key(fields: "id") {
                id: ID
                profile: Profile
              }

              type Profile @shareable {
                name: String
              }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `Non-shareable field "User.profile" is resolved from multiple subgraphs: it is resolved from subgraphs "feed" and "users" and defined as non-shareable in all of them`,
              ),
              extensions: expect.objectContaining({
                code: "INVALID_FIELD_SHARING",
              }),
            }),
          ]),
        }),
      );

      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key"]
                )

              type Query {
                user: User
              }

              type User {
                id: ID!
                name: String
              }
            `,
          },
          {
            name: "feed",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@shareable"]
                )

                type User @key(fields: "id") {
                  id: ID!
                  comments: [String]
                }

                type Query {
                  users: [User]
                }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `Non-shareable field "User.id" is resolved from multiple subgraphs: it is resolved from subgraphs "feed" and "users" and defined as non-shareable in subgraph "users"`,
              ),
              extensions: expect.objectContaining({
                code: "INVALID_FIELD_SHARING",
              }),
            }),
          ]),
        }),
      );

      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@shareable"]
                )

                extend type Query {
                  foo: Foo
                }

                type Foo @shareable @key(fields: "id") {
                  id: ID!
                  name: String
                }
            `,
          },
          {
            name: "feed",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@shareable", "@override"]
                )

                extend type Query {
                  foo: Foo @override(from: "noop")
                }

                type Foo @shareable @key(fields: "id") {
                  id: ID!
                  name: String
                }
            `,
          },
          {
            name: "noop",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@shareable"]
                )

                type Query {
                  noop: String
                }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `Non-shareable field "Query.foo" is resolved from multiple subgraphs: it is resolved from subgraphs "feed" and "users" and defined as non-shareable in all of them`,
              ),
              extensions: expect.objectContaining({
                code: "INVALID_FIELD_SHARING",
              }),
            }),
          ]),
        }),
      );

      expect(
        api.composeServices([
          {
            name: "foo",
            typeDefs: graphql`
              extend schema
              @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@shareable"]
                )

              extend type Note {
                url: String!
              }

              type Note {
                name: String!
              }

              type Query {
                foo: String! @shareable
              }
            `,
          },
          {
            name: "bar",
            typeDefs: graphql`
              extend schema
              @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@shareable"]
                )

              extend type Note {
                url: String!
              }

              type Note {
                name: String!
              }

              type Query {
                bar: String! @shareable
              }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `Non-shareable field "Note.url" is resolved from multiple subgraphs: it is resolved from subgraphs "bar" and "foo" and defined as non-shareable in all of them`,
              ),
              extensions: expect.objectContaining({
                code: "INVALID_FIELD_SHARING",
              }),
            }),
          ]),
        }),
      );
    });

    test("fed v1", () => {
      expect(
        api.composeServices([
          {
            name: "foo",
            typeDefs: graphql`
              extend type Note {
                url: String!
              }

              type Note {
                name: String!
              }

              type Query {
                foo: String!
              }
            `,
          },
          {
            name: "bar",
            typeDefs: graphql`
              extend type Note {
                url: String!
              }

              type Note {
                name: String!
              }

              type Query {
                bar: String!
              }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `Non-shareable field "Note.url" is resolved from multiple subgraphs: it is resolved from subgraphs "bar" and "foo" and defined as non-shareable in all of them`,
              ),
              extensions: expect.objectContaining({
                code: "INVALID_FIELD_SHARING",
              }),
            }),
          ]),
        }),
      );

      assertCompositionSuccess(
        api.composeServices([
          {
            name: "foo",
            typeDefs: graphql`
              extend type Note @key(fields: "id") {
                id: ID!
                url: String!
              }

              type Note {
                name: String!
              }

              type Query {
                foo: String!
              }
            `,
          },
          {
            name: "bar",
            typeDefs: graphql`
              extend type Note @key(fields: "id") {
                id: ID!
                url: String!
              }

              type Note {
                name: String!
              }

              type Query {
                bar: String!
              }
            `,
          },
        ]),
      );
    });

    test("subscription fields (fed v1)", () => {
      expect(
        api.composeServices([
          {
            name: "foo",
            typeDefs: graphql`
              type Query {
                foo: String
              }

              type Subscription {
                event: String
              }
            `,
          },
          {
            name: "bar",
            typeDefs: graphql`
              type Query {
                bar: String
              }

              type Subscription {
                event: String
              }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                api.library === "guild"
                  ? `Fields on root level subscription object cannot be marked as shareable`
                  : 'Non-shareable field "Subscription.event" is resolved from multiple subgraphs: it is resolved from subgraphs "bar" and "foo" and defined as non-shareable in all of them',
              ),
              extensions: expect.objectContaining({
                code: "INVALID_FIELD_SHARING",
              }),
            }),
          ]),
        }),
      );
    });

    test("subscription fields", () => {
      expect(
        api.composeServices([
          {
            name: "foo",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@shareable"]
                )

              type Query {
                foo: String
              }

              type Subscription {
                event: String @shareable
              }
            `,
          },
          {
            name: "bar",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@shareable"]
                )

              type Query {
                bar: String
              }

              type Subscription {
                event: String @shareable
              }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `Fields on root level subscription object cannot be marked as shareable`,
              ),
              extensions: expect.objectContaining({
                code: "INVALID_FIELD_SHARING",
              }),
            }),
          ]),
        }),
      );
    });

    test("nested key fields", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
              url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key"]
              )

            type A
              @key(fields: "id", resolvable: true)
              @key(fields: "pId", resolvable: false)
              @key(fields: "compositeId { one two }", resolvable: false)
              @key(fields: "id compositeId { two three }", resolvable: false) {
              id: ID!
              pId: ID!
              compositeId: CompositeID!
              name: String!
            }

            type CompositeID {
              one: ID!
              two: ID!
              three: ID!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
              url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@requires", "@external"]
              )

            type Query {
              b: B
            }

            type B @key(fields: "id") {
              id: ID!
              a: [A!]!
            }

            type A
              @key(fields: "compositeId { one two }", resolvable: false)
              @key(fields: "id compositeId { two three }", resolvable: true)
              @key(fields: "pId", resolvable: false)
              @key(fields: "id", resolvable: false) {
              id: ID!
              pId: ID!
              compositeId: CompositeID!
              name: String! @external
              nameInB: String! @requires(fields: "name")
            }

            type CompositeID {
              one: ID!
              two: ID!
              three: ID!
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);
    });
  });

  test("non-shareable field in @interfaceObject and interface implementation", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@interfaceObject", "@shareable"]
            )

          type Query {
            hello: String
          }

          interface MyInterface @key(fields: "id") {
            id: ID!
            field: String
          }

          type MyType implements MyInterface @key(fields: "id") {
            id: ID!
            field: String
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@interfaceObject"]
            )

          type MyInterface @key(fields: "id") @interfaceObject {
            id: ID!
            newField: String
          }
        `,
      },
      {
        name: "c",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@interfaceObject"]
            )

          type MyInterface
            @key(fields: "id", resolvable: false)
            @interfaceObject {
            id: ID!
            field: String
          }
        `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message:
          'Non-shareable field "MyType.field" is resolved from multiple subgraphs: it is resolved from subgraphs "a" and "c" (through @interfaceObject field "MyInterface.field") and defined as non-shareable in all of them',
        extensions: expect.objectContaining({
          code: "INVALID_FIELD_SHARING",
        }),
      }),
    );
  });
});
