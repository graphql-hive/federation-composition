import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("FIELD_TYPE_MISMATCH", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              users: [User!]!
            }

            input Filter {
              ids: [ID!]!
            }

            type User @key(fields: "id") {
              id: ID
              name: String!
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            extend type User @key(fields: "id") {
              id: ID
              name: UserName!
            }

            input Filter {
              ids: [Int!]
            }

            type UserName {
              first: String!
              last: String!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "User.name" is incompatible across subgraphs: it has type "UserName!" in subgraph "feed" but type "String!" in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "FIELD_TYPE_MISMATCH",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "Filter.ids" is incompatible across subgraphs: it has type "[Int!]" in subgraph "feed" but type "[ID!]!" in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "FIELD_TYPE_MISMATCH",
            }),
          }),
        ]),
      }),
    );

    expect(
      api.composeServices([
        {
          name: "auth",
          typeDefs: graphql`
            type User @key(fields: "id") {
              id: ID!
              name: String
            }

            type Query {
              me: User
            }
          `,
        },
        {
          name: "images",
          typeDefs: graphql`
            type Image @key(fields: "url") {
              url: Url
              type: MimeType
            }

            type Query {
              images: [Image]
            }

            extend type User {
              favorite: Image
            }

            scalar Url
            scalar MimeType
          `,
        },
        {
          name: "albums",
          typeDefs: graphql`
            type Album @key(fields: "id") {
              id: ID!
              user: User
              photos: [Image!]
            }

            extend type Image {
              albums: [Album!]
            }

            extend type User {
              albums: [Album!]
              favorite: Album
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "User.favorite" is incompatible across subgraphs: it has type "Album" in subgraph "albums" but type "Image" in subgraph "images"`,
            ),
            extensions: expect.objectContaining({
              code: "FIELD_TYPE_MISMATCH",
            }),
          }),
        ]),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "me",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Query {
              me: User
            }

            type User @key(fields: "id") {
              id: ID!
              tags: [Tag!] @shareable
            }

            type Tag @key(fields: "id") {
              id: ID!
            }
          `,
        },
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              tags: [Tag] @shareable
            }

            type Tag @key(fields: "id") {
              id: ID!
            }
          `,
        },
      ]),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "me",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Query {
              me: User
            }

            type User @key(fields: "id") {
              id: ID!
              tags: [Tag!]! @shareable
            }

            type Tag @key(fields: "id") {
              id: ID!
            }
          `,
        },
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              tags: [Tag]! @shareable
            }

            type Tag @key(fields: "id") {
              id: ID!
            }
          `,
        },
      ]),
    );
  });

  test("FIELD_TYPE_MISMATCH (unions)", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

          type Query {
            foo: Item @shareable
          }

          union Item = A | B

          type A {
            id: ID! @shareable
            name: String @shareable
          }

          type B {
            id: ID!
            name: String!
          }

          type C {
            id: ID! @shareable
            name: String! @shareable
          }
        `,
        },
        {
          name: "bar",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Query {
              foo: A @shareable
            }

            type A {
              id: ID! @shareable
              name: String @shareable
            }
          `,
        },
      ]),
    );

    expect(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])
          
          type Query {
            foo: Item @shareable
          }

          union Item = A | B

          type A {
            id: ID! @shareable
            name: String @shareable
          }

          type B {
            id: ID!
            name: String!
          }

          type C {
            id: ID! @shareable
            name: String! @shareable
          }
        `,
        },
        {
          name: "bar",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

            type Query {
              foo: AnotherItem @shareable
            }

            union AnotherItem = A | C

            type A {
              id: ID! @shareable
              name: String @shareable
            }

            type C {
              id: ID! @shareable
              name: String! @shareable
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type of field "Query.foo" is incompatible across subgraphs: it has type "AnotherItem" in subgraph "bar" but type "Item" in subgraph "foo"`,
            ),
            extensions: expect.objectContaining({
              code: "FIELD_TYPE_MISMATCH",
            }),
          }),
        ]),
      }),
    );
  });
});
