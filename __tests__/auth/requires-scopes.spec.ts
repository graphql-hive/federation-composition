import { describe, expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  testImplementations,
} from "../shared/testkit.js";

testImplementations((api) => {
  describe("@requiresScopes", () => {
    test("forbidden on interface type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@requiresScopes", "@key"]
              )

            interface Node @requiresScopes(scopes: [["a"]]) {
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
          message: `[a] Invalid use of @requiresScopes on interface "Node": @requiresScopes cannot be applied on interfaces, interface fields and interface objects`,
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
                import: ["@requiresScopes", "@key"]
              )

            interface Node {
              id: ID! @requiresScopes(scopes: [["a"]])
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
          message: `[a] Invalid use of @requiresScopes on field "Node.id": @requiresScopes cannot be applied on interfaces, interface fields and interface objects`,
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
                import: ["@requiresScopes", "@key", "@interfaceObject"]
              )

            type User
              @key(fields: "id")
              @interfaceObject
              @requiresScopes(scopes: [["a"]]) {
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
                import: ["@requiresScopes", "@key"]
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
            '[a] Invalid use of @requiresScopes on interface object "User": @requiresScopes cannot be applied on interfaces, interface fields and interface objects',
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
                  "@requiresScopes"
                  "@key"
                  "@interfaceObject"
                  "@shareable"
                ]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID!
              name: String @requiresScopes(scopes: [["a"]]) @shareable # REF_AUTH_INTERFACE_OBJECT_SHAREABLE
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@requiresScopes", "@key", "@shareable"]
              )

            interface User @key(fields: "id") {
              id: ID!
            }

            type Authenticated implements User @key(fields: "id") {
              id: ID!
            }

            type Temorary implements User @key(fields: "id") {
              id: ID!
              name: String @requiresScopes(scopes: [["c"]]) @shareable
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
          name: String
            @join__field(graph: A)
            @requiresScopes(scopes: [["a", "c"]])
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Authenticated implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String @requiresScopes(scopes: [["a"]]) @join__field
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Temorary implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String @requiresScopes(scopes: [["a", "c"]])
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
                import: ["@requiresScopes", "@key", "@interfaceObject"]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID! @requiresScopes(scopes: [["a"]])
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
                import: ["@requiresScopes", "@key"]
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
                import: ["@requiresScopes", "@key", "@interfaceObject"]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID! @requiresScopes(scopes: [["c"]])
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Authenticated implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID! @requiresScopes(scopes: [["a", "c"]])
          name: String @join__field
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface User
          @join__type(graph: A, isInterfaceObject: true, key: "id")
          @join__type(graph: B, key: "id")
          @join__type(graph: C, isInterfaceObject: true, key: "id") {
          id: ID! @requiresScopes(scopes: [["a", "c"]])
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
                import: ["@requiresScopes", "@key"]
              )

            input UserInput @requiresScopes(scopes: [["a"]]) {
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
            '[a] Directive "@requiresScopes" may not be used on INPUT_OBJECT.',
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
                import: ["@requiresScopes", "@key"]
              )

            union Result @requiresScopes(scopes: [["a"]]) = User | Error

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
          message: '[a] Directive "@requiresScopes" may not be used on UNION.',
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
                import: ["@requiresScopes"]
              )

            scalar JSON @requiresScopes(scopes: [["a"]])

            type Query {
              json: JSON
            }
          `,
        },
      ]);
      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        scalar JSON @join__type(graph: A) @requiresScopes(scopes: [["a"]])
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
                import: ["@requiresScopes"]
              )

            enum Role @requiresScopes(scopes: [["a"]]) {
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
        enum Role @join__type(graph: A) @requiresScopes(scopes: [["a"]]) {
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
                import: ["@requiresScopes", "@key"]
              )

            interface Node {
              id: ID!
            }

            type User implements Node
              @key(fields: "id")
              @requiresScopes(scopes: [["a"]]) {
              id: ID!
            }

            type Post implements Node
              @key(fields: "id")
              @requiresScopes(scopes: [["b"]]) {
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
        interface Node
          @join__type(graph: A)
          @requiresScopes(scopes: [["a", "b"]]) {
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
                import: ["@requiresScopes", "@key"]
              )

            interface Node {
              id: ID!
              name: String
            }

            type User implements Node
              @key(fields: "id")
              @requiresScopes(scopes: [["a"]]) {
              id: ID!
              name: String @requiresScopes(scopes: [["a"]])
            }

            type Post implements Node @key(fields: "id") {
              id: ID!
              name: String @requiresScopes(scopes: [["b"]])
            }

            type Query {
              node: Node
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface Node @join__type(graph: A) @requiresScopes(scopes: [["a"]]) {
          id: ID!
          name: String @requiresScopes(scopes: [["a", "b"]])
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
                import: ["@requiresScopes", "@key"]
              )

            type User @key(fields: "id") @requiresScopes(scopes: [["a"]]) {
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
                import: ["@requiresScopes", "@key"]
              )

            type User @key(fields: "id") @requiresScopes(scopes: [["b"]]) {
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
          @requiresScopes(scopes: [["a", "b"]]) {
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
                import: ["@requiresScopes", "@key", "@shareable"]
              )

            type User @key(fields: "id") {
              id: ID!
              name: String @requiresScopes(scopes: [["a"]]) @shareable
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
                import: ["@requiresScopes", "@key", "@shareable"]
              )

            type User @key(fields: "id") {
              id: ID!
              name: String @requiresScopes(scopes: [["b"]]) @shareable
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
          name: String @requiresScopes(scopes: [["a", "b"]])
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
                import: ["@requiresScopes", "@key"]
              )

            type User
              @key(fields: "id")
              @requiresScopes(
                scopes: [["user:read", "user:email:read"], ["admin"]]
              ) {
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
                import: ["@requiresScopes", "@key"]
              )

            type User
              @key(fields: "id")
              @requiresScopes(
                scopes: [
                  ["user:read", "billing:read"]
                  ["admin", "billing:invoice:read"]
                  ["support:user:read"]
                ]
              ) {
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
          @requiresScopes(
            scopes: [
              ["admin", "billing:invoice:read"]
              ["admin", "support:user:read"]
              ["admin", "billing:read", "user:read"]
              ["billing:read", "user:email:read", "user:read"]
              ["support:user:read", "user:email:read", "user:read"]
            ]
          ) {
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
                import: ["@requiresScopes", "@key"]
              )

            type User @key(fields: "id") {
              id: ID!
              comment: Node
            }

            interface Node {
              id: ID!
            }

            type Comment implements Node {
              id: ID! @requiresScopes(scopes: [["comment"]])
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
                import: ["@key", "@external", "@requires", "@requiresScopes"]
              )

            type Query {
              user: User
            }

            type User @key(fields: "id") @requiresScopes(scopes: [["user"]]) {
              id: ID
              comment: Node @external
              hasComment: Boolean
                @requires(fields: "comment { id }")
                # combination of type and field access
                # that equals to the required access on the referenced field
                @requiresScopes(scopes: [["comment"]])
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
                import: ["@requiresScopes", "@key"]
              )

            type User @key(fields: "id") {
              id: ID!
              comment: Node
            }

            interface Node {
              id: ID!
            }

            type Comment implements Node {
              id: ID! @requiresScopes(scopes: [["comment", "user"]])
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
            @requiresScopes(scopes: [["comment", "user"]])
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface Node @join__type(graph: A) @join__type(graph: B) {
          id: ID! @requiresScopes(scopes: [["comment", "user"]])
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type User
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id")
          @requiresScopes(scopes: [["user"]]) {
          id: ID
            @join__field(graph: A, type: "ID")
            @join__field(graph: B, type: "ID!")
          comment: Node
            @join__field(graph: A, external: true)
            @join__field(graph: B)
          hasComment: Boolean
            @join__field(graph: A, requires: "comment { id }")
            @requiresScopes(scopes: [["comment"]])
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
                import: ["@requiresScopes", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail
              @requiresScopes(scopes: [["missing"]]) {
              summary: String
              sensitiveLevel: Int
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String
            }

            type AdminAccountDetail implements AccountDetail
              @requiresScopes(scopes: [["missing"]]) {
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

    test("@requires missing access to referenced interface type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@key", "@external", "@requires", "@requiresScopes"]
              )

            type Query {
              account: Account
            }

            type Account
              @key(fields: "id")
              @requiresScopes(scopes: [["account"]]) {
              id: ID
              details: AccountDetail @external
              detailsSummary: String
                @requires(
                  fields: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote } ... on AdminAccountDetail { adminLevel } }"
                )
                @requiresScopes(scopes: [["scoped:summary", "scoped:level"]])
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
                import: ["@requiresScopes", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail
                @requiresScopes(scopes: [["account:details"]])
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail {
              summary: String @requiresScopes(scopes: [["scoped:summary"]])
              sensitiveLevel: Int @requiresScopes(scopes: [["scoped:level"]])
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String @requiresScopes(scopes: [["public:note"]])
            }

            type AdminAccountDetail implements AccountDetail {
              summary: String @requiresScopes(scopes: [["admin:summary"]])
              adminLevel: Int @requiresScopes(scopes: [["admin:level"]])
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

    test("@requires has access to referenced interface type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@key", "@external", "@requires", "@requiresScopes"]
              )

            type Query {
              account: Account
            }

            type Account
              @key(fields: "id")
              @requiresScopes(scopes: [["account:details"]]) {
              id: ID
              details: AccountDetail @external
              detailsSummary: String
                @requires(
                  fields: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote } ... on AdminAccountDetail { adminLevel } }"
                )
                @requiresScopes(
                  scopes: [
                    [
                      "scoped:summary"
                      "admin:summary"
                      "scoped:level"
                      "public:note"
                      "admin:level"
                    ]
                  ]
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
                import: ["@requiresScopes", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail
                @requiresScopes(scopes: [["account:details"]])
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail {
              summary: String @requiresScopes(scopes: [["scoped:summary"]])
              sensitiveLevel: Int @requiresScopes(scopes: [["scoped:level"]])
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String @requiresScopes(scopes: [["public:note"]])
            }

            type AdminAccountDetail implements AccountDetail {
              summary: String @requiresScopes(scopes: [["admin:summary"]])
              adminLevel: Int @requiresScopes(scopes: [["admin:level"]])
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Account
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id")
          @requiresScopes(scopes: [["account:details"]]) {
          id: ID
          details: AccountDetail
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @requiresScopes(scopes: [["account:details"]])
          detailsSummary: String
            @join__field(
              graph: A
              requires: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote }  ... on AdminAccountDetail { adminLevel } }"
            )
            @requiresScopes(
              scopes: [
                [
                  "scoped:summary"
                  "admin:summary"
                  "scoped:level"
                  "public:note"
                  "admin:level"
                ]
              ]
            )
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface AccountDetail @join__type(graph: A) @join__type(graph: B) {
          summary: String
            @requiresScopes(scopes: [["admin:summary", "scoped:summary"]])
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
            @requiresScopes(scopes: [["public:note"]])
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
            @requiresScopes(scopes: [["scoped:summary"]])
          sensitiveLevel: Int
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @requiresScopes(scopes: [["scoped:level"]])
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
            @requiresScopes(scopes: [["admin:summary"]])
          adminLevel: Int
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @requiresScopes(scopes: [["admin:level"]])
        }
      `);
    });
  });
});
