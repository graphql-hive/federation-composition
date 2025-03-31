import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              users: [User]
            }

            interface User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }
          `,
        },
        {
          name: "extra",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type RegisteredUser implements User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }

            extend interface User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }
          `,
        },
        {
          name: "blocked",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type BlockedUser implements User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }

            extend interface User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining(
          satisfiesVersionRange(">= v2.3", version)
            ? [
                // Federation should ignore a situation where an interface has a `@key` field but the subgraph doesn't implement the interface.
                // It should check if at least one subgraph does it and if it does, then it should ignore the missing implementation (or create a hint instead).
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[users] Interface type "User" has a resolvable key (@key(fields: "id")) in subgraph "users" but that subgraph is missing some of the supergraph implementation types of "User". Subgraph "users" should define types "BlockedUser" and "RegisteredUser" (and have them implement "User").`,
                  ),
                  extensions: expect.objectContaining({
                    code: "INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE",
                  }),
                }),
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[extra] Interface type "User" has a resolvable key (@key(fields: "id")) in subgraph "extra" but that subgraph is missing some of the supergraph implementation types of "User". Subgraph "extra" should define type "BlockedUser" (and have it implement "User").`,
                  ),
                  extensions: expect.objectContaining({
                    code: "INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE",
                  }),
                }),
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[blocked] Interface type "User" has a resolvable key (@key(fields: "id")) in subgraph "blocked" but that subgraph is missing some of the supergraph implementation types of "User". Subgraph "blocked" should define type "RegisteredUser" (and have it implement "User").`,
                  ),
                  extensions: expect.objectContaining({
                    code: "INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE",
                  }),
                }),
              ]
            : [
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[users] Cannot use @key on interface "User": @key is not yet supported on interfaces`,
                  ),
                  extensions: expect.objectContaining({
                    code: "KEY_UNSUPPORTED_ON_INTERFACE",
                  }),
                }),
              ],
        ),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
            type Query {
              a: String
            }

            extend interface Node @key(fields: "id") {
              id: ID!
              name: String
            }
          `,
        },
        {
          name: "b",
          typeDefs: graphql`
            type Query {
              b: String
            }

            interface Node {
              id: ID!
            }

            type User implements Node @key(fields: "id") {
              id: ID!
              name: String
            }
          `,
        },
      ]),
    );
  });

  test("INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE: multiple keys", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              users: [User]
            }

            interface User @key(fields: "email") @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }
          `,
        },
        {
          name: "extra",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type RegisteredUser implements User @key(fields: "id") @key(fields: "email") {
              id: ID!
              name: String!
              email: String
            }

            extend interface User @key(fields: "id") @key(fields: "email") {
              id: ID!
              name: String!
              email: String
            }
          `,
        },
        {
          name: "blocked",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type BlockedUser implements User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }

            extend interface User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining(
          satisfiesVersionRange(">= v2.3", version)
            ? [
                // Federation should ignore a situation where an interface has a `@key` field but the subgraph doesn't implement the interface.
                // It should check if at least one subgraph does it and if it does, then it should ignore the missing implementation (or create a hint instead).
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[users] Interface type "User" has a resolvable key (@key(fields: "email")) in subgraph "users" but that subgraph is missing some of the supergraph implementation types of "User". Subgraph "users" should define types "BlockedUser" and "RegisteredUser" (and have them implement "User").`,
                  ),
                  extensions: expect.objectContaining({
                    code: "INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE",
                  }),
                }),
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[extra] Interface type "User" has a resolvable key (@key(fields: "id")) in subgraph "extra" but that subgraph is missing some of the supergraph implementation types of "User". Subgraph "extra" should define type "BlockedUser" (and have it implement "User").`,
                  ),
                  extensions: expect.objectContaining({
                    code: "INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE",
                  }),
                }),
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[blocked] Interface type "User" has a resolvable key (@key(fields: "id")) in subgraph "blocked" but that subgraph is missing some of the supergraph implementation types of "User". Subgraph "blocked" should define type "RegisteredUser" (and have it implement "User").`,
                  ),
                  extensions: expect.objectContaining({
                    code: "INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE",
                  }),
                }),
              ]
            : [
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[users] Cannot use @key on interface "User": @key is not yet supported on interfaces`,
                  ),
                  extensions: expect.objectContaining({
                    code: "KEY_UNSUPPORTED_ON_INTERFACE",
                  }),
                }),
              ],
        ),
      }),
    );
  });

  test("INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE: @interfaceObject + interface is valid", () => {
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

            interface Node @key(fields: "id") {
              id: ID!
            }

            type Query {
              a: String
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

            type Node @key(fields: "id", resolvable: false) @interfaceObject {
              id: ID!
            }

            type Query {
              b: String
            }
          `,
        },
      ]),
    );
  });
});
