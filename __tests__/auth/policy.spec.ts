import { describe, expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  testImplementations,
} from "../shared/testkit.js";

testImplementations((api) => {
  describe("@policy", () => {
    test("forbidden on interface type", () => {
      const result = api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@policy", "@key"]
              )

            interface Node @policy(policies: [["a"]]) {
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
          message: `[a] Invalid use of @policy on interface "Node": @policy cannot be applied on interfaces, interface fields and interface objects`,
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
                import: ["@policy", "@key"]
              )

            interface Node {
              id: ID! @policy(policies: [["a"]])
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
          message: `[a] Invalid use of @policy on field "Node.id": @policy cannot be applied on interfaces, interface fields and interface objects`,
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
                import: ["@policy", "@key", "@interfaceObject"]
              )

            type User
              @key(fields: "id")
              @interfaceObject
              @policy(policies: [["a"]]) {
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
                import: ["@policy", "@key"]
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
            '[a] Invalid use of @policy on interface object "User": @policy cannot be applied on interfaces, interface fields and interface objects',
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
                import: ["@policy", "@key", "@interfaceObject", "@shareable"]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID!
              name: String @policy(policies: [["a"]]) @shareable # REF_AUTH_INTERFACE_OBJECT_SHAREABLE
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.9"
                import: ["@policy", "@key", "@shareable"]
              )

            interface User @key(fields: "id") {
              id: ID!
            }

            type Authenticated implements User @key(fields: "id") {
              id: ID!
            }

            type Temorary implements User @key(fields: "id") {
              id: ID!
              name: String @policy(policies: [["c"]]) @shareable
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
          name: String @join__field(graph: A) @policy(policies: [["a", "c"]])
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Authenticated implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String @policy(policies: [["a"]]) @join__field
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Temorary implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID!
          name: String @policy(policies: [["a", "c"]])
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
                import: ["@policy", "@key", "@interfaceObject"]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID! @policy(policies: [["a"]])
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
                import: ["@policy", "@key"]
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
                import: ["@policy", "@key", "@interfaceObject"]
              )

            type User @key(fields: "id") @interfaceObject {
              id: ID! @policy(policies: [["c"]])
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Authenticated implements User
          @join__implements(graph: B, interface: "User")
          @join__type(graph: B, key: "id") {
          id: ID! @policy(policies: [["a", "c"]])
          name: String @join__field
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface User
          @join__type(graph: A, isInterfaceObject: true, key: "id")
          @join__type(graph: B, key: "id")
          @join__type(graph: C, isInterfaceObject: true, key: "id") {
          id: ID! @policy(policies: [["a", "c"]])
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
                import: ["@policy", "@key"]
              )

            input UserInput @policy(policies: [["a"]]) {
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
          message: '[a] Directive "@policy" may not be used on INPUT_OBJECT.',
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
                import: ["@policy", "@key"]
              )

            union Result @policy(policies: [["a"]]) = User | Error

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
          message: '[a] Directive "@policy" may not be used on UNION.',
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
                import: ["@policy"]
              )

            scalar JSON @policy(policies: [["a"]])

            type Query {
              json: JSON
            }
          `,
        },
      ]);
      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        scalar JSON @join__type(graph: A) @policy(policies: [["a"]])
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
                import: ["@policy"]
              )

            enum Role @policy(policies: [["a"]]) {
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
        enum Role @join__type(graph: A) @policy(policies: [["a"]]) {
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
                import: ["@policy", "@key"]
              )

            interface Node {
              id: ID!
            }

            type User implements Node
              @key(fields: "id")
              @policy(policies: [["a"]]) {
              id: ID!
            }

            type Post implements Node
              @key(fields: "id")
              @policy(policies: [["b"]]) {
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
        interface Node @join__type(graph: A) @policy(policies: [["a", "b"]]) {
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
                import: ["@policy", "@key"]
              )

            interface Node {
              id: ID!
              name: String
            }

            type User implements Node
              @key(fields: "id")
              @policy(policies: [["a"]]) {
              id: ID!
              name: String @policy(policies: [["a"]])
            }

            type Post implements Node @key(fields: "id") {
              id: ID!
              name: String @policy(policies: [["b"]])
            }

            type Query {
              node: Node
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);
      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface Node @join__type(graph: A) @policy(policies: [["a"]]) {
          id: ID!
          name: String @policy(policies: [["a", "b"]])
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
                import: ["@policy", "@key"]
              )

            type User @key(fields: "id") @policy(policies: [["a"]]) {
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
                import: ["@policy", "@key"]
              )

            type User @key(fields: "id") @policy(policies: [["b"]]) {
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
          @policy(policies: [["a", "b"]]) {
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
                import: ["@policy", "@key", "@shareable"]
              )

            type User @key(fields: "id") {
              id: ID!
              name: String @policy(policies: [["a"]]) @shareable
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
                import: ["@policy", "@key", "@shareable"]
              )

            type User @key(fields: "id") {
              id: ID!
              name: String @policy(policies: [["b"]]) @shareable
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
          name: String @policy(policies: [["a", "b"]])
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
                import: ["@policy", "@key"]
              )

            type User
              @key(fields: "id")
              @policy(policies: [["user:read", "user:email:read"], ["admin"]]) {
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
                import: ["@policy", "@key"]
              )

            type User
              @key(fields: "id")
              @policy(
                policies: [
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
          @policy(
            policies: [
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
                import: ["@policy", "@key"]
              )

            type User @key(fields: "id") {
              id: ID!
              comment: Node
            }

            interface Node {
              id: ID!
            }

            type Comment implements Node {
              id: ID! @policy(policies: [["comment"]])
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
                import: ["@key", "@external", "@requires", "@policy"]
              )

            type Query {
              user: User
            }

            type User @key(fields: "id") {
              id: ID
              comment: Node @external
              hasComment: Boolean
                @requires(fields: "comment { id }")
                @policy(policies: [["comment"]])
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
                import: ["@policy", "@key"]
              )

            type User @key(fields: "id") {
              id: ID!
              comment: Node
            }

            interface Node {
              id: ID!
            }

            type Comment implements Node {
              id: ID! @policy(policies: [["comment"]])
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
            @policy(policies: [["comment"]])
        }
      `);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        interface Node @join__type(graph: A) @join__type(graph: B) {
          id: ID! @policy(policies: [["comment"]])
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
            @policy(policies: [["comment"]])
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
                import: ["@policy", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail
              @policy(policies: [["missing"]]) {
              summary: String
              sensitiveLevel: Int
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String
            }

            type AdminAccountDetail implements AccountDetail
              @policy(policies: [["missing"]]) {
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
                import: ["@key", "@external", "@requires", "@policy"]
              )

            type Query {
              account: Account
            }

            type Account @key(fields: "id") @policy(policies: [["account"]]) {
              id: ID
              details: AccountDetail @external
              detailsSummary: String
                @requires(
                  fields: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote } ... on AdminAccountDetail { adminLevel } }"
                )
                @policy(policies: [["scoped:summary", "scoped:level"]])
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
                import: ["@policy", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail @policy(policies: [["details"]])
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail {
              summary: String @policy(policies: [["scoped:summary"]])
              sensitiveLevel: Int @policy(policies: [["scoped:level"]])
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String @policy(policies: [["public:note"]])
            }

            type AdminAccountDetail implements AccountDetail {
              summary: String @policy(policies: [["admin:summary"]])
              adminLevel: Int @policy(policies: [["admin:level"]])
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
                import: ["@key", "@external", "@requires", "@policy"]
              )

            type Query {
              account: Account
            }

            type Account
              @key(fields: "id")
              @policy(policies: [["account:details"]]) {
              id: ID
              details: AccountDetail @external
              detailsSummary: String
                @requires(
                  fields: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote } ... on AdminAccountDetail { adminLevel } }"
                )
                @policy(
                  policies: [
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
                import: ["@policy", "@key"]
              )

            type Account @key(fields: "id") {
              id: ID
              details: AccountDetail @policy(policies: [["account:details"]])
            }

            interface AccountDetail {
              summary: String
            }

            type ScopedAccountDetail implements AccountDetail {
              summary: String @policy(policies: [["scoped:summary"]])
              sensitiveLevel: Int @policy(policies: [["scoped:level"]])
            }

            type PublicAccountDetail implements AccountDetail {
              summary: String
              publicNote: String @policy(policies: [["public:note"]])
            }

            type AdminAccountDetail implements AccountDetail {
              summary: String @policy(policies: [["admin:summary"]])
              adminLevel: Int @policy(policies: [["admin:level"]])
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(graphql`
        type Account
          @join__type(graph: A, key: "id")
          @join__type(graph: B, key: "id")
          @policy(policies: [["account:details"]]) {
          id: ID
          details: AccountDetail
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @policy(policies: [["account:details"]])
          detailsSummary: String
            @join__field(
              graph: A
              requires: "details { summary ... on ScopedAccountDetail { sensitiveLevel } ... on PublicAccountDetail { publicNote }  ... on AdminAccountDetail { adminLevel } }"
            )
            @policy(
              policies: [
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
            @policy(policies: [["admin:summary", "scoped:summary"]])
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
            @policy(policies: [["public:note"]])
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
            @policy(policies: [["scoped:summary"]])
          sensitiveLevel: Int
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @policy(policies: [["scoped:level"]])
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
            @policy(policies: [["admin:summary"]])
          adminLevel: Int
            @join__field(graph: A, external: true)
            @join__field(graph: B)
            @policy(policies: [["admin:level"]])
        }
      `);
    });
  });
});
