import { expect, test } from "vitest";
import {
  assertCompositionFailure,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("INTERFACE_FIELD_NO_IMPLEM (entity)", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            type Query {
              users: [User]
            }

            type RegisteredUser implements User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }

            interface User {
              id: ID!
              name: String!
              email: String
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            interface User {
              id: ID!
              name: String!
            }

            type Author implements User @key(fields: "id") {
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
              `Interface field "User.email" is declared in subgraph "users" but type "Author", which implements "User" ${api.library === "apollo" ? "only " : ""}in subgraph "feed" does not have field "email".`,
            ),
            extensions: expect.objectContaining({
              code: "INTERFACE_FIELD_NO_IMPLEM",
            }),
          }),
        ]),
      }),
    );
  });

  test("INTERFACE_FIELD_NO_IMPLEM (data)", () => {
    expect(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
            type Query {
              foo: Foo
            }

            type Foo implements Person {
              name: String
              age: Int
            }

            interface Person {
              name: String
              age: Int
            }
          `,
        },
        {
          name: "bar",
          typeDefs: graphql`
            type Query {
              bar: Bar
            }

            type Bar implements Person {
              name: String
            }

            interface Person {
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
              `Interface field "Person.age" is declared in subgraph "foo" but type "Bar", which implements "Person" ${api.library === "apollo" ? "only " : ""}in subgraph "bar" does not have field "age".`,
            ),
            extensions: expect.objectContaining({
              code: "INTERFACE_FIELD_NO_IMPLEM",
            }),
          }),
        ]),
      }),
    );
  });

  test("Ignoring INTERFACE_FIELD_NO_IMPLEM when TYPE_KIND_MISMATCH detected", () => {
    const result = api.composeServices([
      {
        name: "cars",
        typeDefs: graphql`
          type Query {
            foo(id: ID!): String
          }

          interface Vehicle {
            id: ID!
          }

          type Car implements Vehicle {
            id: ID!
          }
        `,
      },
      {
        name: "vehicles",
        typeDefs: graphql`
          type Vehicle {
            id: ID!
          }
        `,
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message:
          'Type "Vehicle" has mismatched kind: it is defined as Interface Type in subgraph "cars" but Object Type in subgraph "vehicles"',
        extensions: expect.objectContaining({
          code: "TYPE_KIND_MISMATCH",
        }),
      }),
    );
  });
});
