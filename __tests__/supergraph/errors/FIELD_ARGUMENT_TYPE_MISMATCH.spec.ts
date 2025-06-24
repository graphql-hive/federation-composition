import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("FIELD_ARGUMENT_TYPE_MISMATCH", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              users(type: UserType!): [User!]!
            }

            type User @key(fields: "id") {
              id: ID
              type: UserType
            }

            enum UserType {
              REGULAR
              ADMIN
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            extend type Query {
              users(type: String!): [User!]!
            }

            extend type User @key(fields: "id") {
              id: ID
              type: UserType
            }

            enum UserType {
              REGULAR
              ADMIN
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of argument "Query.users(type:)" is incompatible across subgraphs: it has type "String!" in subgraph "feed" but type "UserType!" in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "FIELD_ARGUMENT_TYPE_MISMATCH",
            }),
          }),
        ]),
      }),
    );
  });

  test("FIELD_ARGUMENT_TYPE_MISMATCH: directive definition arguments do not match", () => {
    const result = api.composeServices([
      {
        name: "a",
        url: "http://a.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD

          type Query {
            a: Int
          }
        `,
      },
      {
        name: "b",
        url: "http://b.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: String) on FIELD

          type Query {
            b: Int
          }
          `,
      },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].toJSON()).toMatchObject({
      message: `Type of argument "@a(n:)" is incompatible across subgraphs: it has type "Int" in subgraph "a" but type "String" in subgraph "b"`,
      extensions: { code: "FIELD_ARGUMENT_TYPE_MISMATCH" },
    });
  });

  test("FIELD_ARGUMENT_TYPE_MISMATCH: directive definition arguments do not match (plural)", () => {
    const result = api.composeServices([
      {
        name: "a",
        url: "http://a.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD

          type Query {
            a: Int
          }
        `,
      },
      {
        name: "b",
        url: "http://b.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: Int) on FIELD

          type Query {
            b: Int
          }
          `,
      },
      {
        name: "c",
        url: "http://c.com",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

          directive @a(n: String) on FIELD

          type Query {
            c: Int
          }
          `,
      },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].toJSON()).toMatchObject({
      message: `Type of argument "@a(n:)" is incompatible across subgraphs: it has type "Int" in subgraphs "a" and "b" but type "String" in subgraph "c"`,
      extensions: { code: "FIELD_ARGUMENT_TYPE_MISMATCH" },
    });
  });
});
