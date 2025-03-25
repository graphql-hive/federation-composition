import { parse, print } from 'graphql';
import { describe, expect, test } from 'vitest';
import { sortSDL } from '../src/graphql/sort-sdl.js';
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  testImplementations,
} from './shared/testkit.js';

expect.addSnapshotSerializer({
  serialize: value => print(sortSDL(parse(value as string))),
  test: value => typeof value === 'string' && value.includes('specs.apollo.dev'),
});

// TODO: @listSize

testImplementations(api => {
  const composeServices = api.composeServices;

  describe('@cost', () => {
    test('@cost in the supergraph', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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

    test('@cost == 0', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UsersFilterInput @join__type(graph: FOO) {
          limit: Int @cost(weight: 0)
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
    });

    test('@cost < 0', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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

    test('@cost on shareables be Math.max', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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
          name: 'bar',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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
        enum UserType @join__type(graph: FOO) @join__type(graph: BAR) @cost(weight: 30) {
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

    test('incosistent name for @cost', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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
          name: 'bar',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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
            api.library === 'apollo'
              ? `The "@cost" directive (from https://specs.apollo.dev/federation/v2.9) is imported with mismatched name between subgraphs:` +
                ` it is imported as "@cost" in subgraph "foo" but "@price" in subgraph "bar"`
              : `The import name "@cost" is imported with mismatched name between subgraphs: it is imported as  "@price" in subgraph "bar" and  "@cost" in subgraph "foo"`,
          extensions: expect.objectContaining({
            code: 'LINK_IMPORT_NAME_MISMATCH',
          }),
        }),
      );
    });

    test('aliased @cost', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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
          name: 'bar',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        enum UserType @join__type(graph: FOO) @join__type(graph: BAR) @price(weight: 30) {
          ADMIN @join__enumValue(graph: FOO) @join__enumValue(graph: BAR)
          REGULAR @join__enumValue(graph: FOO) @join__enumValue(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        input UsersFilterInput @join__type(graph: FOO) @join__type(graph: BAR) {
          limit: Int @price(weight: 40)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) @join__type(graph: BAR) {
          userCount: Int @price(weight: 10)
          user(id: ID! @price(weight: 20)): User
          userType(id: ID!): UserType
          users(filter: UsersFilterInput): [User]
        }
      `);
    });

    test('@cost on interface type is not allowed', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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
            code: 'INVALID_GRAPHQL',
          }),
        }),
      );
    });

    test('@cost on interfaceObject is not allowed', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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
          name: 'bar',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/v2.9", import: ["@key", "@cost"])

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
            code: 'INVALID_GRAPHQL',
          }),
        }),
      );
    });

    test('@cost on interface field', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node @join__type(graph: FOO) {
          id: ID! @cost(weight: 5)
          name(substring: Int @cost(weight: 10)): String
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User implements Node
          @join__implements(graph: FOO, interface: "Node")
          @join__type(graph: FOO, key: "id")
          @cost(weight: 25) {
          id: ID!
          name(substring: Int @cost(weight: 15)): String
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: FOO) {
          node(id: ID): Node
        }
      `);
    });

    test('@cost on interfaceObject field', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
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
          name: 'bar',
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@key", "@interfaceObject", "@cost"]
              )

            type Node @key(fields: "id") @interfaceObject {
              id: ID! @cost(weight: 10)
              name(substring: Int @cost(weight: 10)): String
            }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        interface Node
          @join__type(graph: BAR, key: "id", isInterfaceObject: true)
          @join__type(graph: FOO, key: "id") {
          id: ID! @cost(weight: 10)
          name(substring: Int @cost(weight: 10)): String @join__field(graph: BAR)
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User implements Node
          @join__implements(graph: FOO, interface: "Node")
          @join__type(graph: FOO, key: "id")
          @cost(weight: 25) {
          id: ID!
          name(substring: Int @cost(weight: 10)): String @join__field
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type Query @join__type(graph: BAR) @join__type(graph: FOO) {
          node(id: ID): Node @join__field(graph: FOO)
        }
      `);
    });
  });
});
