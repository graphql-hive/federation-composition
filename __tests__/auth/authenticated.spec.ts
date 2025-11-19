import { describe, expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  testImplementations,
} from "../shared/testkit.js";

testImplementations((api) => {
  describe("@authenticated", () => {
    test("forbidden on interface type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            interface Node @authenticated {
              id: ID!
            }

            type User implements Node @key(fields: "id") {
              id: ID!
            }

            type Query {
              node(id: ID!): Node
            }
          `,
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[a] Invalid use of @authenticated on interface "Node": @authenticated cannot be applied on interfaces, interface fields and interface objects`,
          extensions: expect.objectContaining({
            code: "AUTH_REQUIREMENTS_APPLIED_ON_INTERFACE",
          }),
        }),
      );
    });

    test("forbidden on interface field", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            interface Node {
              id: ID! @authenticated
            }

            type User implements Node @key(fields: "id") {
              id: ID!
            }

            type Query {
              node(id: ID!): Node
            }
          `,
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[a] Invalid use of @authenticated on field "Node.id": @authenticated cannot be applied on interfaces, interface fields and interface objects`,
          extensions: expect.objectContaining({
            code: "AUTH_REQUIREMENTS_APPLIED_ON_INTERFACE",
          }),
        }),
      );
    });

    test("forbidden on interfaceObject", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key", "@interfaceObject"]
              )

            type User @key(fields: "id") @interfaceObject @authenticated {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            interface User @key(fields: "id") {
              id: ID!
            }

            type Authenticated implements User @key(fields: "id") {
              id: ID!
            }

            type Query {
              User(id: ID!): User
            }
          `,
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            '[a] Invalid use of @authenticated on interface object "User": @authenticated cannot be applied on interfaces, interface fields and interface objects',
          extensions: expect.objectContaining({
            code: "AUTH_REQUIREMENTS_APPLIED_ON_INTERFACE",
          }),
        }),
      );
    });

    test("allowed on interfaceObject field", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: [
                  "@authenticated"
                  "@key"
                  "@interfaceObject"
                  "@shareable"
                ]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID!
              name: String @authenticated @shareable # REF_AUTH_INTERFACE_OBJECT_SHAREABLE
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key", "@shareable"]
              )

            interface User @key(fields: "id") {
              id: ID!
            }

            type Authenticated implements User @key(fields: "id") {
              id: ID!
            }

            type Temorary implements User @key(fields: "id") {
              id: ID!
              name: String @authenticated @shareable
            }

            type Query {
              user(id: ID!): User
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface User
          @join__type(graph: A, key: "id", isInterfaceObject: true)
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String @join__field(graph: A) @authenticated
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Authenticated implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String @authenticated @join__field
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Temorary implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String @authenticated
        }
      `);
    });

    test("allowed on interfaceObject field that belongs to interface", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key", "@interfaceObject"]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID! @authenticated
              name: String
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            interface User @key(fields: "id") {
              id: ID!
            }

            type Authenticated implements User @key(fields: "id") {
              id: ID!
            }

            type Query {
              user(id: ID!): User
            }
          `,
        },
        {
          name: "c",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key", "@interfaceObject"]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID! @authenticated
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Authenticated implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID! @authenticated
          name: String @join__field
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface User
          @join__type(graph: A, isInterfaceObject: true, key: "id")
          @join__type(graph: B, key: "id")
          @join__type(graph: C, isInterfaceObject: true, key: "id") {
          id: ID! @authenticated
          name: String @join__field(graph: A)
        }
      `);
    });

    test("forbidden on input object type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            input UserInput @authenticated {
              id: ID!
            }

            type Query {
              user(input: UserInput): String
            }
          `,
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            '[a] Directive "@authenticated" may not be used on INPUT_OBJECT.',
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      );
    });

    test("forbidden on union type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            union Result @authenticated = User | Error

            type User @key(fields: "id") {
              id: ID!
            }

            type Error {
              message: String
            }

            type Query {
              result: Result
            }
          `,
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[a] Directive "@authenticated" may not be used on UNION.',
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      );
    });

    test("allowed on scalar", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated"]
              )

            scalar JSON @authenticated

            type Query {
              json: JSON
            }
          `,
        },
      ]);
      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        scalar JSON @join__type(graph: A) @authenticated
      `);
    });

    test("allowed on enum", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated"]
              )

            enum Role @authenticated {
              ADMIN
            }

            type Query {
              role: Role
            }
          `,
        },
      ]);
      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        enum Role @join__type(graph: A) @authenticated {
          ADMIN @join__enumValue(graph: A)
        }
      `);
    });

    test("passed from object types implementing the interface to interface type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            interface Node {
              id: ID!
            }

            type User implements Node @key(fields: "id") @authenticated {
              id: ID!
            }

            type Post implements Node @key(fields: "id") @authenticated {
              id: ID!
            }

            type Query {
              node: Node
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface Node @join__type(graph: A) @authenticated {
          id: ID!
        }
      `);
    });

    test("passed from object fields implementing the interface to interface field", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            interface Node {
              id: ID!
              name: String
            }

            type User implements Node @key(fields: "id") @authenticated {
              id: ID!
              name: String @authenticated
            }

            type Post implements Node @key(fields: "id") {
              id: ID!
              name: String @authenticated
            }

            type Query {
              node: Node
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface Node @join__type(graph: A) @authenticated {
          id: ID!
          name: String @authenticated
        }
      `);
    });

    test("many object type instances of the same name across subgraphs", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type User @key(fields: "id") @authenticated {
              id: ID!
            }

            type Query {
              user: User
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type User @key(fields: "id") @authenticated {
              id: ID!
              name: String
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id")
          @authenticated {
          id: ID!
          name: String @join__field(graph: B)
        }
      `);
    });

    test("many object fields instances of the same name across subgraphs", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key", "@shareable"]
              )

            type User @key(fields: "id") {
              id: ID!
              name: String @authenticated @shareable
            }

            type Query {
              user: User
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key", "@shareable"]
              )

            type User @key(fields: "id") {
              id: ID!
              name: String @authenticated @shareable
              age: Int
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id") {
          id: ID!
          age: Int @join__field(graph: B)
          name: String @authenticated
        }
      `);
    });

    test("deduplicated and dropped redundant scopes", () => {
      const result = api.composeServices([
        {
          name: "accounts",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type User @key(fields: "id") @authenticated {
              id: ID!
            }

            type Query {
              user: User
            }
          `,
        },
        {
          name: "billing",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type User @key(fields: "id") @authenticated {
              id: ID!
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type User
          @join__type(graph: ACCOUNTS, key: "id")
          @join__type(graph: BILLING, key: "id")
          @authenticated {
          id: ID!
        }
      `);
    });

    test("@requires missing access to referenced interface field", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@key", "@external", "@requires"]
              )

            type Query {
              user: User
            }

            type User @key(fields: "id") {
              id: ID
              comment: Node @external
              hasComment: Boolean @requires(fields: "comment { id }")
            }

            interface Node {
              id: ID!
            }

            type Comment implements Node @external {
              id: ID!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type User @key(fields: "id") {
              id: ID!
              comment: Node
            }

            interface Node {
              id: ID!
            }

            type Comment implements Node {
              id: ID! @authenticated
            }
          `,
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[a] Field "User.hasComment" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive field "Node.id" data from @requires selection set.`,
          extensions: expect.objectContaining({
            code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
          }),
        }),
      );
    });

    test("@requires has access to referenced interface field", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@key", "@external", "@requires", "@authenticated"]
              )

            type Query {
              user: User
            }

            type User @key(fields: "id") {
              id: ID
              comment: Node @external
              hasComment: Boolean
                @requires(fields: "comment { id }")
                @authenticated
            }

            interface Node {
              id: ID!
            }

            type Comment implements Node @external {
              id: ID!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type User @key(fields: "id") {
              id: ID!
              comment: Node
            }

            interface Node {
              id: ID!
            }

            type Comment implements Node {
              id: ID! @authenticated
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Comment implements Node
          @join__implements(graph: A, interface: "Node")
          @join__implements(graph: B, interface: "Node")
          @join__type(graph: A)
          @join__type(graph: B) {
          id: ID!
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @authenticated
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface Node @join__type(graph: A) @join__type(graph: B) {
          id: ID! @authenticated
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id") {
          id: ID
            @join__field(graph: A, type: "ID")
            @join__field(graph: B, type: "ID!")
          comment: Node
            @join__field(graph: A, external: true)
            @join__field(graph: B)
          hasComment: Boolean
            @join__field(graph: A, requires: "comment { id }")
            @authenticated
        }
      `);
    });

    test("@requires missing access to referenced interface type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@key", "@external", "@requires"]
              )

            type Query {
              account: Account
            }

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail @external
              detailsSummary: String
                @requires(
                  fields: "details { ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote } ... on AdminAccountDetail { adminLevel } }"
                )
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail @external {
              summary: String
              sensitiveLevel: Int
            }

            type PublicAccountDetail implements AccountDetail @external {
              summary: String
              publicNote: String
            }

            type AdminAccountDetail implements AccountDetail @external {
              summary: String
              adminLevel: Int
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail @authenticated {
              summary: String
              sensitiveLevel: Int
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String
            }

            type AdminAccountDetail implements AccountDetail @authenticated {
              summary: String
              adminLevel: Int
            }
          `,
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `[a] Field "Account.detailsSummary" does not specify necessary @authenticated, @requiresScopes and/or @policy auth requirements to access the transitive field "Account.details" data from @requires selection set.`,
          extensions: expect.objectContaining({
            code: "MISSING_TRANSITIVE_AUTH_REQUIREMENTS",
          }),
        }),
      );
    });

    test("@requires has access to referenced interface type (auth on type)", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@key", "@external", "@requires", "@authenticated"]
              )

            type Query {
              account: Account
            }

            type Account @key(fields: "id") @authenticated {
              id: ID
              details: AccountDetail @external
              detailsSummary: String
                @requires(
                  fields: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote } ... on AdminAccountDetail { adminLevel } }"
                )
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail @external {
              summary: String
              sensitiveLevel: Int
            }

            type PublicAccountDetail implements AccountDetail @external {
              summary: String
              publicNote: String
            }

            type AdminAccountDetail implements AccountDetail @external {
              summary: String
              adminLevel: Int
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail @authenticated
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail {
              summary: String @authenticated
              sensitiveLevel: Int @authenticated
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String @authenticated
            }

            type AdminAccountDetail implements AccountDetail {
              summary: String @authenticated
              adminLevel: Int @authenticated
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);
    });

    test("@requires has access to referenced interface type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@key", "@external", "@requires", "@authenticated"]
              )

            type Query {
              account: Account
            }

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail @external
              detailsSummary: String
                @requires(
                  fields: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote } ... on AdminAccountDetail { adminLevel } }"
                )
                @authenticated
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail @external {
              summary: String
              sensitiveLevel: Int
            }

            type PublicAccountDetail implements AccountDetail @external {
              summary: String
              publicNote: String
            }

            type AdminAccountDetail implements AccountDetail @external {
              summary: String
              adminLevel: Int
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@authenticated", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail @authenticated
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail {
              summary: String @authenticated
              sensitiveLevel: Int @authenticated
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String @authenticated
            }

            type AdminAccountDetail implements AccountDetail {
              summary: String @authenticated
              adminLevel: Int @authenticated
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Account
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id") {
          id: ID
          details: AccountDetail
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @authenticated
          detailsSummary: String
            @join__field(
              graph: A
              requires: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote } ... on AdminAccountDetail { adminLevel } }"
            )
            @authenticated
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface AccountDetail @join__type(graph: A) @join__type(graph: B) {
          summary: String @authenticated
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type PublicAccountDetail implements AccountDetail
          @join__implements(graph: A, interface: "AccountDetail")
          @join__implements(graph: B, interface: "AccountDetail")
          @join__type(graph: A)
          @join__type(graph: B) {
          summary: String
            @join__field(graph: A, external: true)
            @join__field(graph: B)
          publicNote: String
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @authenticated
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type ScopedAccountDetail implements AccountDetail
          @join__implements(graph: A, interface: "AccountDetail")
          @join__implements(graph: B, interface: "AccountDetail")
          @join__type(graph: A)
          @join__type(graph: B) {
          summary: String
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @authenticated
          sensitiveLevel: Int
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @authenticated
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type AdminAccountDetail implements AccountDetail
          @join__implements(graph: A, interface: "AccountDetail")
          @join__implements(graph: B, interface: "AccountDetail")
          @join__type(graph: A)
          @join__type(graph: B) {
          summary: String
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @authenticated
          adminLevel: Int
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @authenticated
        }
      `);
    });
  });
});
