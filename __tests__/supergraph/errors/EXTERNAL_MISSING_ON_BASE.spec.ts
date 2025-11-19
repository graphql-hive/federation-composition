import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("EXTERNAL_MISSING_ON_BASE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@requires"])

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID
              profile: Profile @external
              friends: [User] @requires(fields: "profile { name }")
            }

            type Profile {
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
              `Field "User.profile" is marked @external on all the subgraphs in which it is listed (subgraph "users").`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_MISSING_ON_BASE",
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
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@requires", "@extends"])

            type Query {
              users: [User]
            }

            type User @extends @key(fields: "userId") {
              userId: String @external
              name: String @external
              fullName: String @requires(fields: "name")
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "User.name" is marked @external on all the subgraphs in which it is listed (subgraph "users").`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_MISSING_ON_BASE",
            }),
          }),
        ]),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external", "@extends"])

            type Query {
              users: [User]
            }

            type User @extends @key(fields: "id") {
              id: ID! @external
            }
          `,
        },
      ]),
    );
  });

  test("Fed v1: EXTERNAL_MISSING_ON_BASE", () => {
    expect(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type User @extends @key(fields: "id") {
              internalId: String @external
              id: ID! @external
              comments: [String] @requires(fields: "internalId")
            }

            type Query {
              word: String
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type User @extends @key(fields: "id") {
              tags: [String!]!
              id: ID! @external
            }

            type Query {
              sentence: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "User.internalId" is marked @external on all the subgraphs in which it is listed (subgraph "a").`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_MISSING_ON_BASE",
            }),
          }),
        ]),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type User @extends @key(fields: "id") {
              internalId: String @external
              id: ID! @external
            }

            type Query {
              word: String
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type User @extends @key(fields: "id") {
              tags: [String!]!
              id: ID! @external
            }

            type Query {
              sentence: [String]
            }
          `,
        },
      ]),
    );
  });

  test("Field can be '@external'-only if it is a '@key' and the object type uses 'extend'", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external", "@requires"]
              )

            extend type SharedType @key(fields: "id") {
              id: ID! @external
              dependency: String! @external
            }

            extend type SharedType @key(fields: "secondId") {
              secondId: ID! @external
              someFieldThatRequiresDependency: String
                @requires(fields: "dependency")
            }

            type Query {
              a: String!
            }
          `,
      },
      {
        name: "b",
        typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key"]
              )

            type SharedType @key(fields: "secondId") {
              type: String!
              secondId: ID!
              dependency: String!
            }

            type Query {
              c: String!
            }
          `,
      },
    ]);

    expect(result.errors).toBeUndefined();
  });

  test("@external in types, defined by @interfaceObject", () => {
    if (satisfiesVersionRange("< v2.3", version)) {
      // @interfaceObject is not supported before v2.3
      return;
    }

    const result = api.composeServices(
      [
        {
          name: "a",
          typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@interfaceObject"]
            )

          type Query {
            animal: Animal
          }

          type Animal @interfaceObject @key(fields: "id") {
            id: ID!
            age: Int
          }
        `,
        },
        {
          name: "b",
          typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@external"]
            )

          interface Mammal {
            id: ID!
            age: Int
          }

          interface Animal implements Mammal @key(fields: "id") {
            id: ID!
            origin: String
            age: Int
          }

          type Dog implements Mammal & Animal @key(fields: "id") {
            id: ID!
            origin: String
            age: Int @external
          }
        `,
        },
      ],
      {},
      true,
    );

    assertCompositionSuccess(result);
  });
});
