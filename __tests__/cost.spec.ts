import { parse, print } from "graphql";
import { describe, expect, test } from "vitest";
import { sortSDL } from "../src/graphql/sort-sdl.js";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  satisfiesVersionRange,
  testVersions,
} from "./shared/testkit.js";

expect.addSnapshotSerializer({
  serialize: (value) => print(sortSDL(parse(value as string))),
  test: (value) =>
    typeof value === "string" && value.includes("specs.apollo.dev"),
});

testVersions((api, version) => {
  const composeServices = api.composeServices;

  if (satisfiesVersionRange("< v2.9", version)) {
    test("@cost and @listSize is not available in this version", () => {});
    return;
  }

  describe("@cost", () => {
    test("@cost in the supergraph", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            enum UserType @cost(weight: 15) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @cost(weight: 20)
            }

            type User @cost(weight: 25) @key(fields: "id") {
              id: ID!
            }

            extend type User {
              name: String
            }

            type Query {
              userCount: Int @cost(weight: 5) @shareable
              user(id: ID! @cost(weight: 10)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.5", for: EXECUTION)
          @link(url: "https://specs.apollo.dev/cost/v0.1") {
          query: Query
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @cost(
          weight: Int!
        ) on ARGUMENT_DEFINITION | ENUM | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | OBJECT | SCALAR
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: FOO) @cost(weight: 15) {
          ADMIN @join__enumValue(graph: FOO)
          REGULAR @join__enumValue(graph: FOO)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UsersFilterInput @join__type(graph: FOO) {
          limit: Int @cost(weight: 20)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User @join__type(graph: FOO, key: "id") @cost(weight: 25) {
          id: ID!
          name: String
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) {
          userCount: Int @cost(weight: 5)
          user(id: ID! @cost(weight: 10)): User
          userType(id: ID!): UserType
          users(filter: UsersFilterInput): [User]
        }
      `);
    });

    test("@cost == 0", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@cost", "@key", "@shareable"]
              )

            enum UserType @cost(weight: 0) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @cost(weight: 0)
            }

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              userCount: Int @cost(weight: 0) @shareable
              user(id: ID! @cost(weight: 0)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: FOO) @cost(weight: 0) {
          ADMIN @join__enumValue(graph: FOO)
          REGULAR @join__enumValue(graph: FOO)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType {
          ADMIN
          REGULAR
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UsersFilterInput @join__type(graph: FOO) {
          limit: Int @cost(weight: 0)
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        input UsersFilterInput {
          limit: Int
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) {
          userCount: Int @cost(weight: 0)
          user(id: ID! @cost(weight: 0)): User
          userType(id: ID!): UserType
          users(filter: UsersFilterInput): [User]
        }
      `);

      expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
        type Query {
          userCount: Int
          user(id: ID!): User
          userType(id: ID!): UserType
          users(filter: UsersFilterInput): [User]
        }
      `);
    });

    test("@cost < 0", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@cost", "@key", "@shareable"]
              )

            enum UserType @cost(weight: -1) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @cost(weight: -1)
            }

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              userCount: Int @cost(weight: -1) @shareable
              user(id: ID! @cost(weight: -1)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: FOO) @cost(weight: -1) {
          ADMIN @join__enumValue(graph: FOO)
          REGULAR @join__enumValue(graph: FOO)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UsersFilterInput @join__type(graph: FOO) {
          limit: Int @cost(weight: -1)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) {
          userCount: Int @cost(weight: -1)
          user(id: ID! @cost(weight: -1)): User
          userType(id: ID!): UserType
          users(filter: UsersFilterInput): [User]
        }
      `);
    });

    test("@cost on shareables be Math.max", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            enum UserType @cost(weight: 15) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @cost(weight: 20)
            }

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              userCount: Int @cost(weight: 5) @shareable
              user(id: ID! @cost(weight: 10)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            enum UserType @cost(weight: 30) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @cost(weight: 40)
            }

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              userCount: Int @cost(weight: 10) @shareable
              user(id: ID! @cost(weight: 20)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType
          @join__type(graph: FOO)
          @join__type(graph: BAR)
          @cost(weight: 30) {
          ADMIN @join__enumValue(graph: FOO) @join__enumValue(graph: BAR)
          REGULAR @join__enumValue(graph: FOO) @join__enumValue(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UsersFilterInput @join__type(graph: FOO) @join__type(graph: BAR) {
          limit: Int @cost(weight: 40)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) @join__type(graph: BAR) {
          userCount: Int @cost(weight: 10)
          user(id: ID! @cost(weight: 20)): User
          userType(id: ID!): UserType
          users(filter: UsersFilterInput): [User]
        }
      `);
    });

    test("incosistent name for @cost", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            enum UserType @cost(weight: 15) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @cost(weight: 20)
            }

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              userCount: Int @cost(weight: 5) @shareable
              user(id: ID! @cost(weight: 15)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", { name: "@cost", as: "@price" }, "@shareable"]
              )

            enum UserType @price(weight: 30) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @price(weight: 40)
            }

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              userCount: Int @price(weight: 10) @shareable
              user(id: ID! @price(weight: 20)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `The "@cost" directive (from https://specs.apollo.dev/federation/${version}) is imported with mismatched name between subgraphs:` +
                ` it is imported as "@cost" in subgraph "foo" but "@price" in subgraph "bar"`
              : `The import name "@cost" is imported with mismatched name between subgraphs: it is imported as  "@price" in subgraph "bar" and  "@cost" in subgraph "foo"`,
          extensions: expect.objectContaining({
            code: "LINK_IMPORT_NAME_MISMATCH",
          }),
        }),
      );
    });

    test("aliased @cost", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", { name: "@cost", as: "@price" }, "@shareable"]
              )

            enum UserType @price(weight: 15) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @price(weight: 20)
            }

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              userCount: Int @price(weight: 5) @shareable
              user(id: ID! @price(weight: 10)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", { name: "@cost", as: "@price" }, "@shareable"]
              )

            enum UserType @price(weight: 30) {
              ADMIN
              REGULAR
            }

            input UsersFilterInput {
              limit: Int @price(weight: 40)
            }

            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              userCount: Int @price(weight: 10) @shareable
              user(id: ID! @price(weight: 20)): User @shareable
              userType(id: ID!): UserType @shareable
              users(filter: UsersFilterInput): [User] @shareable
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.5", for: EXECUTION)
          @link(
            url: "https://specs.apollo.dev/cost/v0.1"
            import: [{ name: "@cost", as: "@price" }]
          ) {
          query: Query
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @price(
          weight: Int!
        ) on ARGUMENT_DEFINITION | ENUM | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | OBJECT | SCALAR
      `);

      expect(result.publicSdl).not.toMatch("@price");
      expect(result.publicSdl).not.toMatch("@cost");

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType
          @join__type(graph: FOO)
          @join__type(graph: BAR)
          @price(weight: 30) {
          ADMIN @join__enumValue(graph: FOO) @join__enumValue(graph: BAR)
          REGULAR @join__enumValue(graph: FOO) @join__enumValue(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UsersFilterInput @join__type(graph: FOO) @join__type(graph: BAR) {
          limit: Int @price(weight: 40)
        }
      `);

      if (api.library === "guild") {
        expect(result.publicSdl).toContainGraphQL(/* GraphQL */ `
          input UsersFilterInput {
            limit: Int
          }
        `);
      }

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) @join__type(graph: BAR) {
          userCount: Int @price(weight: 10)
          user(id: ID! @price(weight: 20)): User
          userType(id: ID!): UserType
          users(filter: UsersFilterInput): [User]
        }
      `);
    });

    test("@cost on interface type is not allowed", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node @cost(weight: 5) {
              id: ID!
            }

            type User implements Node @cost(weight: 25) @key(fields: "id") {
              id: ID!
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[foo] Directive "@cost" may not be used on INTERFACE.`,
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      );
    });

    test("@cost on interfaceObject is not allowed", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node @key(fields: "id") {
              id: ID!
            }

            type User implements Node @cost(weight: 25) @key(fields: "id") {
              id: ID!
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@cost"])

            interface Node @key(fields: "id") @cost(weight: 5) {
              id: ID!
              name: String
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[bar] Directive "@cost" may not be used on INTERFACE.`,
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      );
    });

    test("@cost on interface field is not allowed", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node {
              id: ID! @cost(weight: 5)
              name(substring: Int @cost(weight: 10)): String
            }

            type User implements Node @cost(weight: 25) @key(fields: "id") {
              id: ID!
              name(substring: Int @cost(weight: 15)): String
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[foo] @cost cannot be applied to interface "Node.id"`,
          extensions: expect.objectContaining({
            code: "COST_APPLIED_TO_INTERFACE_FIELD",
          }),
        }),
      );
    });

    test("@cost on interface field argument is not allowed", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node {
              id: ID!
              name(substring: Int @cost(weight: 10)): String
            }

            type User implements Node @cost(weight: 25) @key(fields: "id") {
              id: ID!
              name(substring: Int @cost(weight: 15)): String
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
      ]);

      if (api.library === "apollo") {
        assertCompositionSuccess(result);
        return;
      }

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[foo] @cost cannot be applied to interface "Node.name" argument "substring"`,
          extensions: expect.objectContaining({
            code: "COST_APPLIED_TO_INTERFACE_FIELD",
          }),
        }),
      );
    });

    test("@cost on interface type is not allowed", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node @cost(weight: 5) {
              id: ID!
            }

            type User implements Node @cost(weight: 25) @key(fields: "id") {
              id: ID!
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[foo] Directive "@cost" may not be used on INTERFACE.`,
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      );
    });

    test("@cost on interfaceObject field", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node @key(fields: "id") {
              id: ID! @cost(weight: 5)
            }

            type User implements Node @cost(weight: 25) @key(fields: "id") {
              id: ID!
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@interfaceObject", "@cost"]
              )

            type Node @key(fields: "id") @interfaceObject {
              id: ID! @cost(weight: 10)
              name(substring: Int @cost(weight: 10)): String
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[foo] @cost cannot be applied to interface "Node.id"`,
          extensions: expect.objectContaining({
            code: "COST_APPLIED_TO_INTERFACE_FIELD",
          }),
        }),
      );
    });

    test("@cost on object type implementing interface", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node @key(fields: "id") {
              id: ID!
            }

            type User implements Node @key(fields: "id") @cost(weight: 5) {
              id: ID!
            }

            type Bot implements Node @key(fields: "id") @cost(weight: 10) {
              id: ID!
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost"]
              )

              type User @key(fields: "id") @cost(weight: 7) {
                id: ID!
              }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // Should use highest cost among field implementations
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User implements Node
          @join__implements(graph: FOO, interface: "Node")
          @join__type(graph: BAR, key: "id")
          @join__type(graph: FOO, key: "id")
          @cost(weight: 7) {
          id: ID!
        }
      `);

      // shouldn't propagate to interface
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node @join__type(graph: FOO, key: "id") {
          id: ID!
        }
      `);
    });

    test("@cost on object type fields implementing interface", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node @key(fields: "id") {
              id: ID!
            }

            type User implements Node @key(fields: "id") {
              id: ID! @cost(weight: 5)
            }

            type Bot implements Node @key(fields: "id") {
              id: ID! @cost(weight: 10)
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost"]
              )

              type User @key(fields: "id") {
                id: ID! @cost(weight: 7)
              }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // Should use highest cost among field implementations
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User implements Node
          @join__implements(graph: FOO, interface: "Node")
          @join__type(graph: BAR, key: "id")
          @join__type(graph: FOO, key: "id") {
          id: ID! @cost(weight: 7)
        }
      `);

      // shouldn't propagate to interface
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node @join__type(graph: FOO, key: "id") {
          id: ID!
        }
      `);
    });

    test("@cost on object type field arguments implementing interface", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

            interface Node @key(fields: "id") {
              id: ID!
              name(substring: Int): String
            }

            type User implements Node @key(fields: "id") {
              id: ID!
              name(substring: Int @cost(weight: 5)): String @shareable
            }

            type Bot implements Node @key(fields: "id") {
              id: ID!
              name(substring: Int @cost(weight: 10)): String
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@cost", "@shareable"]
              )

              type User @key(fields: "id") {
                id: ID!
                name(substring: Int @cost(weight: 7)): String @shareable
              }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      // Should use highest cost among field implementations
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User implements Node
          @join__implements(graph: FOO, interface: "Node")
          @join__type(graph: BAR, key: "id")
          @join__type(graph: FOO, key: "id") {
          id: ID!
          name(substring: Int @cost(weight: 7)): String
        }
      `);

      // shouldn't propagate to interface
      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node @join__type(graph: FOO, key: "id") {
          id: ID!
          name(substring: Int): String
        }
      `);
    });
  });

  describe("@listSize", () => {
    test("@listSize on interface field", () => {
      const result = composeServices([
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@listSize", "@shareable"]
              )

            interface Node {
              id: ID!
              nodes(limit: Int!): [Node] @listSize(slicingArguments: ["limit"], sizedFields: ["nodes"], assumedSize: 21)
            }

            type User implements Node @key(fields: "id") {
              id: ID!
              nodes(limit: Int!): [Node] @listSize(slicingArguments: ["limit"], sizedFields: ["nodes"], assumedSize: 11) @shareable
            }

            type Query {
              node(id: ID): Node  @shareable
            }
          `),
        },
        {
          name: "baz",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@listSize", "@shareable"]
              )

            interface Node {
              id: ID!
              nodes(limit: Int!): [Node] @listSize(slicingArguments: ["limit"], sizedFields: ["nodes"], assumedSize: 20)
            }

            type User implements Node @key(fields: "id") {
              id: ID!
              nodes(limit: Int!): [Node] @listSize(slicingArguments: ["limit"], sizedFields: ["nodes"], assumedSize: 10) @shareable
            }

            type Query {
              node(id: ID): Node @shareable
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node @join__type(graph: BAR) @join__type(graph: BAZ) {
          id: ID!
          nodes(limit: Int!): [Node]
            @listSize(
              assumedSize: 21
              requireOneSlicingArgument: true
              sizedFields: ["nodes"]
              slicingArguments: ["limit"]
            )
        }
      `);
    });

    test("in supergraph", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type User {
              id: ID!
              name: String
            }

            type UserConnection {
              edges: [User]
              count: Int!
            }

            type Query {
              users(first: Int): UserConnection
                @listSize(slicingArguments: ["first"], sizedFields: ["edges"])
              allUsers: [User] @listSize(assumedSize: 1, requireOneSlicingArgument: false)
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(for: EXECUTION, url: "https://specs.apollo.dev/join/v0.5")
          @link(
            url: "https://specs.apollo.dev/cost/v0.1"
            import: ["@listSize"]
          )
          @link(url: "https://specs.apollo.dev/link/v1.0") {
          query: Query
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @listSize(
          assumedSize: Int
          slicingArguments: [String!]
          sizedFields: [String!]
          requireOneSlicingArgument: Boolean = true
        ) on FIELD_DEFINITION
      `);

      expect(result.publicSdl).not.toMatch("@listSize");

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) {
          allUsers: [User]
            @listSize(assumedSize: 1, requireOneSlicingArgument: false)
          users(first: Int): UserConnection
            @listSize(sizedFields: ["edges"], slicingArguments: ["first"])
        }
      `);
    });

    test("aliased", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: [{ name: "@listSize", as: "@cartSize" }]
              )

            type User {
              id: ID!
              name: String
            }

            type UserConnection {
              edges: [User]
              count: Int!
            }

            type Query {
              users(first: Int): UserConnection
                @cartSize(slicingArguments: ["first"], sizedFields: ["edges"])
              allUsers: [User] @cartSize(assumedSize: 1, requireOneSlicingArgument: false)
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.publicSdl).not.toMatch("@listSize");
      expect(result.publicSdl).not.toMatch("@cartSize");

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        schema
          @link(for: EXECUTION, url: "https://specs.apollo.dev/join/v0.5")
          @link(
            url: "https://specs.apollo.dev/cost/v0.1"
            import: [{ name: "@listSize", as: "@cartSize" }]
          )
          @link(url: "https://specs.apollo.dev/link/v1.0") {
          query: Query
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        directive @cartSize(
          assumedSize: Int
          slicingArguments: [String!]
          sizedFields: [String!]
          requireOneSlicingArgument: Boolean = true
        ) on FIELD_DEFINITION
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) {
          allUsers: [User]
            @cartSize(assumedSize: 1, requireOneSlicingArgument: false)
          users(first: Int): UserConnection
            @cartSize(sizedFields: ["edges"], slicingArguments: ["first"])
        }
      `);
    });

    test("inconsistent name", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: [{ name: "@listSize", as: "@cartSize" }]
              )

            type User {
              id: ID!
              name: String
            }

            type UserConnection {
              edges: [User]
              count: Int!
            }

            type Query {
              users(first: Int): UserConnection
                @cartSize(slicingArguments: ["first"], sizedFields: ["edges"])
              allUsers: [User] @cartSize(assumedSize: 1, requireOneSlicingArgument: false)
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type Query {
              words: [String] @listSize(assumedSize: 5)
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `The "@listSize" directive (from https://specs.apollo.dev/federation/${version}) is imported with mismatched name between subgraphs: it is imported as "@cartSize" in subgraph "foo" but "@listSize" in subgraph "bar"`
              : `The import name "@listSize" is imported with mismatched name between subgraphs: it is imported as  "@listSize" in subgraph "bar" and  "@cartSize" in subgraph "foo"`,
          extensions: expect.objectContaining({
            code: "LINK_IMPORT_NAME_MISMATCH",
          }),
        }),
      );
    });

    test("mixing assumedSize and sizedFields", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(slicingArguments: ["first"], sizedFields: ["edges"], assumedSize: 1000)
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) {
          strings(first: Int): StringConnection
            @listSize(
              slicingArguments: ["first"]
              sizedFields: ["edges"]
              assumedSize: 1000
            )
        }
      `);
    });

    test("non-shared slicing argument", () => {
      const services = [
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize", "@shareable"])

            type StringConnection {
              edges: [String] @shareable
              count: Int! @shareable
            }

            type Query {
              strings(first: Int): StringConnection @shareable
                @listSize(slicingArguments: ["first"], sizedFields: ["edges"], assumedSize: 1000, requireOneSlicingArgument: true)
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize", "@shareable"])

            type StringConnection {
              edges: [String] @shareable
              count: Int! @shareable
            }

            type Query {
              strings(first: Int, limit: Int): StringConnection @shareable
                @listSize(slicingArguments: ["limit"], sizedFields: ["edges"], assumedSize: 2000, requireOneSlicingArgument: false)
            }
          `),
        },
      ];

      // Slicing argument "limit" is not available in all subgraphs
      if (api.library === "apollo") {
        // Apollo composition throws an exception
        expect(() => composeServices(services)).toThrow();
        return;
      }

      // Our composition allows it and strips out the non-shared slicing argument
      const result = composeServices(services);
      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: BAR) @join__type(graph: FOO) {
          strings(first: Int): StringConnection
            @listSize(
              slicingArguments: ["first"]
              sizedFields: ["edges"]
              assumedSize: 2000
              requireOneSlicingArgument: false
            )
        }
      `);
    });

    test("interface field", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            interface Node {
              id: ID!
            }

            interface NodeConnection {
              edges: [Node] @listSize(assumedSize: 2)
              count: Int!
            }

            type User implements Node {
              id: ID!
              name: String
            }

            type UserConnection implements NodeConnection {
              edges: [User] @listSize(assumedSize: 1)
              count: Int!
            }

            type Query {
              nodes(first: Int): NodeConnection
                @listSize(slicingArguments: ["first"], sizedFields: ["edges"])
              allNodes: [Node] @listSize(assumedSize: 1, requireOneSlicingArgument: false)
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface NodeConnection @join__type(graph: FOO) {
          count: Int!
          edges: [Node] @listSize(assumedSize: 2)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type UserConnection implements NodeConnection
          @join__implements(graph: FOO, interface: "NodeConnection")
          @join__type(graph: FOO) {
          edges: [User] @listSize(assumedSize: 1)
          count: Int!
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) {
          nodes(first: Int): NodeConnection
            @listSize(slicingArguments: ["first"], sizedFields: ["edges"])
          allNodes: [Node]
            @listSize(assumedSize: 1, requireOneSlicingArgument: false)
        }
      `);
    });

    test("interfaceObject field", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@listSize", "@shareable"]
              )

            interface Node @key(fields: "id") {
              id: ID!
            }

            type User implements Node @key(fields: "id") {
              id: ID!
            }

            type Query {
              node(id: ID): Node
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@interfaceObject", "@listSize"]
              )

            type Node @key(fields: "id") @interfaceObject {
              id: ID!
              accessList: [String] @listSize(assumedSize: 10)
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node
          @join__type(graph: BAR, key: "id", isInterfaceObject: true)
          @join__type(graph: FOO, key: "id") {
          id: ID!
          accessList: [String]
            @join__field(graph: BAR)
            @listSize(assumedSize: 10)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User implements Node
          @join__implements(graph: FOO, interface: "Node")
          @join__type(graph: FOO, key: "id") {
          id: ID!
          accessList: [String] @listSize(assumedSize: 10) @join__field
        }
      `);
    });

    test("negative assumedSize", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(assumedSize: -1, sizedFields: ["edges"])
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `[foo] Assumed size of "Query.strings" cannot be negative`
              : '[foo] "Query.strings" has negative @listSize(assumedSize:) value',
          extensions: expect.objectContaining({
            code: "LIST_SIZE_INVALID_ASSUMED_SIZE",
          }),
        }),
      );
    });

    test("zero assumedSize", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(assumedSize: 0, sizedFields: ["edges"])
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);
    });

    test("non-list field with the sizedFields argument", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(slicingArguments: ["first"], sizedFields: ["count"])
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `[foo] Sized field "StringConnection.count" is not a list`
              : `[foo] "Query.strings" references "count" field in @listSize(sizedFields:) argument that is not a list.`,
          extensions: expect.objectContaining({
            code: "LIST_SIZE_APPLIED_TO_NON_LIST",
          }),
        }),
      );
    });

    test("non-list field without the sizedFields argument", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: String): StringConnection @listSize(slicingArguments: ["first"])
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      if (api.library === "apollo") {
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: `[foo] "Query.strings" is not a list`,
            extensions: expect.objectContaining({
              code: "LIST_SIZE_APPLIED_TO_NON_LIST",
            }),
          }),
        );
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: `[foo] Slicing argument "Query.strings(first:)" must be Int or Int!`,
            extensions: expect.objectContaining({
              code: "LIST_SIZE_INVALID_SLICING_ARGUMENT",
            }),
          }),
        );
      } else {
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: `[foo] "Query.strings" is not a list. Try to add @listSize(sizedFields:) argument.`,
            extensions: expect.objectContaining({
              code: "LIST_SIZE_INVALID_SIZED_FIELD",
            }),
          }),
        );
      }
    });

    test("sizedFields on non-object output", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type Query {
              strings(first: Int): [String]
                @listSize(slicingArguments: ["first"], sizedFields: ["edges"])
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `[foo] Sized fields cannot be used because "[String]" is not a composite type`
              : `[foo] "Query.strings" has @listSize(sizedFields:) applied, but the output type is not a composite type`,
          extensions: expect.objectContaining({
            code: "LIST_SIZE_INVALID_SIZED_FIELD",
          }),
        }),
      );
    });

    test("sizedField should be a list", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: String!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(slicingArguments: ["first"], sizedFields: ["count"])
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `[foo] Sized field "StringConnection.count" is not a list`
              : `[foo] "Query.strings" references "count" field in @listSize(sizedFields:) argument that is not a list.`,
          extensions: expect.objectContaining({
            code: "LIST_SIZE_APPLIED_TO_NON_LIST",
          }),
        }),
      );
    });

    test("sizedField should reference existing field", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: String!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(slicingArguments: ["first"], sizedFields: ["discount"])
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `[foo] Sized field "discount" is not a field on type "StringConnection"`
              : `[foo] "Query.strings" references "discount" field in @listSize(sizedFields:) argument that does not exist.`,
          extensions: expect.objectContaining({
            code: "LIST_SIZE_INVALID_SIZED_FIELD",
          }),
        }),
      );
    });

    test("slicingArgument should be Int or Int!", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: String): StringConnection
                @listSize(slicingArguments: ["first"], sizedFields: ["edges"])
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `[foo] Slicing argument "Query.strings(first:)" must be Int or Int!`
              : `[foo] "Query.strings" references "first" argument in @listSize(slicingArguments:) that is not an integer.`,
          extensions: expect.objectContaining({
            code: "LIST_SIZE_INVALID_SLICING_ARGUMENT",
          }),
        }),
      );
    });

    test("slicingArgument should reference existing field", () => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(slicingArguments: ["last"], sizedFields: ["edges"])
            }
          `),
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? `[foo] Slicing argument "last" is not an argument of "Query.strings"`
              : `[foo] "Query.strings" references "last" argument in @listSize(slicingArguments:) that does not exist.`,
          extensions: expect.objectContaining({
            code: "LIST_SIZE_INVALID_SLICING_ARGUMENT",
          }),
        }),
      );
    });

    test.todo(
      "requireOneSlicingArgument when slicingArguments is empty",
      () => {
        const result = composeServices([
          {
            name: "foo",
            typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(
                  slicingArguments: []
                  sizedFields: ["edges"]
                  requireOneSlicingArgument: true
                )
            }
          `),
          },
        ]);

        assertCompositionFailure(result);
      },
    );

    test.todo(
      "requireOneSlicingArgument when slicingArguments is not defined",
      () => {
        const result = composeServices([
          {
            name: "foo",
            typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@listSize"])

            type StringConnection {
              edges: [String]
              count: Int!
            }

            type Query {
              strings(first: Int): StringConnection
                @listSize(sizedFields: ["edges"], requireOneSlicingArgument: true)
            }
          `),
          },
        ]);

        assertCompositionFailure(result);
      },
    );
  });
});
