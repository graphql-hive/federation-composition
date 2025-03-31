import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("EXTERNAL_UNUSED on field", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              name: String! @external
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Field "User.name" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_UNUSED",
            }),
          }),
        ]),
      }),
    );
  });

  test("EXTERNAL_UNUSED on type", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@external"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") @external {
              id: ID!
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
              `[users] Field "User.name" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).`,
            ),
            extensions: expect.objectContaining({
              code: "EXTERNAL_UNUSED",
            }),
          }),
        ]),
      }),
    );
  });

  test("Fed v1: No EXTERNAL_UNUSED", () => {
    const result = api.composeServices([
      {
        name: "b",
        typeDefs: graphql`
          type User @key(fields: "id") {
            id: ID!
            nickname: String! @external
            age: Int!
          }

          type Query {
            user: User
          }
        `,
      },
      {
        name: "a",
        typeDefs: graphql`
          type Admin @key(fields: "id") {
            id: ID!
            age: Int!
          }

          type Query {
            admin: Admin
          }
        `,
      },
    ]);
    assertCompositionSuccess(result);
  });

  test("Fed v1: No EXTERNAL_UNUSED when @external is used on a type", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            directive @external on FIELD_DEFINITION | OBJECT
            directive @key(fields: String!) on INTERFACE | OBJECT

            type Query {
              users: [User]
            }

            type User @key(fields: "id") @external {
              id: ID!
              name: String!
            }
          `,
        },
      ]),
    );
  });

  test("Fed v1: No EXTERNAL_UNUSED but EXTERNAL_MISSING_ON_BASE on key field", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID! @external
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
              `Field "User.id" is marked @external on all the subgraphs in which it is listed (subgraph "users").`,
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
          name: "b",
          typeDefs: graphql`
            type User @key(fields: "id") {
              id: ID!
              nick: String! @external
              age: Int!
            }

            type Query {
              user: User
            }
          `,
        },
        {
          name: "a",
          typeDefs: graphql`
            type Admin @key(fields: "id") {
              id: ID!
              age: Int!
            }

            type Query {
              admin: Admin
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
            type User @key(fields: "id") {
              id: ID!
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
            extend type User @key(fields: "nickname") {
              nickname: String! @external
              age: Int!
            }

            type Query {
              user: User
            }
          `,
        },
      ]),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              name: String! @external
            }
          `,
        },
      ]),
    );
  });
});
