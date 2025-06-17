import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("PROVIDES_ON_NON_OBJECT_FIELD", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@provides"]
              )

            type Query {
              users: [User]
            }

            type RegisteredUser implements User @key(fields: "id") {
              id: ID!
              name: String!
              email: String
            }

            interface User @key(fields: "id") {
              id: ID!
              name: String!
              email: String @provides(fields: "name")
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Invalid @provides directive on field "User.email": field has type "String" which is not a Composite Type`,
            ),
            extensions: expect.objectContaining({
              code: "PROVIDES_ON_NON_OBJECT_FIELD",
            }),
          }),
        ]),
      }),
    );
  });

  test("PROVIDES_ON_NON_OBJECT_FIELD: is not raised for union field with fragment object type selection sets", () => {
    const errors = api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@provides", "@external"]
            )

          type Query {
            result: ResultType
          }

          type EntityA {
            field1: String @external
            field2: String @external
          }

          type EntityB {
            field1: String @external
            field2: String @external
            field3: String @external
          }

          union UnionType = EntityA | EntityB

          type ResultType {
            results: [UnionType!]! @provides(fields: "... on EntityA { field1 field2 } ... on EntityB { field1 field2 field3 }")
          }
        `,
      },
      {
        name: "other",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key", "@shareable"]
            )

          type Query {
            a: EntityA
            b: EntityB
          }

          union UnionType = EntityA | EntityB

          type EntityA @key(fields: "field1") {
            field1: String @shareable
            field2: String @shareable
          }

          type EntityB @key(fields: "field1")  {
            field1: String @shareable
            field2: String @shareable
            field3: String @shareable
          }
        `,
      },
    ]).errors;
    expect(errors).toEqual(undefined);
  });

  test("PROVIDES_ON_NON_OBJECT_FIELD: is not raised for union field with fragment object type selection sets (variant)", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable", "@external"]
            )

          type Query {
            media: [Media] @shareable
          }

          union Media = Book | Movie

          type Book @key(fields: "id") {
            id: ID!
          }

          type Movie @key(fields: "id") {
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
              import: ["@key", "@shareable", "@provides", "@external"]
            )

          type Query {
            media: [Media] @shareable @provides(fields: "... on Book { title }")
          }

          union Media = Book | Movie

          type Book @key(fields: "id") {
            id: ID!
            title: String @external
          }

          type Movie @key(fields: "id") {
            id: ID!
          }
        `,
      },
      {
        name: "c",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id") {
            id: ID!
            title: String @shareable
          }

          type Movie @key(fields: "id") {
            id: ID!
            title: String @shareable
          }
        `,
      },
    ]);
    assertCompositionSuccess(result);
  });
});
