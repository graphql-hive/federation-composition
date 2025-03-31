import { parse, print } from "graphql";
import { describe, expect, test } from "vitest";
import { sortSDL } from "../src/graphql/sort-sdl.js";
import { sdl as joinSDL } from "../src/specifications/join.js";
import { sdl as linkSDL } from "../src/specifications/link.js";
import { directive as tagDirective } from "../src/specifications/tag.js";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  federationVersionToJoinSpecVersion,
  satisfiesVersionRange,
  testImplementations,
  versions,
} from "./shared/testkit.js";

expect.addSnapshotSerializer({
  serialize: (value) => print(sortSDL(parse(value as string))),
  test: (value) =>
    typeof value === "string" && value.includes("specs.apollo.dev"),
});

testImplementations((api) => {
  const composeServices = api.composeServices;

  test("enum value as string as default value", () => {
    const result = composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String
          }

          type Query {
            users(type: UserType! = "Regular"): [User!]!
          }

          enum UserType {
            Regular
            Admin
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Query @join__type(graph: A) {
        users(type: UserType! = Regular): [User!]!
      }
    `);
  });

  test("duplicated Query fields", () => {
    const result = composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String
          }

          type Query {
            userById(id: ID!): User
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String
          }

          type Query {
            userById(id: ID!): User
          }
        `),
      },
    ]);

    assertCompositionFailure(result);
  });

  test("@join__field(usedOverridden: true) when field is overridden but defined in an interface", () => {
    let result = composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key"]
            )

          interface Post {
            id: ID!
            createdAt: String!
          }

          type ImagePost implements Post @key(fields: "id") {
            id: ID!
            createdAt: String!
          }

          type Query {
            feed: [Post]
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable", "@override"]
            )

          interface Post {
            id: ID!
            createdAt: String!
          }

          type TextPost implements Post @key(fields: "id") {
            id: ID!
            createdAt: String!
            body: String!
          }

          interface AnotherPost {
            id: ID!
            createdAt: String!
          }

          type ImagePost implements AnotherPost @key(fields: "id") {
            id: ID!
            createdAt: String! @override(from: "a")
          }

          type Query {
            anotherFeed: [AnotherPost]
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type ImagePost implements Post & AnotherPost
        @join__implements(graph: A, interface: "Post")
        @join__implements(graph: B, interface: "AnotherPost")
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id") {
        createdAt: String!
          @join__field(graph: A, usedOverridden: true)
          @join__field(graph: B, override: "a")
        id: ID!
      }
    `);

    result = composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key"]
            )

          type ImagePost @key(fields: "id") {
            id: ID!
            createdAt: String!
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable", "@override"]
            )

          interface Post {
            id: ID!
            createdAt: String!
          }

          type TextPost implements Post @key(fields: "id") {
            id: ID!
            createdAt: String!
            body: String!
          }

          interface AnotherPost {
            id: ID!
            createdAt: String!
          }

          type ImagePost implements AnotherPost @key(fields: "id") {
            id: ID!
            createdAt: String! @override(from: "a")
          }

          type Query {
            anotherFeed: [AnotherPost]
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type ImagePost implements AnotherPost
        @join__implements(graph: B, interface: "AnotherPost")
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id") {
        createdAt: String! @join__field(graph: B, override: "a")
        id: ID!
      }
    `);
  });

  test("@join__field(external: true) when field is overridden", () => {
    let result = composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@requires", "@external"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @external
            aName: String! @requires(fields: "name")
          }

          type Query {
            userA: User
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@override"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @override(from: "c")
          }

          type Query {
            userB: User
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@requires", "@external"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @external
            cName: String! @requires(fields: "name")
          }

          type Query {
            userC: User
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id")
        @join__type(graph: C, key: "id") {
        id: ID!
        name: String!
          @join__field(external: true, graph: A)
          @join__field(external: true, graph: C)
          @join__field(graph: B, override: "c")
        aName: String! @join__field(graph: A, requires: "name")
        cName: String! @join__field(graph: C, requires: "name")
      }
    `);

    result = composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@requires", "@external"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @external
            aName: String! @requires(fields: "name")
          }

          type Query {
            userA: User
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@override"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @override(from: "c")
          }

          type Query {
            userB: User
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@requires", "@external"]
            )

          type User @key(fields: "id") {
            id: ID!
            cName: String!
          }

          type Query {
            userC: User
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id")
        @join__type(graph: C, key: "id") {
        id: ID!
        name: String!
          @join__field(external: true, graph: A)
          @join__field(graph: B, override: "c")
        aName: String! @join__field(graph: A, requires: "name")
        cName: String! @join__field(graph: C)
      }
    `);

    result = composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@requires", "@external"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @external
            aName: String! @requires(fields: "name")
          }

          type Query {
            userA: User
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@override"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @override(from: "c")
          }

          type Query {
            userB: User
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@requires", "@external"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @external
            cName: String! @requires(fields: "name")
          }

          type Query {
            userC: User
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id")
        @join__type(graph: C, key: "id") {
        id: ID!
        name: String!
          @join__field(external: true, graph: A)
          @join__field(external: true, graph: C)
          @join__field(graph: B, override: "c")
        aName: String! @join__field(graph: A, requires: "name")
        cName: String! @join__field(graph: C, requires: "name")
      }
    `);

    result = composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@requires", "@external"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @external
            aName: String! @requires(fields: "name")
          }

          type Query {
            userA: User
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@override"]
            )

          type User @key(fields: "id") {
            id: ID!
            name: String! @override(from: "c")
          }

          type Query {
            userB: User
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") {
            id: ID!
            "it should not be in supergraph"
            name: String! @external
          }

          type Foo @key(fields: "id") {
            id: ID!
            foo: String
          }

          scalar _Any
          union _Entity = Foo | User

          type _Service {
            sdl: String!
          }

          type Query {
            _entities(representations: [_Any!]!): [_Entity]!
            _service: _Service
            c: String!
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id")
        @join__type(graph: C, key: "id") {
        id: ID!
        name: String!
          @join__field(external: true, graph: A)
          @join__field(graph: B, override: "c")
        aName: String! @join__field(graph: A, requires: "name")
      }
    `);
  });

  test("print @join__field on shareable field defined twice (once with non-effective override)", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type Mutation {
            a: String!
            b: String!
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@shareable", "@override"]
            )

          type Mutation {
            a: String! @shareable @override(from: "non-existing")
            b: String! @shareable @override(from: "non-existing")
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key"]
            )

          type Mutation {
            c: String!
          }

          type Query {
            c: String
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Mutation
        @join__type(graph: A)
        @join__type(graph: B)
        @join__type(graph: C) {
        a: String!
          @join__field(graph: A)
          @join__field(graph: B, override: "non-existing")
        b: String!
          @join__field(graph: A)
          @join__field(graph: B, override: "non-existing")
        c: String! @join__field(graph: C)
      }
    `);
  });

  describe.each(versions)("%s", (version) => {
    describe("shareable", () => {
      test("merge two exact same types", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }

              type Query {
                user: User
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: A) @join__type(graph: B) {
            name: String
          }
        `);
      });

      test("merge same type with same fields by of different return types (nullable vs non-nullable)", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }

              type Query {
                user: User
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: A) @join__type(graph: B) {
            name: String
              @join__field(graph: B, type: "String!")
              @join__field(graph: A, type: "String")
          }
        `);
      });

      test("merge same types but one has an extension", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type User @shareable {
                name: String
              }

              extend type User {
                email: String! @shareable
              }

              type Query {
                user: User
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: A) @join__type(graph: B) {
            name: String
            email: String! @join__field(graph: B)
          }
        `);
      });

      test("merge same types but one has an extra field", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Food @shareable {
                name: String!
                price: Int!
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Food @shareable {
                name: String!
                price: Int!
                inStock: Boolean! # Not in A
              }

              type Query {
                food: Food
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Food @join__type(graph: A) @join__type(graph: B) {
            name: String!
            inStock: Boolean! @join__field(graph: B)
            price: Int!
          }
        `);
      });

      test("merge extension and definition of object type and print extension:true", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

                type User @key(fields: "id") @shareable {
                  id: ID!
                  name: String
                }

                type Query {
                  user: User @shareable
                }
              `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

                type User @key(fields: "id") @shareable {
                  id: ID!
                  name: String
                }

                extend type User {
                  email: String! @shareable
                }

                type Query {
                  user: User @shareable
                }
              `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User
            @join__type(graph: A, key: "id")
            @join__type(graph: B, key: "id") {
            email: String! @join__field(graph: B)
            id: ID!
            name: String
          }
        `);
      });

      test("merge same types but one has an extra field (inaccessible)", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Food @shareable {
                name: String!
                price: Int!
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@shareable", "@inaccessible"]
                )

              type Food @shareable {
                name: String!
                price: Int!
                inStock: Boolean! @inaccessible
              }

              type Query {
                food: Food
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Food @join__type(graph: A) @join__type(graph: B) {
            name: String!
            price: Int!
            inStock: Boolean! @inaccessible @join__field(graph: B)
          }
        `);

        expect(result.publicSdl).not.toMatch("@inaccessible");
      });

      test("type annotated with @inaccessible should not result in @inaccessible on its fields", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@inaccessible"])

              type Food @inaccessible {
                name: String!
                price: Int!
              }

              type Drink @inaccessible {
                name: String!
                price: Int! @inaccessible
              }

              type Query {
                words: [String!]!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Food @join__type(graph: A) @inaccessible {
            name: String!
            price: Int!
          }
        `);
        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Drink @join__type(graph: A) @inaccessible {
            name: String!
            price: Int! @inaccessible
          }
        `);
      });

      test("merge an argument (nullable vs missing)", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is optional
                height(units: String): Int!
              }

              type Query {
                building: Building
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is missing
                height: Int!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Building @join__type(graph: B) @join__type(graph: A) {
            height: Int!
          }
        `);
      });

      test("merge an argument (non-nullable vs missing)", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is required
                height(units: String!): Int!
              }

              type Query {
                building: Building
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is missing
                height: Int!
              }
            `),
          },
        ]);

        assertCompositionFailure(result);
      });

      test("merge an argument (nullable vs non-nullable)", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument is required
                height(units: String!): Int!
              }

              type Query {
                building: Building
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

              type Building @shareable {
                # Argument can be optional
                height(units: String): Int!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Building @join__type(graph: A) @join__type(graph: B) {
            height(units: String!): Int!
          }
        `);
      });
    });

    test("merge object types with different fields", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
              email: String!
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              age: Int!
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: B, key: "id")
          @join__type(graph: A, key: "id") {
          id: ID!
          email: String! @join__field(graph: A)
          name: String! @join__field(graph: A)
          age: Int! @join__field(graph: B)
        }
      `);
    });

    test("merge object extension type and non-resolvable object type", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

              extend type User @key(fields: "id") {
                id: ID @external
              }

              type Query {
                user: User
              }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id", extension: true)
          @join__type(graph: B, key: "id") {
          id: ID
            @join__field(graph: A, type: "ID")
            @join__field(graph: B, type: "ID!")
        }
      `);
    });

    test("Fed v1: merge object extension type and non-resolvable object type", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend type User @key(fields: "id") {
              id: ID @external
            }

            type Query {
              user: User
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id") {
          id: ID
            @join__field(graph: A, type: "ID")
            @join__field(graph: B, type: "ID!")
        }
      `);
    });

    test("merge interface types with different fields", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
              email: String!
            }

            interface Details {
              name: ID!
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              age: Int!
            }

            interface Details {
              email: String
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Details @join__type(graph: A) @join__type(graph: B) {
          name: ID! @join__field(graph: A)
          email: String @join__field(graph: B)
        }
      `);
    });

    test("merge union types with different members (some are overlapping)", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
              email: String!
            }

            union Media = Book

            type Book @shareable {
              title: String!
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type User @key(fields: "id") {
              id: ID!
              age: Int!
            }

            union Media = Movie | Book

            type Movie {
              title: String!
            }

            type Book @shareable {
              title: String!
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        union Media
          @join__type(graph: A)
          @join__type(graph: B)
          @join__unionMember(graph: A, member: "Book")
          @join__unionMember(graph: B, member: "Movie")
          @join__unionMember(graph: B, member: "Book") =
          | Movie
          | Book
      `);
    });

    test("merge union types with different members", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
              email: String!
            }

            union Media = Book

            type Book @shareable {
              title: String!
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type User @key(fields: "id") {
              id: ID!
              age: Int!
            }

            union Media = Movie

            type Movie {
              title: String!
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        union Media
          @join__type(graph: A)
          @join__type(graph: B)
          @join__unionMember(graph: A, member: "Book")
          @join__unionMember(graph: B, member: "Movie") =
          | Book
          | Movie
      `);
    });

    test("merge input types and field arguments", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input UserInput {
              name: String
              age: Int
            }

            type Library @shareable {
              book(title: String, author: String): String
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input UserInput {
              name: String!
              email: String
            }

            type Library @shareable {
              book(title: String, section: String): String
            }

            type Query {
              library: Library
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Library @join__type(graph: A) @join__type(graph: B) {
          book(title: String): String
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UserInput @join__type(graph: A) @join__type(graph: B) {
          name: String!
            @join__field(graph: A, type: "String")
            @join__field(graph: B, type: "String!")
        }
      `);
    });

    test("print default values", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input LibraryFilter {
              limit: Int = 5
            }

            enum LibraryAccess {
              PUBLIC
              PRIVATE
            }

            type Query {
              books(filter: LibraryFilter, access: LibraryAccess = PUBLIC): [String!]!
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input UserFilter {
              limit: Int = 10
            }

            enum UserAccess {
              PUBLIC
              PRIVATE
            }

            type Query {
              users(filter: UserFilter, access: UserAccess = PRIVATE): [String!]!
            }
          `),
        },
        {
          name: "c",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            input MediaFilter {
              limit: Int = 15
            }

            enum MediaAccess {
              PUBLIC
              PRIVATE
            }

            interface Media {
              records(filter: MediaFilter, access: MediaAccess = PRIVATE): [String!]!
            }

            type Movie implements Media {
              records(filter: MediaFilter, access: MediaAccess = PUBLIC): [String!]!
            }

            type Query {
              media(filter: MediaFilter, access: MediaAccess = PRIVATE): [Media!]!
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input LibraryFilter @join__type(graph: A) {
          limit: Int = 5
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UserFilter @join__type(graph: B) {
          limit: Int = 10
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input MediaFilter @join__type(graph: C) {
          limit: Int = 15
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Media @join__type(graph: C) {
          records(
            filter: MediaFilter
            access: MediaAccess = PRIVATE
          ): [String!]!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Movie implements Media
          @join__implements(graph: C, interface: "Media")
          @join__type(graph: C) {
          records(filter: MediaFilter, access: MediaAccess = PUBLIC): [String!]!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query
          @join__type(graph: A)
          @join__type(graph: B)
          @join__type(graph: C) {
          books(
            filter: LibraryFilter
            access: LibraryAccess = PUBLIC
          ): [String!]! @join__field(graph: A)
          users(filter: UserFilter, access: UserAccess = PRIVATE): [String!]!
            @join__field(graph: B)
          media(filter: MediaFilter, access: MediaAccess = PRIVATE): [Media!]!
            @join__field(graph: C)
        }
      `);
    });

    test("merge enum type types when used as the return type for at least one object or interface field", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
              type: UserType
            }

            enum UserType {
              ADMIN
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
              type: UserType
            }

            enum UserType {
              REGULAR
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: B) @join__type(graph: A) {
          REGULAR @join__enumValue(graph: B)
          ADMIN @join__enumValue(graph: A)
        }
      `);
    });

    test("merge enum type types when used as the type for at least one field argument or input type field", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
            }

            enum UserType {
              ADMIN
              REGULAR
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
            }

            enum UserType {
              REGULAR
              ANONYMOUS
            }

            type Query {
              users(type: UserType): [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: A) @join__type(graph: B) {
          REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
        }
      `);
    });

    test("merge enum type types when used as the type for at least one field argument or input type field and as the return type for at least one object or interface field", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
              type: UserType
            }

            enum UserType {
              ADMIN
              REGULAR
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
              type: UserType
            }

            enum UserType {
              REGULAR
              ADMIN
            }

            type Query {
              users(type: UserType): [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: A) @join__type(graph: B) {
          ADMIN @join__enumValue(graph: A) @join__enumValue(graph: B)
          REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
        }
      `);
    });

    test("ignore directive if not defined by @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }

            type Query {
              users: [User]
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @uppercase on FIELD_DEFINITION

            type Review @shareable {
              name: String! @uppercase
            }

            type Query {
              reviews: [Review]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch("lowercase");
      expect(result.supergraphSdl).not.toMatch("uppercase");
      expect(result.publicSdl).not.toMatch("lowercase");
    });

    test("ignore directive if identically defined in all subgraphs", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type Review @shareable {
              name: String! @lowercase
            }

            type Query {
              reviews: [Review]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch("lowercase");
      expect(result.publicSdl).not.toMatch("lowercase");
    });

    test("ignore directive if not defined in all subgraphs", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch("lowercase");
      expect(result.publicSdl).not.toMatch("lowercase");
    });

    test("ignore directive if defined differently across subgraphs", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on OBJECT

            type User @shareable @lowercase {
              name: String!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch("lowercase");
      expect(result.publicSdl).not.toMatch("lowercase");
    });

    test("ignore directive if it has different locations across subgraphs", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on FIELD_DEFINITION

            type User @shareable {
              name: String! @lowercase
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            directive @lowercase on OBJECT | FIELD_DEFINITION

            type User @shareable @lowercase {
              name: String!
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).not.toMatch("lowercase");
      expect(result.publicSdl).not.toMatch("lowercase");
    });

    test("support @composeDirective when using multiple schema extensions", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
              extend schema
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
              extend schema
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                users: [User]
              }
            `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type Review @key(fields: "id") {
                id: ID!
                name: String!
              }

              extend type User @key(fields: "id") {
                id: ID!
                reviews: [Review]
              }

              type Query {
                review: [Review]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on FIELD_DEFINITION
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @lowercase on FIELD_DEFINITION
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: String! @lowercase @join__field(graph: A)
          reviews: [Review] @join__field(graph: B)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type User {
          id: ID!
          name: String! ${api.injectIf("guild", "@lowercase")}
          reviews: [Review]
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test("preserve directive if not defined in all subgraphs but included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                users: [User]
              }
            `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type Review @key(fields: "id") {
                id: ID!
                name: String!
              }

              extend type User @key(fields: "id") {
                id: ID!
                reviews: [Review]
              }

              type Query {
                review: [Review]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on FIELD_DEFINITION
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @lowercase on FIELD_DEFINITION
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: String! @lowercase @join__field(graph: A)
          reviews: [Review] @join__field(graph: B)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type User {
          id: ID!
          name: String! ${api.injectIf("guild", "@lowercase")}
          reviews: [Review]
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test("preserve directive if not applied on a field in all subgraphs but included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              directive @lowercase on FIELD_DEFINITION

              extend type Query {
                " users "
                users: [String] @lowercase @override(from: "a")
              }

              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective", "@override"]
                )
                @link(url: "https://specs.community.graphql.org/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")
            `),
        },
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.0"
                import: ["@key"]
              )

            type Query {
              users: [String]
            }
          `),
        },
        {
          name: "c",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.0"
                import: ["@key"]
              )

            extend type Query {
              comments: [String]
            }
          `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on FIELD_DEFINITION
      `);

      api.runIf("guild", () => {
        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          directive @lowercase on FIELD_DEFINITION
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query
          @join__type(graph: A)
          @join__type(graph: B)
          @join__type(graph: C) {
          comments: [String] @join__field(graph: C)
          """
          users
          """
          users: [String] @join__field(graph: B, override: "a") @lowercase
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type Query {
          comments: [String]
          """
          users
          """
          users: [String] ${api.injectIf("guild", "@lowercase")}
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION)
          @link(url: "https://specs.community.graphql.org/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test("ignore directive if defined identically in all subgraphs and not included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                users: [User]
              }
            `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

              directive @lowercase on FIELD_DEFINITION

              type Comment @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).not.toMatch(/lowercase/);
      expect(result.publicSdl).not.toMatch(/lowercase/);
    });

    test("preserve directive from one subgraph if defined differently across subgraphs but one included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }

              type Query {
                users: [User]
              }
            `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              directive @lowercase on OBJECT

              extend type User @key(fields: "id") @lowercase {
                id: ID!
                comments: [Comment]
              }

              type Comment @lowercase {
                id: ID!
                text: String!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on FIELD_DEFINITION
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @lowercase on FIELD_DEFINITION
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: String! @join__field(graph: A) @lowercase
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type User {
          id: ID!
          name: String! ${api.injectIf("guild", "@lowercase")}
          comments: [Comment]
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) {
          id: ID!
          text: String!
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type Comment {
          id: ID!
          text: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test("preserve directive if defined with overlapping locations across subgraphs and all included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }
            `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on OBJECT | FIELD_DEFINITION

              extend type User @key(fields: "id") @lowercase {
                id: ID!
                comments: [Comment]
              }

              type Comment @lowercase {
                id: ID!
                text: String!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on OBJECT | FIELD_DEFINITION
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @lowercase on OBJECT | FIELD_DEFINITION
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true)
          @lowercase {
          id: ID!
          name: String! @join__field(graph: A) @lowercase
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type User ${api.injectIf("guild", "@lowercase")} {
          id: ID!
          name: String! ${api.injectIf("guild", "@lowercase")}
          comments: [Comment]
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) @lowercase {
          id: ID!
          text: String!
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type Comment ${api.injectIf("guild", "@lowercase")} {
          id: ID!
          text: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test("preserve directive on scalars if included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever"])
                @composeDirective(name: "@whatever")

              directive @whatever on SCALAR

              scalar DateTime @whatever

              type User @key(fields: "id") {
                id: ID!
                name: String!
                createdAt: DateTime!
              }

              type Query {
                users: [User]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever on SCALAR
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @whatever on SCALAR
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: A, key: "id") {
          id: ID!
          name: String!
          createdAt: DateTime!
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type User {
          id: ID!
          name: String!
          createdAt: DateTime!
        }
      `);
    });

    test("preserve directive on enums if included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever"])
                @composeDirective(name: "@whatever")

              directive @whatever on ENUM

              enum UserType @whatever {
                ADMIN
                REGULAR
              }

              type User @key(fields: "id") {
                id: ID!
                name: String!
                type: UserType!
              }

              type Query {
                users: [User]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever on ENUM
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @whatever on ENUM
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @whatever @join__type(graph: A) {
          ADMIN @join__enumValue(graph: A)
          REGULAR @join__enumValue(graph: A)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType
        ${api.injectIf("guild", "@whatever")}
        {
          ADMIN
          REGULAR
        }
      `);
    });

    test("preserve directive on enum values if included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever"])
                @composeDirective(name: "@whatever")

              directive @whatever on ENUM_VALUE

              enum UserType {
                ADMIN @whatever
                REGULAR
              }

              type User @key(fields: "id") {
                id: ID!
                name: String!
                type: UserType!
              }

              type Query {
                users: [User]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever on ENUM_VALUE
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @whatever on ENUM_VALUE
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: A) {
          ADMIN @join__enumValue(graph: A) @whatever
          REGULAR @join__enumValue(graph: A)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType {
          ADMIN ${api.injectIf("guild", "@whatever")}
          REGULAR
        }
      `);
    });

    test("preserve directive on union types if included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever"])
                @composeDirective(name: "@whatever")

              directive @whatever on UNION

              type User @key(fields: "id") {
                id: ID!
                name: String!
              }

              type Admin @key(fields: "id") {
                id: ID!
                name: String!
              }

              union Whoever @whatever = User | Admin

              type Query {
                whoever: [Whoever]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever on UNION
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @whatever on UNION
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        union Whoever
          @join__type(graph: A)
          @join__unionMember(graph: A, member: "Admin")
          @join__unionMember(graph: A, member: "User")
          @whatever =
          | Admin
          | User
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        union Whoever ${api.injectIf("guild", "@whatever")} =
          | Admin
          | User
      `);
    });

    test("preserve directive on interface its field and argument if included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever"])
                @composeDirective(name: "@whatever")

              directive @whatever on FIELD_DEFINITION | INTERFACE | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

              type AuthenticatedUser implements User @key(fields: "id") {
                id: ID!
                name: String!
                createdAt: String!
                tags(limit: Int): [String!]!
              }

              type AnonymousUser implements User @key(fields: "id") {
                id: ID!
                tags(limit: Int): [String!]!
              }

              interface User @whatever {
                id: ID! @whatever
                tags(limit: Int @whatever): [String!]!
              }

              type Query {
                users: [User]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever on FIELD_DEFINITION | INTERFACE | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @whatever on FIELD_DEFINITION | INTERFACE | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface User @join__type(graph: A) @whatever {
          id: ID! @whatever
          tags(limit: Int @whatever): [String!]!
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        interface User ${api.injectIf("guild", "@whatever")} {
          id: ID! ${api.injectIf("guild", "@whatever")}
          tags(limit: Int ${api.injectIf("guild", "@whatever")}): [String!]!
        }
      `);
    });

    test("preserve directive on directive argument if included in @composeDirective", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@composeDirective"]
                )
                @link(url: "https://myspecs.dev/whatever/v1.0", import: ["@whatever", "@whenever"])
                @composeDirective(name: "@whatever")
                @composeDirective(name: "@whenever")

              directive @whatever(when: String @whenever) on FIELD_DEFINITION
              directive @whenever on ARGUMENT_DEFINITION

              type User {
                id: ID! @whatever(when: "now")
              }

              type Query {
                users: [User]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whatever(when: String @whenever) on FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @whenever on ARGUMENT_DEFINITION
      `);

      api.runIf("guild", () => {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @whatever(when: String @whenever) on FIELD_DEFINITION
        `);

        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          directive @whenever on ARGUMENT_DEFINITION
        `);
      });

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: A) {
          id: ID! @whatever(when: "now")
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type User {
          id: ID! ${api.injectIf("guild", '@whatever(when: "now")')}
        }
      `);
    });

    test("use highest version of a spec that imports a custom directive (@composeDirective)", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://myspecs.dev/lowercase/v1.1", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @lowercase
              }
            `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://myspecs.dev/lowercase/v1.3", import: ["@lowercase"])
                @composeDirective(name: "@lowercase")

              directive @lowercase on OBJECT | FIELD_DEFINITION

              extend type User @key(fields: "id") @lowercase {
                id: ID!
                comments: [Comment]
              }

              type Comment @lowercase {
                id: ID!
                text: String!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @lowercase on OBJECT | FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true)
          @lowercase {
          id: ID!
          name: String! @join__field(graph: A) @lowercase
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) @lowercase {
          id: ID!
          text: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION)
          @link(url: "https://myspecs.dev/lowercase/v1.3", import: ["@lowercase"]) {
          query: Query
        }
      `);
    });

    test("two different major versions of the same spec were used to import a scalar of the same name", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
                @link(url: "https://myspecs.dev/casing/v1.1", import: ["LowercaseString"])

              scalar LowercaseString

              type User @key(fields: "id") {
                id: ID!
                name: LowercaseString!
              }
            `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
                @link(url: "https://myspecs.dev/casing/v2.3", import: ["LowercaseString"])

              scalar LowercaseString

              extend type User @key(fields: "id") {
                id: ID!
                comments: [Comment]
              }

              type Comment {
                id: ID!
                text: LowercaseString!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        scalar LowercaseString @join__type(graph: A) @join__type(graph: B)
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        scalar LowercaseString
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: LowercaseString! @join__field(graph: A)
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type User {
          id: ID!
          name: LowercaseString!
          comments: [Comment]
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) {
          id: ID!
          text: LowercaseString!
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type Comment {
          id: ID!
          text: LowercaseString!
        }
      `);

      // No @link directive for the scalar - not sure why though...
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION) {
          query: Query
        }
      `);
    });

    test("allow to compose a built-in directive (@oneOf)", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
                @link(url: "https://spec.graphql.org/specified/v1.6", import: ["@oneOf"])
                @composeDirective(name: "@oneOf")

              directive @oneOf on INPUT_OBJECT

              input HelloInput @oneOf {
                world: String
                me: String
              }

              type Query {
                hello(input: HelloInput): String
              }
            `),
        },
      ]);

      if (version === "v2.0") {
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @oneOf on INPUT_OBJECT
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input HelloInput @oneOf @join__type(graph: A) {
          world: String
          me: String
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        input HelloInput
        ${api.injectIf("guild", "@oneOf")}
        {
          world: String
          me: String
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://spec.graphql.org/specified/v1.6", import: ["@oneOf"])
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION) {
          query: Query
        }
      `);
    });

    test("two different specs were used to import a scalar of the same name", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
                @link(url: "https://myspecs.dev/casing/v1.1", import: ["LowercaseString"])

              scalar LowercaseString

              type User @key(fields: "id") {
                id: ID!
                name: LowercaseString!
              }
            `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
                @link(url: "https://yourspecs.dev/casing/v2.3", import: ["LowercaseString"])

              scalar LowercaseString

              extend type User @key(fields: "id") {
                id: ID!
                comments: [Comment]
              }

              type Comment {
                id: ID!
                text: LowercaseString!
              }

              type Query {
                comments: [Comment]
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        scalar LowercaseString @join__type(graph: A) @join__type(graph: B)
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          name: LowercaseString! @join__field(graph: A)
          comments: [Comment] @join__field(graph: B)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Comment @join__type(graph: B) {
          id: ID!
          text: LowercaseString!
        }
      `);

      // No @link directive for the scalar - not sure why though...
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinSpecVersion[version]}", for: EXECUTION) {
          query: Query
        }
      `);
    });

    test("import type", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
              @link(url: "https://myspecs.dev/json/v1.0", import: ["JSON"])

            scalar JSON

            type User @shareable {
              name: JSON
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
              @link(url: "https://myspecs.dev/json/v1.0", import: [{ name: "JSON2", as: "JSON" }])

            scalar JSON

            type User @shareable {
              name: JSON
            }

            type Query {
              users: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // KNOW: if directives are defined and registered at least once by @composeDirective
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        scalar JSON @join__type(graph: A) @join__type(graph: B)
      `);
    });

    test("every entity must be annotated with the @join__type directive", () => {
      const result = composeServices([
        {
          name: "users",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
              role: Role!
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
        {
          name: "pandas",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda {
              name: ID!
              favoriteFood: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(
        `type Panda @join__type(graph: PANDAS)`,
      );
      expect(result.supergraphSdl).toContainGraphQL(
        `type User @join__type(graph: USERS, key: "email")`,
      );
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum Role @join__type(graph: USERS) {
          ADMIN @join__enumValue(graph: USERS)
          USER @join__enumValue(graph: USERS)
        }
      `);
    });

    test("renaming directives", () => {
      const result = composeServices([
        {
          name: "users",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: [{ name: "@key", as: "@primaryKey" }]
              )

            type User @primaryKey(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
              role: Role!
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
        {
          name: "pandas",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda @key(fields: "name") {
              name: ID!
              favoriteFood: String
            }
          `),
        },
      ]);

      // KNOW: if directive has an alias
      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(
        'type Panda @join__type(graph: PANDAS, key: "name")',
      );
      expect(result.supergraphSdl).toContainGraphQL(
        'type User @join__type(graph: USERS, key: "email")',
      );
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum Role @join__type(graph: USERS) {
          ADMIN @join__enumValue(graph: USERS)
          USER @join__enumValue(graph: USERS)
        }
      `);
    });

    test("namespaced directives", () => {
      const result = composeServices([
        {
          name: "users",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
              role: Role!
            }

            type Details @federation__shareable {
              createdAt: String
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
        {
          name: "pandas",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: [])

            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda @federation__key(fields: "name") {
              name: ID!
              favoriteFood: String
            }

            type Details @federation__shareable {
              createdAt: String
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
      ]);

      // KNOW: extract `federation` from `https://specs.apollo.dev/federation/v2.0`
      // KNOW: if the namespace is `federation`, make all its directives available with the `federation__` prefix
      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: USERS, key: "email") {
          email: ID!
          name: String
          totalProductsCreated: Int
          role: Role!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Panda @join__type(graph: PANDAS, key: "name") {
          name: ID!
          favoriteFood: String
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Details @join__type(graph: PANDAS) @join__type(graph: USERS) {
          createdAt: String
        }
      `);
    });

    test("repeatable @key", () => {
      const result = composeServices([
        {
          name: "users",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "email") @key(fields: "name") {
              email: ID!
              name: String
              totalProductsCreated: Int
            }

            type Query {
              allUsers: [User]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: USERS, key: "email")
          @join__type(graph: USERS, key: "name") {
          email: ID!
          name: String
          totalProductsCreated: Int
        }
      `);
    });

    test("@interfaceObject", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
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

            type Query {
              books: [Book]
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
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

      if (satisfiesVersionRange("< v2.3", version)) {
        assertCompositionFailure(result);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[a] Cannot import unknown element "@interfaceObject".',
            extensions: expect.objectContaining({
              code: "INVALID_LINK_DIRECTIVE_USAGE",
            }),
          }),
        );
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[b] Cannot import unknown element "@interfaceObject".',
            extensions: expect.objectContaining({
              code: "INVALID_LINK_DIRECTIVE_USAGE",
            }),
          }),
        );

        return;
      }

      assertCompositionSuccess(result);

      // KNOW: which interface should be extended by @interfaceObject
      // KNOW: which fields were added by @interfaceObject and by which graph
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Media
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", isInterfaceObject: true) {
          id: ID!
          title: String! @join__field(graph: A)
          reviews: [Review!]! @join__field(graph: B)
        }
      `);
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Book implements Media
          @join__implements(graph: A, interface: "Media")
          @join__type(graph: A, key: "id") {
          id: ID!
          title: String!
          reviews: [Review!]! @join__field
        }
      `);
    });

    test("@extends", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Book @key(fields: "id") {
              id: ID!
              title: String!
            }

            type Query {
              books: [Book]
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@extends"])

            type Book @key(fields: "id") @extends {
              id: ID!
              review: Review!
            }

            type Review {
              score: Int!
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Book
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id", extension: true) {
          id: ID!
          title: String! @join__field(graph: A)
          review: Review! @join__field(graph: B)
        }
      `);
    });

    test("@override", () => {
      let result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              inStock: Boolean!
            }

            type Query {
              products: [Product]
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

            type Product @key(fields: "id") {
              id: ID!
              inStock: Boolean! @override(from: "a")
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id") {
          id: ID!
          inStock: Boolean! @join__field(graph: B, override: "a")
        }
      `);

      result = api.composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@shareable", "@override"]
              )

            type User @key(fields: "id") @shareable {
              id: ID!
              name: String
            }

            type Query {
              user: User
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@shareable", "@override"]
              )

            type User @key(fields: "id") @shareable {
              id: ID!
              name: String @override(from: "main")
            }
          `),
        },
        {
          name: "main",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@shareable", "@override"]
              )

            type User @shareable {
              name: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: FOO, key: "id")
          @join__type(graph: MAIN)
          @join__type(graph: BAR, key: "id") {
          id: ID! @join__field(graph: BAR) @join__field(graph: FOO)
          name: String
            @join__field(graph: FOO)
            @join__field(graph: BAR, override: "main")
        }
      `);
    });

    test("remove @provides(fields:) when all fields are in common with @key(fields:) and @provides refers to a type extension", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend type User @key(fields: "id") {
              id: String! @external
            }

            type Group @key(fields: "id") {
              id: ID
              title: String
              users: [User] @provides(fields: "id")
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend type Group @key(fields: "id") {
              id: ID @external
              topic: Topic
            }

            type Topic @key(fields: "id") {
              id: ID!
              title: String!
            }

            type User @key(fields: "id") {
              id: String!
              name: String
            }
          `),
        },
        {
          name: "baz",
          typeDefs: parse(/* GraphQL */ `
            type Theme @key(fields: "id") {
              id: ID!
              primaryColor: String
            }

            type Query {
              themes: [Theme]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Group
          @join__type(graph: FOO, key: "id")
          @join__type(graph: BAR, key: "id") {
          id: ID
          title: String @join__field(graph: FOO)
          users: [User] @join__field(graph: FOO)
          topic: Topic @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Topic @join__type(graph: BAR, key: "id") {
          id: ID!
          title: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: FOO, key: "id")
          @join__type(graph: BAR, key: "id") {
          id: String!
          name: String @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Theme @join__type(graph: BAZ, key: "id") {
          id: ID!
          primaryColor: String
        }
      `);
    });

    test("preserve @provides(fields:) when all fields are in common with @key(fields:) and @provides refers to type definition", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            type User @key(fields: "id") {
              id: String! @external
            }

            type Group @key(fields: "id") {
              id: ID
              title: String
              users: [User] @provides(fields: "id")
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend type Group @key(fields: "id") {
              id: ID @external
              topic: Topic
            }

            type Topic @key(fields: "id") {
              id: ID!
              title: String!
            }

            type User @key(fields: "id") {
              id: String!
              name: String
            }
          `),
        },
        {
          name: "baz",
          typeDefs: parse(/* GraphQL */ `
            type Theme @key(fields: "id") {
              id: ID!
              primaryColor: String
            }

            type Query {
              themes: [Theme]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Group
          @join__type(graph: FOO, key: "id")
          @join__type(graph: BAR, key: "id") {
          id: ID
          title: String @join__field(graph: FOO)
          users: [User] @join__field(graph: FOO, provides: "id")
          topic: Topic @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Topic @join__type(graph: BAR, key: "id") {
          id: ID!
          title: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: BAR, key: "id")
          @join__type(graph: FOO, key: "id") {
          id: String!
            @join__field(graph: BAR)
            @join__field(graph: FOO, external: true)
          name: String @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Theme @join__type(graph: BAZ, key: "id") {
          id: ID!
          primaryColor: String
        }
      `);
    });

    test("@external + @provides", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Product @key(fields: "id") {
              id: ID!
              name: String! @shareable
              inStock: Int!
            }

            type Query {
              products: [Product]
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external", "@provides"]
              )

            type Product @key(fields: "id") {
              id: ID!
              name: String! @external
            }

            type Query {
              outOfStockProducts: [Product!]! @provides(fields: "name")
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String!
            @join__field(graph: A)
            @join__field(graph: B, external: true)
          inStock: Int! @join__field(graph: A)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: A) @join__type(graph: B) {
          products: [Product] @join__field(graph: A)
          outOfStockProducts: [Product!]!
            @join__field(graph: B, provides: "name")
        }
      `);
    });

    test("@external + @requires", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              name: String!
              inStock: Int!
            }

            type Query {
              products: [Product]
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external", "@requires"]
              )

            type Product @key(fields: "id") {
              id: ID!
              inStock: Int! @external
              isAvailable: String! @requires(fields: "inStock")
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // KNOW: which fields are external
      // KNOW: which fields are required
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String! @join__field(graph: A)
          inStock: Int!
            @join__field(graph: A)
            @join__field(graph: B, external: true)
          isAvailable: String! @join__field(graph: B, requires: "inStock")
        }
      `);
    });

    test("@tag", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@tag"])

            type Query {
              customer(id: String!): Customer @tag(name: "team-customers")
              employee(id: String! @tag(name: "team-admin")): Employee @tag(name: "team-admin")
              employees(filter: EmployeesFilter!): [Employee!] @tag(name: "team-admin")
            }

            scalar DateTime @tag(name: "team-admin")

            interface User @tag(name: "team-accounts") {
              id: String!
              name(lowercase: Boolean @tag(name: "team-accounts")): String!
            }

            type Customer implements User @tag(name: "team-customers") {
              id: String!
              name(lowercase: Boolean @tag(name: "team-accounts")): String!
            }

            type Employee implements User @tag(name: "team-admin") {
              id: String!
              name(lowercase: Boolean @tag(name: "team-accounts")): String!
              ssn: String!
              createdAt: DateTime!
            }

            input EmployeesFilter {
              id: String @tag (name: "team-admin")
              name: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: A) {
          customer(id: String!): Customer @tag(name: "team-customers")
          employee(id: String! @tag(name: "team-admin")): Employee
            @tag(name: "team-admin")
          employees(filter: EmployeesFilter!): [Employee!]
            @tag(name: "team-admin")
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface User @join__type(graph: A) @tag(name: "team-accounts") {
          id: String!
          name(lowercase: Boolean @tag(name: "team-accounts")): String!
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        interface User {
          id: String!
          name(lowercase: Boolean): String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Employee implements User
          @join__implements(graph: A, interface: "User")
          @join__type(graph: A)
          @tag(name: "team-admin") {
          id: String!
          name(lowercase: Boolean @tag(name: "team-accounts")): String!
          ssn: String!
          createdAt: DateTime!
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type Employee implements User {
          id: String!
          name(lowercase: Boolean): String!
          ssn: String!
          createdAt: DateTime!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Customer implements User
          @join__implements(graph: A, interface: "User")
          @join__type(graph: A)
          @tag(name: "team-customers") {
          id: String!
          name(lowercase: Boolean @tag(name: "team-accounts")): String!
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type Customer implements User {
          id: String!
          name(lowercase: Boolean): String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        scalar DateTime @join__type(graph: A) @tag(name: "team-admin")
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        scalar DateTime
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input EmployeesFilter @join__type(graph: A) {
          id: String @tag(name: "team-admin")
          name: String
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        input EmployeesFilter {
          id: String
          name: String
        }
      `);
    });

    // Skipping because this test is not valid for earlier versions
    test("@tag on directive", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@tag", "@composeDirective"])
            @link(url: "https://myspecs.dev/access/v1.0", import: ["@access"])
                @composeDirective(name: "@access")

            directive @access(scope: String @tag(name: "team-admin")) on FIELD_DEFINITION

            type Query {
              employee(id: String!): Employee @tag(name: "team-admin") @access(scope: "admin")
            }

            type Employee {
              id: String!
              name: String!
              ssn: String!
            }
          `),
        },
      ]);

      if (satisfiesVersionRange("< v2.3", version)) {
        if (version === "v2.0") {
          assertCompositionFailure(result);
        } else {
          assertCompositionSuccess(result);
        }
        return;
      }

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: A) {
          employee(id: String!): Employee
            @tag(name: "team-admin")
            @access(scope: "admin")
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Employee @join__type(graph: A) {
          id: String!
          name: String!
          ssn: String!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @access(
          scope: String @tag(name: "team-admin")
        ) on FIELD_DEFINITION
      `);
    });

    test("entity annotated with @key directive must have @join__type with key argument", () => {
      const result = composeServices([
        {
          name: "users",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
              role: Role!
            }

            enum Role {
              ADMIN
              USER
            }
          `),
        },
        {
          name: "pandas",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda {
              name: ID!
              favoriteFood: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(
        "type Panda @join__type(graph: PANDAS)",
      );
      expect(result.supergraphSdl).toContainGraphQL(
        'type User @join__type(graph: USERS, key: "email")',
      );
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum Role @join__type(graph: USERS) {
          ADMIN @join__enumValue(graph: USERS)
          USER @join__enumValue(graph: USERS)
        }
      `);
    });

    test("fields referenced by @key directive must NOT be annotated with @join__field", () => {
      const result = composeServices([
        {
          name: "reviews",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              title: String
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      // KNOW: if field is the primary key, to not annotate it with @join__field
      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: PRODUCTS, key: "id")
          @join__type(graph: REVIEWS, key: "id", extension: true) {
          id: ID!
          title: String @join__field(graph: PRODUCTS)
          reviews: [Review] @join__field(graph: REVIEWS)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Review @join__type(graph: REVIEWS, key: "id") {
          id: ID!
          rating: Float
          content: String
        }
      `);
    });

    test("entity used by more than one service must be annotated with @join__type of these service", () => {
      const result = composeServices([
        {
          name: "reviews",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              title: String
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(
        'type Product @join__type(graph: PRODUCTS, key: "id") @join__type(graph: REVIEWS, key: "id", extension: true)',
      );
    });

    test("entity directly used by more than one service must have all fields annotated with @join__field directive, where `graph` argument points to the owning service", () => {
      const result = composeServices([
        {
          name: "reviews",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
            }

            type Price {
              amount: Float
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: PRODUCTS, key: "id")
          @join__type(graph: REVIEWS, key: "id", extension: true) {
          id: ID!
          title: String @join__field(graph: PRODUCTS)
          price: Price! @join__field(graph: PRODUCTS)
          reviews: [Review] @join__field(graph: REVIEWS)
        }
      `);
    });

    test("a field of an entity with different return type (nullability) must be annotated with multiple @join__field directives, each with original return type", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
            type Position @shareable {
              x: Int!
              y: Int!
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
            type Position @shareable {
              x: Int
              y: Int!
            }

            type Query {
              position: Position
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Position @join__type(graph: A) @join__type(graph: B) {
          x: Int
            @join__field(graph: A, type: "Int!")
            @join__field(graph: B, type: "Int")
          y: Int!
        }
      `);
    });

    test("a field of an entity with same type but external:true in one or more must be annotated with multiple @join__field directives", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id name") {
              id: ID!
              name: String!
              discount: Int!
            }

            type Query {
              product(id: ID!): Product
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

            type Product @key(fields: "id name") {
              id: ID!
              name: String! @external
              reviews: [String]
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: A, key: "id name")
          @join__type(graph: B, key: "id name") {
          id: ID!
          name: String!
            @join__field(graph: A)
            @join__field(graph: B, external: true)
          discount: Int! @join__field(graph: A)
          reviews: [String] @join__field(graph: B)
        }
      `);
    });

    test("enum indirectly used by more than one service must have all values annotated with @join__field directive, where `graph` argument points to the owning service", () => {
      const result = composeServices([
        {
          name: "reviews",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
              category: ProductCategory!
            }

            type Price {
              amount: Float
            }

            enum ProductCategory {
              ALL
              ELECTRONICS
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: PRODUCTS, key: "id")
          @join__type(graph: REVIEWS, key: "id", extension: true) {
          id: ID!
          title: String @join__field(graph: PRODUCTS)
          price: Price! @join__field(graph: PRODUCTS)
          category: ProductCategory! @join__field(graph: PRODUCTS)
          reviews: [Review] @join__field(graph: REVIEWS)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum ProductCategory @join__type(graph: PRODUCTS) {
          ALL @join__enumValue(graph: PRODUCTS)
          ELECTRONICS @join__enumValue(graph: PRODUCTS)
        }
      `);
    });

    test("query must be annotated with @join__type directive of every service", () => {
      const result = composeServices([
        {
          name: "reviews",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
            }

            type Price {
              amount: Float
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(
        "type Query @join__type(graph: PRODUCTS) @join__type(graph: REVIEWS)",
      );
    });

    test("all fields of query object must be annotated with @join__field pointing to the owning service", () => {
      const result = composeServices([
        {
          name: "reviews",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@shareable"])

            extend type Query {
              review(id: ID!): Review
              product(id: ID!): Product @shareable
            }

            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
            }

            type Price {
              amount: Float
            }

            extend type Query {
              product(id: ID!): Product @shareable
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: PRODUCTS) @join__type(graph: REVIEWS) {
          product(id: ID!): Product
          review(id: ID!): Review @join__field(graph: REVIEWS)
        }
      `);
    });

    test("[v1] all fields of query object must be annotated with @join__field pointing to the owning service", () => {
      const result = composeServices([
        {
          name: "reviews",
          typeDefs: parse(/* GraphQL */ `
            extend type Query {
              review(id: ID!): Review
              product(id: ID!): Product
            }

            extend type Product @key(fields: "id") {
              id: ID! @external
              reviews: [Review]
            }

            type Review @key(fields: "id") {
              id: ID!
              rating: Float
              content: String
            }
          `),
        },
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            type Product @key(fields: "id") {
              id: ID!
              title: String
              price: Price!
            }

            type Price {
              amount: Float
            }

            extend type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // Query.product is defined in all subgraphs, so no need to annotate it (that's not true in Fed v2 though)
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: PRODUCTS) @join__type(graph: REVIEWS) {
          product(id: ID!): Product
          review(id: ID!): Review @join__field(graph: REVIEWS)
        }
      `);
    });

    test("@key(resolvable: false) should be passed to @join__type(resolvable: false)", () => {
      let result = composeServices([
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product @key(fields: "id", resolvable: false) {
              id: ID!
              title: String
            }

            type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product
          @join__type(graph: PRODUCTS, key: "id", resolvable: false) {
          id: ID!
          title: String
        }
      `);
    });

    test("@join__implements on Interface type", () => {
      const result = composeServices([
        {
          name: "products",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product implements Node & SellingItem @key(fields: "id")  {
              id: ID!
              name: String!
              price: Price!
            }

            interface Node {
              id: ID!
            }

            interface SellingItem implements Node {
              id: ID!
              price: Price!
            }

            type Price {
              amount: Float
            }

            type Query {
              product(id: ID!): Product
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Product implements Node & SellingItem
          @join__implements(graph: PRODUCTS, interface: "Node")
          @join__implements(graph: PRODUCTS, interface: "SellingItem")
          @join__type(graph: PRODUCTS, key: "id") {
          id: ID!
          name: String!
          price: Price!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface SellingItem implements Node
          @join__implements(graph: PRODUCTS, interface: "Node")
          @join__type(graph: PRODUCTS) {
          id: ID!
          price: Price!
        }
      `);
    });

    test("Fed v1: no @join__type(key:) on interface type", () => {
      const result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Product {
              id: ID!
              name: String!
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            type User implements Node @key(fields: "id") {
              id: ID!
              age: Int!
            }

            interface Node @key(fields: "id") {
              id: ID!
            }

            type Query {
              user: User
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node @join__type(graph: B) {
          id: ID!
        }
      `);
    });

    describe("descriptions", () => {
      test("on scalars", () => {
        const result = composeServices([
          {
            name: "reviews",
            typeDefs: parse(/* GraphQL */ `
              extend type Query {
                dateTime: DateTime
              }

              """
              reviews
              """
              scalar DateTime
            `),
          },
          {
            name: "products",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              """
              products
              """
              scalar DateTime

              type Product @key(fields: "id") {
                id: ID!
                title: String
                createdAt: DateTime
              }

              extend type Query {
                product(
                  id: ID!
                ): Product
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          products
          """
          scalar DateTime
        `);
      });

      test("on object types", () => {
        let result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              """
              a
              """
              type Query {
                a: String
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              """
              b
              """
              type Query {
                b: String
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          a
          """
          type Query @join__type(graph: A) @join__type(graph: B) {
            a: String @join__field(graph: A)
            b: String @join__field(graph: B)
          }
        `);

        result = composeServices([
          {
            name: "reviews",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

              """reviews"""
              type Query {
                """
                reviews
                """
                review(
                  """
                  reviews
                  """
                  id: ID!
                ): Review
              }

              extend type Product @key(fields: "id") {
                """
                it will be removed
                """
                id: ID! @external
                """
                reviews
                """
                reviews: [Review]
              }

              """
              reviews
              """
              type Review @key(fields: "id") {
                """
                reviews
                """
                id: ID!
                """
                reviews
                """
                rating: Float
                """
                reviews
                """
                content: String
              }
            `),
          },
          {
            name: "pricing",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@extends"])

              type Product @key(fields: "id") @extends {
                """
                pricing
                """
                id: ID! @external
                promoCodes: [PromoCode]
              }

              type PromoCode {
                id: ID!
                code: String!
              }
            `),
          },
          {
            name: "products",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              """
              products
              """
              type Product @key(fields: "id") {
                """
                products
                """
                id: ID!
                """
                products
                """
                title: String
                """
                products
                """
                price(currency: String = "USD"): Price!
              }

              """
              products
              """
              type Price {
                """
                products
                """
                amount: Float
              }

              type Query {
                """
                products
                """
                product(
                  """
                  products
                  """
                  id: ID!
                ): Product
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          products
          """
          type Price @join__type(graph: PRODUCTS) {
            """
            products
            """
            amount: Float
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          products
          """
          type Product
            @join__type(graph: PRICING, key: "id", extension: true)
            @join__type(graph: PRODUCTS, key: "id")
            @join__type(graph: REVIEWS, key: "id", extension: true) {
            """
            pricing
            """
            id: ID!
            promoCodes: [PromoCode] @join__field(graph: PRICING)
            """
            products
            """
            title: String @join__field(graph: PRODUCTS)
            """
            products
            """
            price(currency: String = "USD"): Price!
              @join__field(graph: PRODUCTS)
            """
            reviews
            """
            reviews: [Review] @join__field(graph: REVIEWS)
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          reviews
          """
          type Review @join__type(graph: REVIEWS, key: "id") {
            """
            reviews
            """
            id: ID!

            """
            reviews
            """
            rating: Float

            """
            reviews
            """
            content: String
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          reviews
          """
          type Query
            @join__type(graph: PRODUCTS)
            @join__type(graph: REVIEWS)
            @join__type(graph: PRICING) {
            """
            products
            """
            product(
              """
              products
              """
              id: ID!
            ): Product @join__field(graph: PRODUCTS)
            """
            reviews
            """
            review(
              """
              reviews
              """
              id: ID!
            ): Review @join__field(graph: REVIEWS)
          }
        `);
      });

      test("on fields with @override (entity types)", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@requires", "@external"]
                )

              type User @key(fields: "id") {
                id: ID!
                name: String! @external
                aName: String! @requires(fields: "name")
              }

              type Query {
                userA: User
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

              type User @key(fields: "id") {
                id: ID!
                name: String! @override(from: "c")
              }

              type Query {
                userB: User
              }
            `),
          },
          {
            name: "c",
            typeDefs: parse(/* GraphQL */ `
              type User @key(fields: "id") {
                id: ID!
                "it should not be in supergraph"
                name: String! @external
              }

              type Foo @key(fields: "id") {
                id: ID!
                foo: String
              }

              scalar _Any
              union _Entity = Foo | User

              type _Service {
                sdl: String!
              }

              type Query {
                _entities(representations: [_Any!]!): [_Entity]!
                _service: _Service
                c: String!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User
            @join__type(graph: A, key: "id")
            @join__type(graph: B, key: "id")
            @join__type(graph: C, key: "id") {
            id: ID!
            name: String!
              @join__field(external: true, graph: A)
              @join__field(graph: B, override: "c")
            aName: String! @join__field(graph: A, requires: "name")
          }
        `);
      });

      test("on fields with @override (not entity types)", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@shareable", "@override", "@key"]
                )

              type User @shareable {
                id: ID!
                name: String! @override(from: "b")
              }

              type Organization @key(fields: "id") {
                id: ID!
                owner: User @shareable
              }

              type Query {
                organizationA: Organization
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable", "@key"])

              type User @shareable {
                id: ID! @shareable
                """should be preserved"""
                name: String! @shareable
              }

              type Organization @key(fields: "id") {
                id: ID!
                owner: User @shareable
              }

              type Query {
                organizationB: Organization
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: A) @join__type(graph: B) {
            id: ID!
            """
            should be preserved
            """
            name: String! @join__field(graph: A, override: "b")
          }
        `);
      });

      test("on object type definition with @extends", () => {
        const result = composeServices([
          {
            name: "reviews",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@extends"])

              type Query {
                review(
                  id: ID!
                ): Review
              }

              """
              reviews
              """
              type Product @key(fields: "id") @extends {
                """
                reviews
                """
                id: ID! @external
                """
                reviews
                """
                reviews: [Review]
              }

              type Review {
                id: ID!
                rating: Float
                content: String
              }
            `),
          },
          {
            name: "products",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type Product @key(fields: "id") {
                """
                products
                """
                id: ID!
                """
                products
                """
                title: String
              }

              type Query {
                product(
                  id: ID!
                ): Product
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          reviews
          """
          type Product
            @join__type(graph: PRODUCTS, key: "id")
            @join__type(graph: REVIEWS, key: "id", extension: true) {
            """
            products
            """
            id: ID!
            """
            products
            """
            title: String @join__field(graph: PRODUCTS)
            """
            reviews
            """
            reviews: [Review] @join__field(graph: REVIEWS)
          }
        `);
      });

      test("on object types with arguments", () => {
        const result = composeServices([
          {
            name: "reviews",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@shareable"])

              """reviews"""
              type Query {
                """
                reviews
                """
                review(
                  """
                  reviews
                  """
                  id: ID!
                ): Review
              }

              extend type Product @key(fields: "id") {
                """
                it will be removed
                """
                id: ID! @external
                """
                reviews
                """
                reviews(
                  """
                  reviews
                  """
                  limit: Int
                ): [Review]
                """
                reviews
                """
                price(
                  """
                  reviews
                  """
                  currency: String = "USD"
                ): Price! @shareable
              }

              """
              reviews
              """
              type Review @key(fields: "id") {
                """
                reviews
                """
                id: ID!
                """
                reviews
                """
                rating: Float
                """
                reviews
                """
                content: String
              }

              """
              reviews
              """
              type Price {
                """
                reviews
                """
                amount: Float @shareable
              }
            `),
          },
          {
            name: "pricing",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@extends", "@shareable"])

              type Product @key(fields: "id") @extends {
                """
                pricing
                """
                id: ID! @external
                promoCodes: [PromoCode]
                """
                pricing
                """
                price(
                  """
                  pricing
                  """
                  currency: String = "USD"
                ): Price! @shareable
              }

              type PromoCode {
                id: ID!
                code: String!
              }

              """
              pricing
              """
              type Price {
                """
                pricing
                """
                amount: Float @shareable
              }
            `),
          },
          {
            name: "products",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

              """
              products
              """
              type Product @key(fields: "id") {
                """
                products
                """
                id: ID!
                """
                products
                """
                title: String
                """
                products
                """
                price(
                  """
                  products
                  """
                  currency: String = "USD"
                ): Price! @shareable
              }

              """
              products
              """
              type Price {
                """
                products
                """
                amount: Float @shareable
              }

              type Query {
                """
                products
                """
                product(
                  """
                  products
                  """
                  id: ID!
                ): Product
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          pricing
          """
          type Price
            @join__type(graph: PRICING)
            @join__type(graph: PRODUCTS)
            @join__type(graph: REVIEWS) {
            """
            pricing
            """
            amount: Float
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          products
          """
          type Product
            @join__type(extension: true, graph: PRICING, key: "id")
            @join__type(extension: true, graph: REVIEWS, key: "id")
            @join__type(graph: PRODUCTS, key: "id") {
            """
            pricing
            """
            id: ID!
            """
            pricing
            """
            price(
              """
              pricing
              """
              currency: String = "USD"
            ): Price!
            promoCodes: [PromoCode] @join__field(graph: PRICING)
            """
            reviews
            """
            reviews(
              """
              reviews
              """
              limit: Int
            ): [Review] @join__field(graph: REVIEWS)
            """
            products
            """
            title: String @join__field(graph: PRODUCTS)
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          reviews
          """
          type Review @join__type(graph: REVIEWS, key: "id") {
            """
            reviews
            """
            id: ID!

            """
            reviews
            """
            rating: Float

            """
            reviews
            """
            content: String
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          reviews
          """
          type Query
            @join__type(graph: PRODUCTS)
            @join__type(graph: REVIEWS)
            @join__type(graph: PRICING) {
            """
            products
            """
            product(
              """
              products
              """
              id: ID!
            ): Product @join__field(graph: PRODUCTS)
            """
            reviews
            """
            review(
              """
              reviews
              """
              id: ID!
            ): Review @join__field(graph: REVIEWS)
          }
        `);
      });

      test("on input object types", () => {
        // @apollo/composition sorts services by name A->Z
        // and the first detected description wins.
        // That's why descriptions from `a` service are available on `UserInput`.
        // In case `UserInput` has no description in `a` service, the description from `b` service is NOT used.
        // It's weird but let's follow their logic for consistency.
        const result = composeServices([
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                """
                b
                """
                input UserInput {
                  """
                  b
                  """
                  name: String!
                  """
                  b
                  """
                  email: String
                }

                type Library @shareable {
                  book(title: String, section: String): String
                }

                type Query {
                  library: Library
                }
              `),
          },
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                input UserInput {
                  """
                  a
                  """
                  name: String!
                  """
                  a
                  """
                  age: Int
                }

                type Library @shareable {
                  book(title: String, author: String): String
                }
              `),
          },
        ]);
        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          b
          """
          input UserInput @join__type(graph: A) @join__type(graph: B) {
            """
            a
            """
            name: String!
          }
        `);
      });

      describe("on enum types", () => {
        test("when used as the return type for at least one object or interface field", () => {
          const result = composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                  type: UserType
                }

                """
                a
                """
                enum UserType {
                  """
                  a
                  """
                  ADMIN
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                  type: UserType
                }

                """
                b
                """
                enum UserType {
                  """
                  b
                  """
                  REGULAR
                }

                type Query {
                  users: [User]
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            """
            a
            """
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              """
              a
              """
              ADMIN @join__enumValue(graph: A)

              """
              b
              """
              REGULAR @join__enumValue(graph: B)
            }
          `);
        });

        test("when used as the type for at least one field argument or input type field", () => {
          const result = composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                }

                """
                a
                """
                enum UserType {
                  """
                  a
                  """
                  ADMIN
                  """
                  a
                  """
                  REGULAR
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                }

                """
                b
                """
                enum UserType {
                  """
                  b
                  """
                  REGULAR
                  """
                  b
                  """
                  ANONYMOUS
                }

                type Query {
                  users(type: UserType): [User]
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            """
            a
            """
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              """
              a
              """
              REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
            }
          `);
        });

        test("when used as the type for at least one field argument or input type field and as the return type for at least one object or interface field", () => {
          const result = composeServices([
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                  type: UserType
                }

                """
                b
                """
                enum UserType {
                  """
                  b
                  """
                  REGULAR
                  """
                  b
                  """
                  ADMIN
                }

                type Query {
                  users(type: UserType): [User]
                }
              `),
            },
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                  type: UserType
                }

                """
                a
                """
                enum UserType {
                  """
                  a
                  """
                  ADMIN
                  REGULAR
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            """
            a
            """
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              """
              a
              """
              ADMIN @join__enumValue(graph: A) @join__enumValue(graph: B)

              """
              b
              """
              REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
            }
          `);
        });
      });

      test("on union types", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

                union Media = Movie

                type Movie {
                  id: ID!
                  title: String!
                }

                type Admin @key(fields: "id") {
                  id: ID!
                }
            `),
          },
          {
            name: "c",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

                """
                c
                """
                union Media = Song

                type Song {
                  id: ID!
                  title: String!
                }

                type Anonymous @key(fields: "id") {
                  id: ID!
                }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

                """
                b
                """
                union Media = Book

                type Book {
                  id: ID!
                  title: String!
                }

                type User @key(fields: "id") {
                  id: ID!
                }

                type Query {
                  media(id: ID!): Media
                }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          b
          """
          union Media
            @join__type(graph: A)
            @join__type(graph: B)
            @join__type(graph: C)
            @join__unionMember(graph: A, member: "Movie")
            @join__unionMember(graph: B, member: "Book")
            @join__unionMember(graph: C, member: "Song") =
            | Movie
            | Book
            | Song
        `);
      });

      test("on interface types", () => {
        const result = composeServices([
          {
            name: "c",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type User @key(fields: "id") {
                id: ID!
                age: Int!
              }

              """
              c
              """
              interface Details {
                """
                c
                """
                age: Int
              }
            `),
          },
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type User @key(fields: "id") {
                id: ID!
                name: String!
              }

              interface Details {
                """
                a
                """
                name: ID!
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type User @key(fields: "id") {
                id: ID!
                email: String!
              }

              """
              b
              """
              interface Details {
                """
                b
                """
                email: String
                """
                b
                """
                age: Int
              }

              type Query {
                user: User
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          """
          b
          """
          interface Details
            @join__type(graph: A)
            @join__type(graph: B)
            @join__type(graph: C) {
            """
            a
            """
            name: ID! @join__field(graph: A)
            """
            b
            """
            email: String @join__field(graph: B)
            """
            b
            """
            age: Int @join__field(graph: B) @join__field(graph: C)
          }
        `);
      });
    });

    describe("@deprecated", () => {
      test("on object types", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

              extend type Query {
                reviews(
                  limit: Int @deprecated
                ): [Review] @deprecated
              }

              extend type Product @key(fields: "id") {
                id: ID! @external @deprecated(reason: "a")
                reviews: [Review] @deprecated
              }

              type Review @key(fields: "id") {
                id: ID! @deprecated
                rating: Float @deprecated
                content: String @deprecated
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type Product @key(fields: "id") {
                id: ID! @deprecated(reason: "b")
                title: String @deprecated
                price: Price! @deprecated
              }

              type Price {
                amount: Float @deprecated
              }

              extend type Query {
                product(
                  id: ID!
                ): Product @deprecated
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Price @join__type(graph: B) {
            amount: Float @deprecated
          }
        `);

        // Seems like first @deprecated wins (see the `id` field - `a` won, because it was first, even though the field is defined in `b`)
        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Product
            @join__type(graph: B, key: "id")
            @join__type(graph: A, key: "id", extension: true) {
            id: ID! @deprecated(reason: "a")
            title: String @join__field(graph: B) @deprecated
            price: Price! @join__field(graph: B) @deprecated
            reviews: [Review] @join__field(graph: A) @deprecated
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Review @join__type(graph: A, key: "id") {
            id: ID! @deprecated
            rating: Float @deprecated
            content: String @deprecated
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type Query @join__type(graph: B) @join__type(graph: A) {
            product(id: ID!): Product @join__field(graph: B) @deprecated
            reviews(limit: Int @deprecated): [Review]
              @join__field(graph: A)
              @deprecated
          }
        `);
      });

      test("on input object types", () => {
        const result = composeServices([
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                input UserInput {
                  name: String @deprecated(reason: "b")
                  email: String @deprecated(reason: "b")
                }

                type Library @shareable {
                  book(title: String, section: String): String
                }

                type Query {
                  library: Library
                }
              `),
          },
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                input UserInput {
                  name: String
                  email: String @deprecated(reason: "a")
                  age: Int @deprecated(reason: "a")
                }

                type Library @shareable {
                  book(title: String, author: String): String
                }
              `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          input UserInput @join__type(graph: A) @join__type(graph: B) {
            name: String @deprecated(reason: "b")
            email: String @deprecated(reason: "a")
          }
        `);
      });

      describe("on enum types", () => {
        test("when used as the return type for at least one object or interface field", () => {
          const result = composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                  type: UserType
                }

                enum UserType {
                  ADMIN @deprecated(reason: "a")
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                  type: UserType
                }

                enum UserType {
                  REGULAR @deprecated(reason: "b")
                }

                type Query {
                  users: [User]
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              ADMIN @join__enumValue(graph: A) @deprecated(reason: "a")
              REGULAR @join__enumValue(graph: B) @deprecated(reason: "b")
            }
          `);
        });

        test("when used as the type for at least one field argument or input type field", () => {
          const result = composeServices([
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                }

                enum UserType {
                  ADMIN @deprecated(reason: "a")
                  REGULAR
                }
              `),
            },
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                }

                enum UserType {
                  REGULAR @deprecated(reason: "b")
                  ANONYMOUS @deprecated(reason: "b")
                }

                type Query {
                  users(type: UserType): [User]
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              REGULAR
                @join__enumValue(graph: A)
                @join__enumValue(graph: B)
                @deprecated(reason: "b")
            }
          `);
        });

        test("when used as the type for at least one field argument or input type field and as the return type for at least one object or interface field", () => {
          const result = composeServices([
            {
              name: "b",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                  type: UserType
                }

                enum UserType {
                  REGULAR @deprecated(reason: "b")
                  ADMIN
                }

                type Query {
                  users(type: UserType): [User]
                }
              `),
            },
            {
              name: "a",
              typeDefs: parse(/* GraphQL */ `
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

                type User @shareable {
                  name: String!
                  type: UserType
                }

                enum UserType {
                  ADMIN
                  REGULAR @deprecated(reason: "a")
                }
              `),
            },
          ]);

          assertCompositionSuccess(result);

          expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
            enum UserType @join__type(graph: A) @join__type(graph: B) {
              ADMIN @join__enumValue(graph: A) @join__enumValue(graph: B)
              REGULAR
                @join__enumValue(graph: A)
                @join__enumValue(graph: B)
                @deprecated(reason: "a")
            }
          `);
        });
      });
    });

    test("enum join__Graph must contain all subgraphs with their URLs", () => {
      const result = composeServices([
        {
          name: "users",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type User @key(fields: "email") {
              email: ID!
              name: String
              totalProductsCreated: Int
            }
          `),
          url: "https://users.com",
        },
        {
          name: "pandas",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              allPandas: [Panda]
              panda(name: ID!): Panda
            }

            type Panda {
              name: ID!
              favoriteFood: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum join__Graph {
          PANDAS @join__graph(name: "pandas", url: "")
          USERS @join__graph(name: "users", url: "https://users.com")
        }
      `);
    });

    describe("federation directives and types", () => {
      test("link and join spec", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String
            }

            type Query {
              user: User
            }
          `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User @shareable {
              name: String
            }
          `),
          },
        ]);

        assertCompositionSuccess(result);

        parse(linkSDL)
          .definitions.concat(parse(joinSDL(version)).definitions)
          // .filter(def => def.kind === Kind.DIRECTIVE_DEFINITION && def.name.value !== 'join__directive')
          .forEach((def) => {
            expect(result.supergraphSdl).toContainGraphQL(print(def));
          });
      });

      test("[v1] link and join spec", () => {
        const result = composeServices([
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              type User {
                name: String
              }

              type Query {
                user: User
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              type Dog {
                name: String
              }

              type Query {
                dog: Dog
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        parse(linkSDL)
          .definitions.concat(parse(joinSDL("v1.0")).definitions)
          .forEach((def) => {
            expect(result.supergraphSdl).toContainGraphQL(print(def));
          });
      });
    });
  });

  describe("Federation v1 only", () => {
    test("delete subgraph spec", () => {
      let result = composeServices([
        {
          name: "users",
          typeDefs: parse(/* GraphQL */ `
            type User {
              name: String!
              blocked: Boolean!
            }

            type Query {
              _entities(representations: [_Any!]!): [_Entity]!
            }

            extend type Query {
              users: [User]!
            }

            extend type Query {
              _service: _Service!
            }

            scalar _FieldSet
            scalar _Any

            union _Entity = User

            type _Service {
              sdl: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: USERS) {
          users: [User]!
        }
      `);

      expect(result.supergraphSdl).not.toEqual(
        expect.stringContaining("type _Service"),
      );
      expect(result.supergraphSdl).not.toEqual(
        expect.stringContaining("scalar _Any"),
      );
      expect(result.supergraphSdl).not.toEqual(
        expect.stringContaining("scalar _FieldSet"),
      );
      expect(result.supergraphSdl).not.toEqual(
        expect.stringContaining("union _Entity"),
      );

      result = composeServices([
        {
          name: "users",
          typeDefs: parse(/* GraphQL */ `
            type User {
              name: String!
              blocked: Boolean!
            }

            type RootQuery {
              _entities(representations: [_Any!]!): [_Entity]!
            }

            schema {
              query: RootQuery
            }

            extend type RootQuery {
              users: [User]!
            }

            extend type RootQuery {
              _service: _Service!
            }

            scalar _FieldSet
            scalar _Any

            union _Entity = User

            type _Service {
              sdl: String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: USERS) {
          users: [User]!
        }
      `);

      expect(result.supergraphSdl).not.toEqual(
        expect.stringContaining("type _Service"),
      );
      expect(result.supergraphSdl).not.toEqual(
        expect.stringContaining("scalar _Any"),
      );
      expect(result.supergraphSdl).not.toEqual(
        expect.stringContaining("scalar _FieldSet"),
      );
      expect(result.supergraphSdl).not.toEqual(
        expect.stringContaining("union _Entity"),
      );
    });

    describe("@tag", () => {
      test("without definition", () => {
        const result = composeServices([
          {
            name: "users",
            typeDefs: parse(/* GraphQL */ `
              type User @key(fields: "id") {
                id: ID!
                name: String! @tag(name: "private")
                blocked: Boolean!
              }

              type Query {
                users: [User]!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: USERS, key: "id") {
            id: ID!
            name: String! @tag(name: "private")
            blocked: Boolean!
          }
        `);

        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          type User {
            id: ID!
            name: String!
            blocked: Boolean!
          }
        `);

        expect(result.supergraphSdl).toContainGraphQL(tagDirective);
        expect(result.publicSdl).not.toMatch("@tag");

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
            @link(url: "https://specs.apollo.dev/tag/v0.3") {
            query: Query
          }
        `);
      });

      test("with definition", () => {
        const result = composeServices([
          {
            name: "users",
            typeDefs: parse(/* GraphQL */ `
              directive @tag(name: String!) repeatable on FIELD_DEFINITION

              type User @key(fields: "id") {
                id: ID!
                name: String! @tag(name: "private")
                blocked: Boolean!
              }

              type Query {
                users: [User]!
              }
            `),
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          type User @join__type(graph: USERS, key: "id") {
            id: ID!
            name: String! @tag(name: "private")
            blocked: Boolean!
          }
        `);

        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          type User {
            id: ID!
            name: String!
            blocked: Boolean!
          }
        `);

        // The original definition should be ignored
        expect(result.supergraphSdl).toContainGraphQL(tagDirective);

        expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
          schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
            @link(url: "https://specs.apollo.dev/tag/v0.3") {
            query: Query
          }
        `);
      });
    });
  });

  test("external on an unused field in an extension type", () => {
    let result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type User @extends @key(fields: "id") {
            a: String
            id: ID! @external
            uuid: ID! @external
          }

          type Query {
            a: String
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          type User @extends @key(fields: "id") {
            b: String @requires(fields: "uuid")
            id: ID! @external
            uuid: ID! @external
          }

          type Query {
            b: String
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") {
            c: String
            id: ID!
            uuid: ID!
          }

          type Query {
            c: User
          }
        `),
      },
      {
        name: "extra",
        typeDefs: parse(/* GraphQL */ `
          type Query {
            extra: String
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(extension: true, graph: A, key: "id")
        @join__type(extension: true, graph: B, key: "id")
        @join__type(graph: C, key: "id") {
        a: String @join__field(graph: A)
        b: String @join__field(graph: B, requires: "uuid")
        c: String @join__field(graph: C)
        uuid: ID! @join__field(external: true, graph: B) @join__field(graph: C)
        id: ID!
      }
    `);

    result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type User @extends @key(fields: "id") {
            a: String
            id: ID! @external
            uuid: ID! @external
          }

          type Query {
            a: String
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          type User @extends @key(fields: "id") {
            b: String @requires(fields: "uuid")
            id: ID! @external
            uuid: ID! @external
          }

          type Query {
            b: String
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") {
            c: String
            id: ID!
            uuid: ID!
          }

          type Query {
            c: User
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(extension: true, graph: A, key: "id")
        @join__type(extension: true, graph: B, key: "id")
        @join__type(graph: C, key: "id") {
        a: String @join__field(graph: A)
        b: String @join__field(graph: B, requires: "uuid")
        c: String @join__field(graph: C)
        uuid: ID! @join__field(external: true, graph: B) @join__field(graph: C)
        id: ID!
      }
    `);
  });

  test("Fed v1: external on a provided field in an extension type", () => {
    let result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") @key(fields: "uuid") {
            id: ID!
            uuid: String!
            name: String!
          }

          type Query {
            a: User
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend type User @key(fields: "uuid") {
            uuid: String! @external
          }

          type B {
            id: ID!
            user: User!
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") @key(fields: "uuid") {
            id: ID!
            uuid: String!
            commentCount: Int!
          }
        `),
      },
      {
        name: "d",
        typeDefs: parse(/* GraphQL */ `
          extend type User @key(fields: "uuid") {
            uuid: String! @external
            id: ID! @external
          }

          type D {
            id: ID!
            user: User! @provides(fields: "id")
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: A, key: "uuid")
        @join__type(graph: B, key: "uuid")
        @join__type(graph: C, key: "id")
        @join__type(graph: C, key: "uuid")
        @join__type(graph: D, key: "uuid") {
        id: ID!
          @join__field(external: true, graph: D)
          @join__field(graph: A)
          @join__field(graph: C)
        uuid: String!
        name: String! @join__field(graph: A)
        commentCount: Int! @join__field(graph: C)
      }
    `);

    result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") @key(fields: "uuid") {
            id: ID!
            uuid: String!
            name: String!
          }

          type Query {
            a: User
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend type User @key(fields: "uuid") {
            uuid: String! @external
          }

          type B {
            id: ID!
            user: User!
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") @key(fields: "uuid") {
            id: ID!
            uuid: String!
            commentCount: Int!
          }
        `),
      },
      {
        name: "d",
        typeDefs: parse(/* GraphQL */ `
          extend type User @key(fields: "uuid") {
            uuid: String! @external
            id: ID! @external
          }

          type D {
            id: ID!
            user: User! @provides(fields: "id")
          }
        `),
      },
      {
        name: "extra",
        typeDefs: parse(/* GraphQL */ `
          type Query {
            extra: String!
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: A, key: "uuid")
        @join__type(graph: B, key: "uuid")
        @join__type(graph: C, key: "id")
        @join__type(graph: C, key: "uuid")
        @join__type(graph: D, key: "uuid") {
        id: ID!
          @join__field(external: true, graph: D)
          @join__field(graph: A)
          @join__field(graph: C)
        uuid: String!
        name: String! @join__field(graph: A)
        commentCount: Int! @join__field(graph: C)
      }
    `);
  });

  test("unused external on key-field of an entity type", () => {
    let result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type Site @key(fields: "header") @key(fields: "footer") {
            header: String @external
            footer: String @external
            headerTitle: String
            footerTitle: String
          }

          type Query {
            a: String
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          type Site @key(fields: "id") {
            id: ID!
            header: String
            footer: String
            title: String
          }

          type Query {
            site: Site
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          type Site @key(fields: "id") {
            id: ID!
            tag: String
          }

          type Query {
            c: Site
          }
        `),
      },
      {
        name: "extra",
        typeDefs: parse(/* GraphQL */ `
          type Query {
            extra: String
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Site
        @join__type(graph: A, key: "header")
        @join__type(graph: A, key: "footer")
        @join__type(graph: B, key: "id")
        @join__type(graph: C, key: "id") {
        header: String
          @join__field(external: true, graph: A)
          @join__field(graph: B)
        headerTitle: String @join__field(graph: A)
        id: ID! @join__field(graph: B) @join__field(graph: C)
        footer: String
          @join__field(external: true, graph: A)
          @join__field(graph: B)
        footerTitle: String @join__field(graph: A)
        title: String @join__field(graph: B)
        tag: String @join__field(graph: C)
      }
    `);

    result = result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type Site @key(fields: "header") @key(fields: "footer") {
            header: String @external
            footer: String @external
            headerTitle: String
            footerTitle: String
          }

          type Query {
            a: String
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          type Site @key(fields: "id") {
            id: ID!
            header: String
            footer: String
            title: String
          }

          type Query {
            site: Site
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          type Site @key(fields: "id") {
            id: ID!
            tag: String
          }

          type Query {
            c: Site
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Site
        @join__type(graph: A, key: "header")
        @join__type(graph: A, key: "footer")
        @join__type(graph: B, key: "id")
        @join__type(graph: C, key: "id") {
        header: String
          @join__field(external: true, graph: A)
          @join__field(graph: B)
        headerTitle: String @join__field(graph: A)
        id: ID! @join__field(graph: B) @join__field(graph: C)
        footer: String
          @join__field(external: true, graph: A)
          @join__field(graph: B)
        footerTitle: String @join__field(graph: A)
        title: String @join__field(graph: B)
        tag: String @join__field(graph: C)
      }
    `);
  });

  test("external on non-key field of an entity type", () => {
    let result = api.composeServices([
      {
        name: "foo",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@external", "@provides", "@shareable"]
            )

          type Note @key(fields: "id") @shareable {
            id: ID!
            name: String @external
            author: User @external
          }

          type User @key(fields: "id", resolvable: false) {
            id: ID!
          }

          type PrivateNote @key(fields: "id") @shareable {
            id: ID!
            note: Note @provides(fields: "name author { id }")
          }

          type Query {
            note: Note @shareable
            privateNote: PrivateNote @shareable
          }
        `),
      },
      {
        name: "bar",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable"]
            )

          type Note @key(fields: "id") @shareable {
            id: ID!
            name: String
            author: User
          }

          type User @key(fields: "id") {
            id: ID!
            name: String
          }

          type PrivateNote @key(fields: "id") @shareable {
            id: ID!
            note: Note
          }

          type Query {
            note: Note @shareable
            privateNote: PrivateNote @shareable
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Note
        @join__type(graph: FOO, key: "id")
        @join__type(graph: BAR, key: "id") {
        id: ID!
        name: String
          @join__field(external: true, graph: FOO)
          @join__field(graph: BAR)
        author: User
          @join__field(external: true, graph: FOO)
          @join__field(graph: BAR)
      }
    `);

    result = api.composeServices([
      {
        name: "foo",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@external", "@provides", "@shareable"]
            )

          type Note @key(fields: "id") @shareable {
            id: ID!
            name: String @external
            author: User @external
          }

          type User @key(fields: "id", resolvable: false) {
            id: ID!
          }

          type PrivateNote @key(fields: "id") @shareable {
            id: ID!
            note: Note @provides(fields: "name author { id }")
          }

          type Query {
            note: Note @shareable
            privateNote: PrivateNote @shareable
          }
        `),
      },
      {
        name: "bar",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable"]
            )

          type Note @key(fields: "id") @shareable {
            id: ID!
            name: String
            author: User
          }

          type User @key(fields: "id") {
            id: ID!
            name: String
          }

          type PrivateNote @key(fields: "id") @shareable {
            id: ID!
            note: Note
          }

          type Query {
            note: Note @shareable
            privateNote: PrivateNote @shareable
          }
        `),
      },
      {
        name: "baz",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@external", "@provides", "@shareable"]
            )

          type Query {
            hello: String
          }

          type Note @key(fields: "id") @shareable {
            id: ID!
            tag: String
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Note
        @join__type(graph: FOO, key: "id")
        @join__type(graph: BAR, key: "id")
        @join__type(graph: BAZ, key: "id") {
        id: ID!
        name: String
          @join__field(external: true, graph: FOO)
          @join__field(graph: BAR)
        author: User
          @join__field(external: true, graph: FOO)
          @join__field(graph: BAR)
        tag: String @join__field(graph: BAZ)
      }
    `);
  });

  test("print join__field external the field is required in a deeply nested selection set", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type Query {
            a: String
          }

          type User {
            id: ID!
            age: Int!
            name: String!
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          type Query {
            b: String
          }

          type Book {
            author: User @requires(fields: "author { name }")
          }

          extend type User {
            name: String! @external
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String!
          @join__field(external: true, graph: B)
          @join__field(graph: A)
        id: ID! @join__field(graph: A)
        age: Int! @join__field(graph: A)
      }
    `);
  });

  test("Query field with @override that points to non-existing subgraph", () => {
    let result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@override"]
            )

          type Query {
            a: String @override(from: "non-existing")
          }
        `),
      },
    ]);
    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Query @join__type(graph: A) {
        a: String
      }
    `);

    result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@override"]
            )

          type Query {
            a: String @override(from: "non-existing")
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@override"]
            )

          type Query {
            b: String
          }
        `),
      },
    ]);
    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type Query @join__type(graph: A) @join__type(graph: B) {
        a: String @join__field(graph: A, override: "non-existing")
        b: String @join__field(graph: B)
      }
    `);
  });

  test("drop unused external fields from Federation v1 subgraphs", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") {
            id: ID!
            name: String @external
            age: Int!
          }

          type Query {
            a: String
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          type User @key(fields: "id") {
            id: ID!
            age: Int! @external
            birthday: String @requires(fields: "age")
          }

          type Query {
            b: String
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    // No User.name, it's dropped
    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id") {
        id: ID!
        age: Int! @join__field(external: true, graph: B) @join__field(graph: A)
        birthday: String @join__field(graph: B, requires: "age")
      }
    `);
  });

  test("join__field(usedOverridden: true) on a field that is a key field but not external", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@override"]
            )

          type User @key(fields: "userId") {
            userId: ID! @override(from: "b")
            age: Int! @override(from: "b")
          }

          type Query {
            a: String
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@override"]
            )

          type User @key(fields: "userId") {
            userId: ID!
            age: Int!
          }

          type Query {
            b: String
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "userId")
        @join__type(graph: B, key: "userId") {
        age: Int! @join__field(graph: A, override: "b")
        userId: ID!
          @join__field(graph: A, override: "b")
          @join__field(graph: B, usedOverridden: true)
      }
    `);
  });

  test("deduplicates directives", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable", "@composeDirective"]
            )
            @link(
              url: "https://myspecs.dev/lowercase/v1.0"
              import: ["@lowercase"]
            )
            @composeDirective(name: "@lowercase")

          directive @lowercase on FIELD_DEFINITION | ENUM

          type User @key(fields: "id") {
            id: ID! @lowercase
            age: Int!
            type: UserType! @shareable
          }

          enum UserType @lowercase {
            REGULAR
            ADMIN
          }

          type Query {
            a: String
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: [
                "@key"
                "@external"
                "@requires"
                "@shareable"
                "@composeDirective"
              ]
            )
            @link(
              url: "https://myspecs.dev/lowercase/v1.0"
              import: ["@lowercase"]
            )
            @composeDirective(name: "@lowercase")

          directive @lowercase on FIELD_DEFINITION | ENUM

          type User @key(fields: "id") {
            id: ID! @lowercase
            age: Int! @external
            birthday: String @requires(fields: "age")
            type: UserType! @lowercase @shareable
          }

          enum UserType @lowercase {
            REGULAR
            ADMIN
          }

          type Query {
            b: String
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);

    // No User.name, it's dropped
    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id") {
        id: ID! @lowercase
        age: Int! @join__field(external: true, graph: B) @join__field(graph: A)
        birthday: String @join__field(graph: B, requires: "age")
        type: UserType! @lowercase
      }
    `);

    expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
      enum UserType @join__type(graph: A) @join__type(graph: B) @lowercase {
        ADMIN @join__enumValue(graph: A) @join__enumValue(graph: B)
        REGULAR @join__enumValue(graph: A) @join__enumValue(graph: B)
      }
    `);
  });
});
