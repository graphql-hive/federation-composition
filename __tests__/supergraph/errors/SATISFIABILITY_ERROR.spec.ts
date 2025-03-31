import { expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  normalizeErrorMessage,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("cannot satisfy @require conditions", () => {
    const result = api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

          type Query {
            users: [User]
          }

          type User @key(fields: "id name") {
            id: ID!
            name: String!
          }
        `,
      },
      {
        name: "feed",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external", "@requires"])

          type Query {
            usersByIds(ids: [ID!]!): [User!]!
          }

          extend type User @key(fields: "id") {
            id: ID @external
            name: String! @external
            comments: [String] @requires(fields: "name")
          }
        `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(normalizeErrorMessage`
            The following supergraph API query:
            {
              usersByIds(ids: []) {
                comments
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "feed":
              - cannot satisfy @require conditions on field "User.comments".
              - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".
        `),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          normalizeErrorMessage`
            The following supergraph API query:
            {
              usersByIds(ids: []) {
                name
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "feed":
              - field "User.name" is not resolvable because marked @external.
              - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".
          `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(normalizeErrorMessage`
          The following supergraph API query:
          {
            users {
              comments
            }
          }
          cannot be satisfied by the subgraphs because:
          - from subgraph "users": cannot find field "User.comments".
          - from subgraph "feed": cannot satisfy @require conditions on field "User.comments".
        `),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );
  });

  test("insufficient key fields to move between graphs", () => {
    // Cannot resolve User.name from Query.randomUser because key field "id" from subgraph "feed"
    // is not enough to fullfil the @key(fields: "id name") of User from subgraph "users"
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Query {
              userById: User
            }

            type User @key(fields: "id name") {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Query {
              randomUser: User
            }

            extend type User @key(fields: "id") {
              id: ID @external
              comments: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  randomUser {\n" +
                "    name\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "feed":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
        ],
      }),
    );

    // Both User.{name,email,profile} cannot be resolved as Federation Gateway cannot move between subgraphs using identical @key.
    // The key fields are not the same ("id" is not enough to move from subgraph "a" to subgraph "b" that requires "id email").
    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend type User @key(fields: "id") {
              id: ID @external
              tags: [String]
            }

            type Query {
              usersById(ids: [ID!]!): [User!]!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type User @key(fields: "id email") {
              id: ID
              name: String
              email: String
              profile: String
            }

            type Query {
              users(ids: [ID!]!): [User!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          [
            expect.objectContaining({
              message: expect.stringContaining(
                "The following supergraph API query:\n" +
                  "{\n" +
                  "  usersById(ids: []) {\n" +
                  "    name\n" +
                  "  }\n" +
                  "}\n" +
                  "cannot be satisfied by the subgraphs because:\n" +
                  '- from subgraph "a":\n' +
                  '  - cannot find field "User.name".\n' +
                  '  - cannot move to subgraph "b" using @key(fields: "id email") of "User", the key field(s) cannot be resolved from subgraph "a".',
              ),
              extensions: expect.objectContaining({
                code: "SATISFIABILITY_ERROR",
              }),
            }),
            // Show as first (when it's apollo) and second (when it's guild)
            api.library === "apollo" ? 1 : 2,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                "The following supergraph API query:\n" +
                  "{\n" +
                  "  usersById(ids: []) {\n" +
                  "    email\n" +
                  "  }\n" +
                  "}\n" +
                  "cannot be satisfied by the subgraphs because:\n" +
                  '- from subgraph "a":\n' +
                  '  - cannot find field "User.email".\n' +
                  '  - cannot move to subgraph "b" using @key(fields: "id email") of "User", the key field(s) cannot be resolved from subgraph "a".',
              ),
              extensions: expect.objectContaining({
                code: "SATISFIABILITY_ERROR",
              }),
            }),
            // Show as second (when it's apollo) and first (when it's guild)
            api.library === "apollo" ? 2 : 1,
          ],
          [
            expect.objectContaining({
              message: expect.stringContaining(
                "The following supergraph API query:\n" +
                  "{\n" +
                  "  usersById(ids: []) {\n" +
                  "    profile\n" +
                  "  }\n" +
                  "}\n" +
                  "cannot be satisfied by the subgraphs because:\n" +
                  '- from subgraph "a":\n' +
                  '  - cannot find field "User.profile".\n' +
                  '  - cannot move to subgraph "b" using @key(fields: "id email") of "User", the key field(s) cannot be resolved from subgraph "a".',
              ),
              extensions: expect.objectContaining({
                code: "SATISFIABILITY_ERROR",
              }),
            }),
            // Show as third in both cases
            3,
          ],
        ]
          // Apollo returns errors in a different order
          .sort((a, b) => a[1] - b[1])
          .map(([error]) => error),
      }),
    );
  });

  test("insufficient key fields to move between graphs (entity many level deep from root type)", () => {
    // Same as above, but with an entity deep down the path.
    // Cannot resolve User.name from Query.randomUser because key field "id" from subgraph "feed"
    // is not enough to fullfil the @key(fields: "id name") of User from subgraph "users".
    const result = api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
        extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

        type Query {
          userById(id: ID): User
        }

        type User @key(fields: "id name") {
          id: ID!
          name: String!
        }
      `,
      },
      {
        name: "feed",
        typeDefs: graphql`
        extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

        type Query {
          users: UserConnection!
          randomUser: UserEdge
        }

        type UserConnection {
          edges: [UserEdge]
        }

        type UserEdge {
          node: User
        }

        extend type User @key(fields: "id") {
          id: ID @external
          comments: [String]
        }
      `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
              The following supergraph API query:
              {
                randomUser {
                  node {
                    name
                  }
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "feed":
                - cannot find field "User.name".
                - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".
            `
            : normalizeErrorMessage`
              The following supergraph API query:
              {
                users {
                  edges {
                    node {
                      name
                    }
                  }
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "feed":
                - cannot find field "User.name".
                - cannot move to subgraph "users" using @key(fields: "id name") of "User", the key field(s) cannot be resolved from subgraph "feed".
          `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );
  });

  // ADD IT TO THE COLLECTION
  test("works with @override", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
            directive @override(from: String!) on FIELD_DEFINITION

            type Query {
              view: Queries!
            }

            type Queries {
              aaa: [String!]! @override(from: "bar")
              bbb: String! @override(from: "bar")
              ccc: String! @override(from: "bar")
              user: User! @override(from: "bar")
            }

            type User {
              id: ID! @override(from: "bar")
              name: String! @override(from: "bar")
            }
          `,
        },
        {
          name: "bar",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@shareable", "@inaccessible"])

            type Query @shareable {
              _internal: Boolean @inaccessible
              view: Queries!
            }

            type Queries @shareable {
              aaa: [String!]!
              bbb: String!
              ccc: String!
              ddd: String!
              eee: String!
              fff: String!
              user: User!
            }

            type User {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "baz",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@inaccessible", "@shareable"])

            type Query {
              _bazInternal: Boolean @inaccessible
            }

            type Queries {
              _bazQueriesInternal: Boolean @inaccessible
            }
          `,
        },
        {
          name: "qux",
          typeDefs: graphql`
            type Query {
              qux: String
            }
          `,
        },
        {
          name: "quux",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@inaccessible", "@shareable"])

            type Query {
              _quux: Boolean @inaccessible
              view: Queries! @shareable
            }

            type Queries {
              _quux: Boolean @inaccessible
              quux: String @shareable
            }
          `,
        },
      ]),
    );

    // {
    //   view {
    //     aaa
    //   }
    // }
    // cannot be satisfied by the subgraphs because:
    // - from subgraph "baz":
    //   - cannot find field "Queries.aaa".
    //   - cannot move to subgraph "bar", which has field "Queries.aaa", because type "Queries" has no @key defined in subgraph "bar".
    // - from subgraph "quux":
    //   - cannot find field "Queries.aaa".
    //   - cannot move to subgraph "bar", which has field "Queries.aaa", because type "Queries" has no @key defined in subgraph "bar".
    //
    // {
    //   view {
    //     bbb
    //   }
    // }
    // cannot be satisfied by the subgraphs because:
    // - from subgraph "baz":
    //   - cannot find field "Queries.bbb".
    //   - cannot move to subgraph "bar", which has field "Queries.bbb", because type "Queries" has no @key defined in subgraph "bar".
    // - from subgraph "quux":
    //   - cannot find field "Queries.bbb".
    //   - cannot move to subgraph "bar", which has field "Queries.bbb", because type "Queries" has no @key defined in subgraph "bar".
    //
    // {
    //   view {
    //     ccc
    //   }
    // }
    // cannot be satisfied by the subgraphs because:
    // - from subgraph "baz":
    //   - cannot find field "Queries.ccc".
    //   - cannot move to subgraph "bar", which has field "Queries.ccc", because type "Queries" has no @key defined in subgraph "bar".
    // - from subgraph "quux":
    //   - cannot find field "Queries.ccc".
    //   - cannot move to subgraph "bar", which has field "Queries.ccc", because type "Queries" has no @key defined in subgraph "bar".
    //
    // {
    //   view {
    //     user {
    //       ...
    //     }
    //   }
    // }
    // cannot be satisfied by the subgraphs because:
    // - from subgraph "baz":
    //   - cannot find field "Queries.user".
    //   - cannot move to subgraph "bar", which has field "Queries.user", because type "Queries" has no @key defined in subgraph "bar".
    // - from subgraph "quux":
    //   - cannot find field "Queries.user".
    //   - cannot move to subgraph "bar", which has field "Queries.user", because type "Queries" has no @key defined in subgraph "bar".

    expect(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
            directive @override(from: String!) on FIELD_DEFINITION

            type Query {
              view: Queries!
            }

            type Queries {
              aaa: [String!]! @override(from: "bar")
              bbb: String! @override(from: "bar")
              ccc: String! @override(from: "bar")
              user: User! @override(from: "bar")
            }

            type User {
              id: ID! @override(from: "bar")
              name: String! @override(from: "bar")
            }
          `,
        },
        {
          name: "bar",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@shareable", "@inaccessible"])

            type Query @shareable {
              _internal: Boolean @inaccessible
              view: Queries!
            }

            type Queries @shareable {
              aaa: [String!]!
              bbb: String!
              ccc: String!
              ddd: String!
              eee: String!
              fff: String!
              user: User!
            }

            type User {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "baz",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@inaccessible", "@shareable"])

            type Query {
              _bazInternal: Boolean @inaccessible
            }

            type Queries {
              _bazQueriesInternal: Boolean @inaccessible
            }
          `,
        },
        {
          name: "qux",
          typeDefs: graphql`
            type Query {
              qux: String
            }
          `,
        },
        {
          name: "quux",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@inaccessible", "@shareable"])

            type Query {
              _quux: Boolean @inaccessible
              view: Queries!
            }

            type Queries {
              _quux: Boolean @inaccessible
              quux: String @shareable
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Non-shareable field "Query.view" is resolved from multiple subgraphs: it is resolved from subgraphs "bar", "foo" and "quux" and defined as non-shareable in subgraph "quux"`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_FIELD_SHARING",
            }),
          }),
        ]),
      }),
    );
  });

  test("insufficient key fields to move between graphs (completely different key fields)", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Query {
              usersByIds(ids: [ID!]!): [User!]!
            }

            extend type User @key(fields: "email") {
              email: String
              comments: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  users {\n" +
                "    email\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "users":\n' +
                '  - cannot find field "User.email".\n' +
                '  - cannot move to subgraph "feed" using @key(fields: "email") of "User", the key field(s) cannot be resolved from subgraph "users".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  users {\n" +
                "    comments\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "users":\n' +
                '  - cannot find field "User.comments".\n' +
                '  - cannot move to subgraph "feed" using @key(fields: "email") of "User", the key field(s) cannot be resolved from subgraph "users".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  usersByIds(ids: []) {\n" +
                "    id\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "feed":\n' +
                '  - cannot find field "User.id".\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  usersByIds(ids: []) {\n" +
                "    name\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "feed":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "users" using @key(fields: "id") of "User", the key field(s) cannot be resolved from subgraph "feed".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
        ],
      }),
    );
  });

  test("cannot move as not shareable and no keys", () => {
    // Cannot resolve User.name from Query.usersByAge as User has no @key to move to subgraph "a"
    // Cannot resolve User.age from Query.users as User has no @key to move to subgraph "b"
    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User {
              name: String
            }

            type Query {
              users(filter: UsersFilter, role: Role): [User]
            }

            input UsersFilter {
              limit: Int!
              after: ID!
              user: UserFilter
            }

            input UserFilter {
              role: Role
            }

            enum Role {
              ADMIN
              USER
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            extend type User {
              age: Int
            }

            type Query {
              """
              Note: age is nullable, but limit is not
              """
              usersByAge(age: Int, limit: Int!): [User]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  usersByAge(age: 0, limit: 0) {\n" +
                "    name\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "b":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                '  users(filter: {limit: 0, after: "<any id>"}, role: ADMIN) {\n' +
                "    age\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "a":\n' +
                '  - cannot find field "User.age".\n' +
                '  - cannot move to subgraph "b", which has field "User.age", because type "User" has no @key defined in subgraph "b".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
        ],
      }),
    );

    // Cannot resolve User.name from Query.usersByAge as User has no @key to move to subgraph "a"
    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User {
              name: String
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            extend type User {
              age: Int
            }

            type Query {
              usersByAge(age: Int): [User]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  usersByAge(age: 0) {\n" +
                "    name\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "b":\n' +
                '  - cannot find field "User.name".\n' +
                '  - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
        ],
      }),
    );
  });

  test("cannot move as not shareable and no keys (mutation and subscription)", () => {
    // Cannot resolve User.name from Query.usersByAge as User has no @key to move to subgraph "a"
    // Cannot resolve User.age from Query.users as User has no @key to move to subgraph "b"
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

          type User {
            name: String
          }

          type Query {
            users: [User]
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

          extend type User {
            age: Int
          }

          type Mutation {
            createRandomUser: User
          }

          type Subscription {
            onUserCreated: User
          }
        `,
      },
    ]);

    assertCompositionFailure(result);

    if (api.library === "guild") {
      // Why??????
      // Because Apollo does not throw an error for mutation if subscription is detected, LOL.
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            "The following supergraph API query:\n" +
              "mutation {\n" +
              "  createRandomUser {\n" +
              "    name\n" +
              "  }\n" +
              "}\n" +
              "cannot be satisfied by the subgraphs because:\n" +
              '- from subgraph "b":\n' +
              '  - cannot find field "User.name".\n' +
              '  - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".',
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
            The following supergraph API query:
            subscription {
              onUserCreated {
                name
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "b":
              - cannot find field "User.name".
              - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".
          `
            : normalizeErrorMessage`
            The following supergraph API query:
            mutation {
              createRandomUser {
                name
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "b":
              - cannot find field "User.name".
              - cannot move to subgraph "a", which has field "User.name", because type "User" has no @key defined in subgraph "a".
          `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          "The following supergraph API query:\n" +
            "{\n" +
            "  users {\n" +
            "    age\n" +
            "  }\n" +
            "}\n" +
            "cannot be satisfied by the subgraphs because:\n" +
            '- from subgraph "a":\n' +
            '  - cannot find field "User.age".\n' +
            '  - cannot move to subgraph "b", which has field "User.age", because type "User" has no @key defined in subgraph "b".',
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );
  });

  test("unreachable from root", () => {
    // When User is not queryable (not referenced by a Query type and its dependencies, at any level)
    // it can be ignored by the SATISFIABILITY_ERROR check.
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User {
              name: String
            }

            type Query {
              users: [String]
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            extend type User {
              age: Int
            }

            type Query {
              usersByAge(age: Int): [String]
            }
          `,
        },
      ]),
    );
  });

  test("identical keys fields", () => {
    // User.{profile,email} can be resolved as Federation Gateway can move between subgraphs using identical @key
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type User @key(fields: "id") {
              id: ID @external
              email: String
            }

            type Query {
              usersById(ids: [ID!]!): [User!]!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type User @key(fields: "id") {
              id: ID
              profile: String
            }

            type Query {
              users(ids: [ID!]!): [User!]!
            }
          `,
        },
      ]),
    );
  });

  test("unresolvable because of external (no idea...)", () => {
    let result = api.composeServices([
      {
        name: "foo",
        typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible"])

            type Product @key(fields: "publicId fooCriteria") @key(fields: "key { code type } fooCriteria") {
              fooId: String! @inaccessible
              fooCriteria: String @inaccessible
              publicId: ID!
              key: Key
            }

            type Key {
              code: Int!
              type: ProductType!
            }

            enum ProductType {
              PUBLIC
              PRIVATE
            }

            type Query {
              productInFoo: Product
            }
        `,
      },
      {
        name: "bar",
        typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "publicId fooCriteria") {
              publicId: ID! @external
              fooCriteria: String @external
            }

            type Query {
              productInBar: Product
            }
        `,
      },
      {
        name: "baz",
        typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "publicId fooCriteria") {
              publicId: ID!
              fooCriteria: String
              available: Boolean!
            }

            type Query {
              productInBaz: Product
            }
          `,
      },
      {
        name: "qux",
        typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible"])

            type Product @key(fields: "publicId fooCriteria") {
              publicId: ID!
              fooCriteria: String @inaccessible
            }

            type Query {
              productInQux: Product
            }
          `,
      },
    ]);

    assertCompositionFailure(result);

    // Query.productInBar (bar) can't resolve Product.publicId (foo, baz, qux)
    // because it's marked as @external
    if (api.library === "apollo") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: normalizeErrorMessage`
          The following supergraph API query:
          {
            productInBar {
              publicId
            }
          }
          cannot be satisfied by the subgraphs because:
          - from subgraph "bar":
            - field "Product.publicId" is not resolvable because marked @external.
            - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
          `,
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: normalizeErrorMessage`
          The following supergraph API query:
          {
            productInBar {
              publicId
            }
          }
          cannot be satisfied by the subgraphs because:
          - from subgraph "bar":
            - field "Product.publicId" is not resolvable because marked @external.
            - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
          `,
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    }

    // Query.productInBar (bar) can't resolve Product.available (baz)
    // Because:
    // - Product.available does not exist in subgraph "bar"
    // - can't move to other subgraphs that can resolve that field (foo, baz, qux)

    if (api.library === "apollo") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBar {
                  available
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "bar":
                - cannot find field "Product.available".
                - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBar {
                  available
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "bar":
                - cannot find field "Product.available".
                - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    }

    if (api.library === "apollo") {
      expect(result.errors).toContainEqual(
        // Query.productInBar (bar) can't resolve Product.key (foo)
        // Because:
        // - Product.available key not exist in subgraph "bar"
        // - can't move to other subgraphs that can possibly resolve Product (foo, baz, qux) - not only the ones that can resolve Product.key, Product in general
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBar {
                  key {
                    ...
                  }
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "bar":
                - cannot find field "Product.key".
                - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        // Query.productInBar (bar) can't resolve Product.key (foo)
        // Because:
        // - Product.available key not exist in subgraph "bar"
        // - can't move to other subgraphs that can possibly resolve Product (foo, baz, qux) - not only the ones that can resolve Product.key, Product in general
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBar {
                  key {
                    ...
                  }
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "bar":
                - cannot find field "Product.key".
                - cannot move to subgraph "qux" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "foo" using @key(fields: "key { code type } fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "foo" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "baz" using @key(fields: "publicId fooCriteria") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    }

    result = api.composeServices([
      {
        name: "products",
        typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible"])

            type Product @key(fields: "id") @key(fields: "id policy") {
              internalId: String! @inaccessible
              id: ID!
              policy: String
            }

            type Query {
              productInFoo: Product
            }
        `,
      },
      {
        name: "bar",
        typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "id policy") {
              id: ID! @external
              policy: String @external
            }

            type Query {
              productInBar: Product
            }
        `,
      },
      {
        name: "env",
        typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "id") {
              id: ID!
              environmentallyFriendly: Boolean!
            }

            type Query {
              productInBaz: Product
            }
          `,
      },
      {
        name: "prices",
        typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible"])

            type Product @key(fields: "id policy") {
              id: ID!
              policy: String @inaccessible
            }

            type Query {
              productInQux: Product
            }
          `,
      },
    ]);

    assertCompositionFailure(result);

    if (api.library === "apollo") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBar {
                  id
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "bar":
                - field "Product.id" is not resolvable because marked @external.
                - cannot move to subgraph "env" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "prices" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "products" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "products" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBar {
                  id
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "bar":
                - field "Product.id" is not resolvable because marked @external.
                - cannot move to subgraph "products" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "products" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "prices" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".
                - cannot move to subgraph "env" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    }

    if (api.library === "apollo") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
            The following supergraph API query:
            {
              productInBar {
                environmentallyFriendly
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "bar":
              - cannot find field "Product.environmentallyFriendly".
              - cannot move to subgraph "env" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".
              - cannot move to subgraph "prices" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".
              - cannot move to subgraph "products" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".
              - cannot move to subgraph "products" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".
          `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
            The following supergraph API query:
            {
              productInBar {
                environmentallyFriendly
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "bar":
              - cannot find field "Product.environmentallyFriendly".
              - cannot move to subgraph "products" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".
              - cannot move to subgraph "products" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".
              - cannot move to subgraph "prices" using @key(fields: "id policy") of "Product", the key field(s) cannot be resolved from subgraph "bar".
              - cannot move to subgraph "env" using @key(fields: "id") of "Product", the key field(s) cannot be resolved from subgraph "bar".
          `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    }
  });

  // ADD IT TO THE COLLECTION
  test("external but somehow resolvable", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "products",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "id category")  {
              id: ID!
              categoryDescription: String
              category: String
            }

            type Query {
              productInProducts: Product
            }
        `,
        },
        {
          name: "bar",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "id stockId") {
              id: ID!
              freeBar: Boolean!
              stockId: String
            }

            type Query {
              productInBar: Product
            }
        `,
        },
        {
          name: "env",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Product @key(fields: "id")  {
              id: ID!
              environmentallyFriendly: String!
            }

            type Query {
              productInEnv: Product
            }
          `,
        },
        {
          name: "random",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type Product @key(fields: "id") {
              id: ID! @external
              randomThing: String
            }

            type Query {
              productInRandom: Product
            }

            `,
        },
        {
          name: "prices",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type Product @key(fields: "id stockId")  {
              id: ID! @external
              stockId: String
              price: Float
            }

            type Query {
              productInPrices: Product
            }
            `,
        },
        {
          name: "base",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type Product @key(fields: "id") @key(fields: "id stockId") @key(fields: "id category") {
              id: ID!
              stockId: String
              category: String
            }

            type Query {
              productInBase: Product
            }
            `,
        },
      ]),
    );
  });

  test(`field resolvable via entity type's child`, () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
            type Query {
              foo: Foo
            }

            type Foo {
              user: User
            }

            type User @key(fields: "id profile { id }") @extends {
              id: ID!
              profile: Profile! @external
            }

            type Profile @extends {
              id: ID!
            }
          `,
        },
        {
          name: "bar",
          typeDefs: graphql`
            type Query {
              bar: Bar
            }

            type Bar {
              user: User
            }

            type User @key(fields: "id profile { id }") {
              id: ID!
              profile: Profile!
            }

            type Profile {
              id: ID!
              name: String
            }
          `,
        },
      ]),
    );
  });

  test("fed v1: same types but extra root field in a subgraph missing a field", () => {
    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
              randomUser: User # this is not in subgraph "a"
            }

            type User {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type User {
              id: ID!
              name: String!
              nickname: String # this is not in subgraph "a"
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  randomUser {\n" +
                "    nickname\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "a":\n' +
                '  - cannot find field "User.nickname".\n' +
                '  - cannot move to subgraph "b", which has field "User.nickname", because type "User" has no @key defined in subgraph "b".',
            ),
            extensions: expect.objectContaining({
              code: "SATISFIABILITY_ERROR",
            }),
          }),
        ],
      }),
    );
  });

  test("fed v1: same types but extra root field in a subgraph defining extra field", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type User {
              id: ID!
              name: String!
              # missing nickname
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
              randomUser: User # this is not in subgraph "a"
            }

            type User {
              id: ID!
              name: String!
              nickname: String # this is not in subgraph "a"
            }
          `,
        },
        {
          name: "c",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
              randomUser: User # this is not in subgraph "a"
            }

            type User {
              id: ID!
              name: String!
              # missing nickname
            }
          `,
        },
      ]),
    );
  });

  test("fed v1: same root fields, same types, additional fields", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type Mutation {
              createUser(name: String!): User
            }

            type User {
              id: ID!
              name: String!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type User {
              id: ID!
              name: String!
              nickname: String # this is not in subgraph "a"
            }

            type Mutation {
              createUser(name: String!): User
            }
          `,
        },
      ]),
    );
  });

  test("moving between entity with @key and without it", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

          extend type User @key(fields: "id") {
            id: ID @external
            email: String
          }

          type Query {
            usersById(ids: [ID!]!): [User!]!
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

          type User {
            profile: String
          }

          union Account = User | Admin

          type Admin {
            id: ID
            photo: String
          }

          type Query {
            accounts(ids: [ID!]!): [Account!]!
          }
        `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          normalizeErrorMessage`
          The following supergraph API query:
          {
            usersById(ids: []) {
              profile
            }
          }
          cannot be satisfied by the subgraphs because:
          - from subgraph "a":
            - cannot find field "User.profile".
            - cannot move to subgraph "b", which has field "User.profile", because type "User" has no @key defined in subgraph "b".
        `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    if (api.library === "apollo") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
            The following supergraph API query:
            {
              accounts(ids: []) {
                ... on User {
                  email
                }
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "b":
              - cannot find field "User.email".
              - cannot move to subgraph "a" using @key(fields: "id") of "User", the key field(s) cannot be resolved from subgraph "b".
          `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            normalizeErrorMessage`
            The following supergraph API query:
            {
              accounts(ids: []) {
                ... on User {
                  id
                }
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "b":
              - cannot find field "User.id".
              - cannot move to subgraph "a" using @key(fields: "id") of "User", the key field(s) cannot be resolved from subgraph "b".
          `,
          ),
          extensions: expect.objectContaining({
            code: "SATISFIABILITY_ERROR",
          }),
        }),
      );
    }
  });

  test("gateway can move from one graph to another through other subgraphs", () => {
    const result = api.composeServices([
      {
        name: "foo",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

          type Product @key(fields: "id category")  {
            id: ID!
            categoryDescription: String
            category: String
          }

          type Query {
            productInFoo: Product
          }
      `,
      },
      {
        name: "bar",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

          type Product @key(fields: "id stockId") {
            id: ID!
            freeBar: Boolean!
            stockId: String
          }

          type Query {
            productInBar: Product
          }
      `,
      },
      {
        name: "baz",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

          type Product @key(fields: "id")  {
            id: ID!
            environmentFriendly: String!
          }

          type Query {
            productInBaz: Product
          }
        `,
      },
      {
        name: "qux",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

          extend type Car @key(fields: "id") {
            id: ID! @external
            randomThing: String
          }

          type Query {
            carInQux: Car
          }

          `,
      },
      {
        name: "qux2",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

          extend type Car @key(fields: "id stockId")  {
            id: ID! @external
            stockId: String
            price: Float
          }

          type Query {
            carInQux2: Car
          }
          `,
      },
      {
        name: "qux3",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

          type Car @key(fields: "id") @key(fields: "id stockId") @key(fields: "id category") {
            id: ID!
            stockId: String
            category: String
          }

          type Query {
            carInQux3: Car
          }
          `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
              The following supergraph API query:
              {
                productInFoo {
                  freeBar
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "foo":
                - cannot find field "Product.freeBar".
                - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "foo".
              - from subgraph "baz":
                - cannot find field "Product.freeBar".
                - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
            `
            : normalizeErrorMessage`
              The following supergraph API query:
              {
                productInFoo {
                  freeBar
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "foo":
                - cannot find field "Product.freeBar".
                - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "foo".
            `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
              The following supergraph API query:
              {
                productInFoo {
                  stockId
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "foo":
                - cannot find field "Product.stockId".
                - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "foo".
              - from subgraph "baz":
                - cannot find field "Product.stockId".
                - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
            `
            : normalizeErrorMessage`
              The following supergraph API query:
              {
                productInFoo {
                  stockId
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "foo":
                - cannot find field "Product.stockId".
                - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "foo".
          `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
            The following supergraph API query:
            {
              productInBaz {
                freeBar
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "baz":
              - cannot find field "Product.freeBar".
              - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
              - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
          `
            : normalizeErrorMessage`
          The following supergraph API query:
          {
            productInBaz {
              freeBar
            }
          }
          cannot be satisfied by the subgraphs because:
          - from subgraph "baz":
            - cannot find field "Product.freeBar".
            - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
            - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
        `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
            The following supergraph API query:
            {
              productInBaz {
                stockId
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "baz":
              - cannot find field "Product.stockId".
              - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
              - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
            `
            : normalizeErrorMessage`
            The following supergraph API query:
            {
              productInBaz {
                stockId
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "baz":
              - cannot find field "Product.stockId".
              - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
              - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
            `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
            The following supergraph API query:
            {
              productInBaz {
                categoryDescription
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "baz":
              - cannot find field "Product.categoryDescription".
              - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
              - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
          `
            : normalizeErrorMessage`
          The following supergraph API query:
          {
            productInBaz {
              categoryDescription
            }
          }
          cannot be satisfied by the subgraphs because:
          - from subgraph "baz":
            - cannot find field "Product.categoryDescription".
            - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
            - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
        `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBaz {
                  category
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "baz":
                - cannot find field "Product.category".
                - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
                - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
            `
            : normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBaz {
                  category
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "baz":
                - cannot find field "Product.category".
                - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
                - cannot move to subgraph "bar" using @key(fields: "id stockId") of "Product", the key field(s) cannot be resolved from subgraph "baz".
          `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBar {
                  categoryDescription
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "bar":
                - cannot find field "Product.categoryDescription".
                - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "bar".
              - from subgraph "baz":
                - cannot find field "Product.categoryDescription".
                - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
            `
            : normalizeErrorMessage`
              The following supergraph API query:
              {
                productInBar {
                  categoryDescription
                }
              }
              cannot be satisfied by the subgraphs because:
              - from subgraph "bar":
                - cannot find field "Product.categoryDescription".
                - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          api.library === "apollo"
            ? normalizeErrorMessage`
            The following supergraph API query:
            {
              productInBar {
                category
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "bar":
              - cannot find field "Product.category".
              - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "bar".
            - from subgraph "baz":
              - cannot find field "Product.category".
              - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "baz".
          `
            : normalizeErrorMessage`
            The following supergraph API query:
            {
              productInBar {
                categoryDescription
              }
            }
            cannot be satisfied by the subgraphs because:
            - from subgraph "bar":
              - cannot find field "Product.categoryDescription".
              - cannot move to subgraph "foo" using @key(fields: "id category") of "Product", the key field(s) cannot be resolved from subgraph "bar".
          `,
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );
  });

  test("cannot move subgraphs without @key and common query path", () => {
    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type User {
              id: String!
              name: String!
            }

            type Query {
              users: [User]
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            extend type User {
              tags: [Tag]
            }

            type Tag {
              id: String!
              name: String!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  users {\n" +
                "    tags {\n" +
                "      ...\n" +
                "    }\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "a":\n' +
                '  - cannot find field "User.tags".\n' +
                '  - cannot move to subgraph "b", which has field "User.tags", because type "User" has no @key defined in subgraph "b".',
            ),
          }),
        ]),
      }),
    );

    // Federation v1
    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type User {
              id: String!
              name: String!
            }

            type Query {
              users: [User]
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend type User {
              tags: [Tag]
            }

            type Tag {
              id: String!
              name: String!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              "The following supergraph API query:\n" +
                "{\n" +
                "  users {\n" +
                "    tags {\n" +
                "      ...\n" +
                "    }\n" +
                "  }\n" +
                "}\n" +
                "cannot be satisfied by the subgraphs because:\n" +
                '- from subgraph "a":\n' +
                '  - cannot find field "User.tags".\n' +
                '  - cannot move to subgraph "b", which has field "User.tags", because type "User" has no @key defined in subgraph "b".',
            ),
          }),
        ]),
      }),
    );
  });

  test("from root field (subgraph A) to entity (subgraph A,B) with missing key (B)", () => {
    // Even though key field fields are different, { user { nickname } } still can be resolved.
    // We cannot ask subgraph A, to resolve Query.user, as it's not defined there.
    // We need to ask subgraph B, but it can't resolve User.nickname, as it's not defined there.
    // We can't move to subgraph A by using @key(fields: "id"), but we can extend the selection set to include `email`.
    // This way we get the `email` and resolve `nickname` in subgraph B by making a call to `Query._entities` with the "email" as the key.
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

            type Query {
              user: User
            }

            type User @key(fields: "id") {
              id: ID!
              email: String!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

            type User @key(fields: "email") {
              email: String! @external
              nickname: String!
            }
          `,
        },
      ]),
    );

    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])

          type Query {
            user: User
          }

          type User @key(fields: "id") {
            id: ID!
            name: String!
          }
        `,
        },
        {
          name: "b",
          typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

          type User @key(fields: "email") {
            email: String! @external
            nickname: String!
          }
        `,
        },
        {
          name: "c",
          typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@external"])

          type User @key(fields: "email") {
            email: String!
            country: String!
          }
        `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          api.library === "apollo"
            ? expect.objectContaining({
                message: expect.stringContaining(
                  "The following supergraph API query:\n" +
                    "{\n" +
                    "  user {\n" +
                    "    email\n" +
                    "  }\n" +
                    "}\n" +
                    "cannot be satisfied by the subgraphs because:\n" +
                    '- from subgraph "a":\n' +
                    '  - cannot find field "User.email".\n' +
                    '  - cannot move to subgraph "b" using @key(fields: "email") of "User", the key field(s) cannot be resolved from subgraph "a".\n' +
                    '  - cannot move to subgraph "c" using @key(fields: "email") of "User", the key field(s) cannot be resolved from subgraph "a".',
                ),
                extensions: expect.objectContaining({
                  code: "SATISFIABILITY_ERROR",
                }),
              })
            : expect.objectContaining({
                message: expect.stringContaining(
                  "The following supergraph API query:\n" +
                    "{\n" +
                    "  user {\n" +
                    "    email\n" +
                    "  }\n" +
                    "}\n" +
                    "cannot be satisfied by the subgraphs because:\n" +
                    '- from subgraph "a":\n' +
                    '  - cannot find field "User.email".\n' +
                    '  - cannot move to subgraph "c" using @key(fields: "email") of "User", the key field(s) cannot be resolved from subgraph "a".\n' +
                    '  - cannot move to subgraph "b" using @key(fields: "email") of "User", the key field(s) cannot be resolved from subgraph "a".',
                ),
                extensions: expect.objectContaining({
                  code: "SATISFIABILITY_ERROR",
                }),
              }),
        ]),
      }),
    );
  });

  test("resolve missing field by parent entity", () => {
    const result = api.composeServices([
      {
        name: "product",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

          type Query {
            products: [Product!]!
          }

          type Product @key(fields: "id") @key(fields: "id pid") {
            id: ID!
            pid: ID
          }

          type Category @key(fields: "id name") {
            id: ID!
            name: String! @external
          }
        `,
      },
      {
        name: "product-category",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          type Product @key(fields: "id pid") {
            id: ID!
            pid: ID
            category: Category
          }

          type Category @key(fields: "id name") @key(fields: "cid") {
            id: ID!
            cid: ID!
            name: String!
          }
        `,
      },
      {
        name: "category",
        typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          type Category @key(fields: "id cid") {
            id: ID!
            cid: ID
            details: CategoryDetails
          }

          type CategoryDetails {
            products: Int
          }
        `,
      },
    ]);

    // It's possible to resolve Category.details only because it can be resolved by the parent entity (Car.category).
    assertCompositionSuccess(result);
  });

  test("resolve missing field by resolving first deeply nested key fields from multiple subgraphs...", () => {
    const result = api.composeServices(
      [
        {
          name: "products",
          typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@external", "@extends", "@shareable"]
            )

          type Query {
            topProducts: ProductList!
          }

          type ProductList @key(fields: "products{id}") {
            products: [Product!]!
          }

          type Product @extends @key(fields: "id") {
            id: String! @external
            category: Category @shareable
          }

          type Category @key(fields: "id") {
            mainProduct: Product! @shareable
            id: String!
            tag: String @shareable
          }
        `,
        },
        {
          name: "core",
          typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          type Product @key(fields: "id") @key(fields: "id pid") {
            id: String!
            pid: String!
          }
        `,
        },
        {
          name: "product-list",
          typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

          type ProductList @key(fields: "products{id pid}") {
            products: [Product!]!
            first: Product @shareable
            last: Product @shareable
          }

          type Product @key(fields: "id pid") {
            id: String!
            pid: String
          }
        `,
        },
        {
          name: "product-price",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type ProductList @key(fields: "products{id pid category{id tag}} last{id}") {
              products: [Product!]!
              first: Product @shareable
              last: Product @shareable
            }

            type Product @key(fields: "id pid category{id tag}") {
              id: String!
              price: Price
              pid: String
              category: Category
            }

            type Category @key(fields: "id tag") {
              id: String!
              tag: String
            }

            type Price {
              price: Float!
            }
          `,
        },
      ],
      {},
      true,
    );

    assertCompositionSuccess(result);
  });

  test("ignore overridden root fields", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: [
                "@shareable"
              ]
            )

          type Query {
            data: Data
          }

          type Data {
            id: String
            name: String
            notInA: String
            shared: String @shareable
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: [
                "@override",
                "@shareable"
              ]
            )

          type Query {
            data: Data @override(from: "a")
          }

          type Data {
            id: String @override(from: "a")
            name: String @override(from: "a")
            shared: String @shareable
          }
        `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          [
            "The following supergraph API query:",
            "{",
            "  data {",
            "    notInA",
            "  }",
            "}",
            "cannot be satisfied by the subgraphs because:",
            '- from subgraph "b":',
            '  - cannot find field "Data.notInA".',
            '  - cannot move to subgraph "a", which has field "Data.notInA", because type "Data" has no @key defined in subgraph "a".',
          ].join("\n"),
        ),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );
  });

  test("make sure we avoid infinite loops", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@shareable", "@external"])

              type Query {
                node(id: ID!): Node @shareable
                account(id: String!): Account
              }

              interface Node {
                id: ID!
              }

              type Account implements Node @key(fields: "id") {
                id: ID!
                username: String!
              }

              type Chat implements Node @key(fields: "id") {
                id: ID! @external
                account: Account!
              }
            `,
        },
        {
          name: "bar",
          typeDefs: graphql`
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@shareable", "@external"])
              type Query {
                node(id: ID!): Node @shareable
                chat(id: String!): Chat
              }

              interface Node {
                id: ID!
              }

              type Account implements Node @key(fields: "id") {
                id: ID! @external
                chats: [Chat!]!
              }

              type Chat implements Node @key(fields: "id") {
                id: ID!
                text: String!
              }
          `,
        },
      ]),
    );
  });

  test("Fed1: @external and @extends/extend", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type Query {
              randomUser: User
            }

            extend type User @key(fields: "id") {
              id: ID! @external
            }

            extend type User {
              name: String! @external
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type User @key(fields: "id") {
              id: ID!
              name: String!
              nickname: String
            }
          `,
        },
      ]),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type Query {
              randomUser: User
            }

            type User @extends {
              id: ID! @external
              name: String! @external
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type Query {
              userById(id: ID): User
            }

            type User @key(fields: "id") {
              id: ID!
              name: String!
              nickname: String
            }
          `,
        },
      ]),
    );
  });

  test("@requires with interface field", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type Query {
              userFromA(id: ID): User
            }

            interface Address {
              id: ID!
            }

            type HomeAddress implements Address @key(fields: "id") {
              id: ID!
              city: String
            }

            type WorkAddress implements Address @key(fields: "id") {
              id: ID!
              city: String
            }

            type User @key(fields: "id") {
              id: ID!
              name: String!
              address: Address @external
              city: String @requires(fields: "address { id }")
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type Query {
              userFromB(id: ID): User
            }

            interface Address {
              id: ID!
            }

            type HomeAddress implements Address @key(fields: "id") {
              id: ID!
              city: String
            }

            type WorkAddress implements Address @key(fields: "id") {
              id: ID!
              city: String
            }

            type User @key(fields: "id") {
              id: ID!
              name: String!
              address: Address
              city: String @requires(fields: "address { id }")
            }
          `,
        },
      ]),
    );
  });

  test("@requires with a lot of nested entities", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.0"
                import: ["@key"]
              )

            type Publisher @key(fields: "id", resolvable: false) {
              id: ID!
            }

            type Details @key(fields: "id") {
              publisher: Publisher!
              id: ID!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.0"
                import: ["@key"]
              )

            type Publisher @key(fields: "id") {
              id: ID!
              books: [Book!]!
            }

            type Book @key(fields: "id", resolvable: false) {
              id: ID!
            }
          `,
        },
        {
          name: "c",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.0"
                import: ["@key"]
              )

            type Book @key(fields: "id") {
              id: ID!
              genres: [Genre!]!
            }

            type Genre {
              details: Details!
              name: String
            }

            type Details @key(fields: "id") {
              id: ID!
            }
          `,
        },
        {
          name: "d",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.0"
                import: ["@key", "@requires", "@external"]
              )

            type Query {
              noop: String
            }

            type Mutation {
              order: Book!
            }

            type Genre {
              name: String @external
            }

            type Book @key(fields: "id") {
              id: ID!
              genres: [Genre!]! @external
              price: Float @requires(fields: "genres { name }")
            }
          `,
        },
      ]),
    );

    let result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id isbn author{id name}") {
            id: ID!
            isbn: ID
            author: Author
          }

          type Author @key(fields: "id name") {
            id: ID!
            name: String
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id") @key(fields: "id isbn title") {
            id: ID!
            isbn: ID
            title: String
          }
        `,
      },
      {
        name: "c",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@external", "@shareable"]
            )

          type Author @key(fields: "id") {
            id: ID!
            name: String @shareable
          }

          type Book @key(fields: "id") {
            author: Author @shareable
            id: ID! @external
          }

          type Query {
            books: [Book]!
          }
        `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors[0].message).toEqual(
      expect.stringContaining('"Book.id"'),
    );

    result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id isbn author{id name}") {
            id: ID!
            isbn: ID
            author: Author
          }

          type BookList
            @key(fields: "books{id isbn author{id name nickname}} last{id}") {
            books: [Book!]!
            first: Book @shareable
            last: Book @shareable
            related: BookList!
          }

          type Author @key(fields: "id name") {
            id: ID!
            name: String
            nickname: String
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book
            @key(fields: "id")
            @key(fields: "id isbn title")
            @key(fields: "id publisher") {
            id: ID!
            isbn: ID
            title: String
            publisher: String
          }

          type BookList
            @key(fields: "books{id publisher} last{id}")
            @key(fields: "books{id isbn title}") {
            books: [Book!]!
            first: Book @shareable
            groupBy: [BookList!]!
            last: Book @shareable
          }
        `,
      },
      {
        name: "c",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@external", "@shareable"]
            )

          type Author @key(fields: "id") {
            id: ID!
            name: String @shareable
          }

          type Book @key(fields: "id") {
            author: Author @shareable
            id: ID! @external
          }

          type BookList @key(fields: "books{id}") {
            books: [Book!]!
            first: Book @shareable
          }

          type Query {
            books: [Book]!
          }
        `,
      },
    ]);

    assertCompositionFailure(result);
    expect(result.errors[0].message).toEqual(
      expect.stringContaining('"Book.id"'),
    );

    result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id title isbn") {
            id: ID!
            title: String
            isbn: String
          }

          type BookList @key(fields: "books{id title isbn}") {
            books: [Book!]!
            last: Book @shareable
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id isbn author{id name country}") {
            id: ID!
            isbn: String
            author: Author
          }

          type BookList
            @key(fields: "books{id isbn author{id name country}} last{id}") {
            books: [Book!]!
            last: Book @shareable
          }

          type Author @key(fields: "id name country") {
            name: String!
            country: String
            id: ID
          }
        `,
      },
      {
        name: "c",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book
            @key(fields: "id")
            @key(fields: "id publisher")
            @key(fields: "id title isbn") {
            id: ID!
            publisher: String
            title: String
            isbn: String
          }

          type BookList @key(fields: "books{id title isbn}") {
            books: [Book!]!
            fav: Book
            last: Book @shareable
          }
        `,
      },
      {
        name: "d",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@external", "@extends", "@shareable"]
            )

          type Author @key(fields: "id name") {
            name: String!
            country: String @shareable
            id: ID!
          }

          type Book @extends @key(fields: "id") {
            author: Author @shareable
            id: ID! @external
          }

          type BookList @key(fields: "books{id}") {
            books: [Book!]!
          }

          type Query {
            allBooks: BookList!
          }
        `,
      },
    ]);

    assertCompositionFailure(result);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('"BookList.fav"'),
      }),
    );
    expect(result.errors).toHaveLength(1);

    result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id title isbn") {
            id: ID!
            title: String
            isbn: String
          }

          type BookList @key(fields: "books{id title isbn}") {
            books: [Book!]!
            last: Book @shareable
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id isbn author{id name country}") {
            id: ID!
            isbn: String
            author: Author
          }

          type BookList
            @key(fields: "books{id isbn author{id name country}} last{id}") {
            books: [Book!]!
            last: Book @shareable
          }

          type Author @key(fields: "id name country") {
            name: String!
            country: String
            id: ID
          }
        `,
      },
      {
        name: "c",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book
            @key(fields: "id")
            @key(fields: "id publisher")
            @key(fields: "id title isbn") {
            id: ID!
            publisher: String
            title: String
            isbn: String
          }

          type BookList
            @key(fields: "books{id publisher} last{id}")
            @key(fields: "books{id title isbn}") {
            books: [Book!]!
            fav: Book
            last: Book @shareable
          }
        `,
      },
      {
        name: "d",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@external", "@extends", "@shareable"]
            )

          type Author @key(fields: "id name") {
            name: String!
            country: String @shareable
            id: ID!
          }

          type Book @extends @key(fields: "id") {
            author: Author @shareable
            id: ID! @external
          }

          type BookList @key(fields: "books{id}") {
            books: [Book!]!
          }

          type Query {
            books: BookList!
          }
        `,
      },
    ]);

    assertCompositionFailure(result);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('"BookList.fav"'),
      }),
    );
    expect(result.errors).toHaveLength(1);

    result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id title isbn") {
            id: ID!
            title: String
            isbn: String
          }

          type BookList @key(fields: "books{id title isbn}") {
            books: [Book!]!
            last: Book @shareable
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@external", "@extends", "@shareable"]
            )

          type Book @extends @key(fields: "id publisher") {
            id: ID! @external
            publisher: String
          }

          type BookList @key(fields: "books{id publisher} last{id}") {
            books: [Book!]!
            last: Book @shareable
          }
        `,
      },
      {
        name: "c",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@shareable"]
            )

          type Book
            @key(fields: "id")
            @key(fields: "id publisher")
            @key(fields: "id title isbn") {
            id: ID!
            publisher: String
            title: String
            isbn: String
          }

          type BookList
            @key(fields: "books{id publisher} last{id}")
            @key(fields: "books{id title isbn}") {
            books: [Book!]!
            fav: Book
            last: Book @shareable
          }
        `,
      },
      {
        name: "d",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.0"
              import: ["@key", "@external", "@extends", "@shareable"]
            )

          type Author @key(fields: "id name") {
            name: String!
            country: String @shareable
            id: String!
          }

          type Book @extends @key(fields: "id") {
            author: Author @shareable
            id: ID! @external
          }

          type BookList @key(fields: "books{id}") {
            books: [Book!]!
          }

          type Query {
            allBooks: BookList!
          }
        `,
      },
    ]);

    assertCompositionFailure(result);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('"BookList.fav"'),
      }),
    );
    expect(result.errors).toHaveLength(1);
  });

  test("@require in interfaceObject", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@interfaceObject"]
            )

          type Product @key(fields: "id") @interfaceObject {
            id: String!
            category: Category!
          }

          type Category @key(fields: "id") {
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
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@interfaceObject", "@requires", "@external"]
            )

          type Product @key(fields: "id") @interfaceObject {
            id: String!
            categoryName: String @requires(fields: "category { name }")
            category: Category! @external
          }

          type Category {
            name: String! @external
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

          interface Product @key(fields: "id") {
            id: String!
          }

          type Tile implements Product @key(fields: "id") {
            id: String!
            size: Int!
          }

          type Query {
            tiles: [Tile!]!
          }
        `,
      },
    ]);

    assertCompositionSuccess(result);
  });

  test("deeply nested interfaces with @requires(fields: <fragment>)", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@external", "@requires"]
              )

            interface Product {
              id: ID!
            }

            interface Location {
              id: ID!
            }

            type Warsaw implements Location @key(fields: "id") {
              id: ID!
              products: [Product!]! @external
            }

            type Lidl @key(fields: "id") {
              id: ID!
              locations: [Location!] @external
              products(location: ID): [Product]!
                @requires(
                  fields: """
                  locations {
                    ... on Warsaw {
                      products {
                        id
                      }
                    }
                  }
                  """
                )
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key"]
              )

            type Query {
              products: [Product]!
            }

            interface Shop @key(fields: "id") {
              id: ID!
            }

            interface Location @key(fields: "id") {
              id: ID!
            }

            type Lidl implements Shop @key(fields: "id") {
              id: ID!
              locations: [Location!]
            }

            type Warsaw implements Location @key(fields: "id") {
              id: ID!
              products: [Product!]!
            }

            interface Product @key(fields: "id") {
              id: ID!
            }

            type Bread implements Product @key(fields: "id") {
              id: ID!
              shops: [Shop!]!
            }
          `,
        },
      ]),
    );
  });

  test("unreachable interface implementation (@interfaceObject) - interface lacks @key", () => {
    // This is a valid composition, as the interface is annotated with @key
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key"]
              )

            interface IData @key(fields: "id") {
              id: String
            }

            type Data implements IData @key(fields: "id") {
              id: String
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

            type Query {
              idata: IData
            }

            type IData @interfaceObject @key(fields: "id") {
              id: String
            }
          `,
        },
      ]),
    );

    // This is an invalid composition, as the interface is NOT annotated with @key
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key"]
            )

          interface IData {
            id: String
          }

          type Data implements IData @key(fields: "id") {
            id: String
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

          type Query {
            idata: IData
          }

          type IData @interfaceObject @key(fields: "id") {
            id: String
          }
        `,
      },
    ]);
    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringMatching(normalizeErrorMessage`
          The following supergraph API query:
          {
            idata {
              ... on Data {
                ...
              }
            }
          }
          cannot be satisfied by the subgraphs because:
          - from subgraph "b": no subgraph can be reached to resolve the implementation type of @interfaceObject type "IData".`),
        extensions: expect.objectContaining({
          code: "SATISFIABILITY_ERROR",
        }),
      }),
    );
  });

  test("make sure moving from @interfaceObject to an implementation of the interface is allowed", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Query {
              products: Product!
            }

            type Product
              @key(fields: "id", resolvable: false)
              @interfaceObject {
              id: ID!
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key"]
              )

            interface Product @key(fields: "id") {
              id: ID!
            }

            type Bread implements Product @key(fields: "id") {
              id: ID!
              name: String!
            }
          `,
        },
      ]),
    );
  });
});
