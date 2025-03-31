import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("ONLY_INACCESSIBLE_CHILDREN", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible", "@requires"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id internalId") {
              id: ID!
              internalId: ID! @inaccessible
            }

            type Profile {
              name: String @inaccessible
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "Profile" is in the API schema but all of its fields are @inaccessible.`,
            ),
            extensions: expect.objectContaining({
              code: "ONLY_INACCESSIBLE_CHILDREN",
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
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              profile: Profile! @inaccessible
            }

            type Profile @inaccessible {
              name: String @inaccessible
              details: Details
              address: Address @inaccessible
            }

            type Details @inaccessible {
              age: Int
            }

            """
            Address has all its fields inaccessible, but it's also referenced by a field that is not inaccessible as well.
            It is never in the API schema, except as part of introspection, but it's still reported as ONLY_INACCESSIBLE_CHILDREN error...
            """
            type Address {
              street: String @inaccessible
              postalCode: String @inaccessible
            }
          `,
        },
        {
          name: "products",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key"]
              )

            type Query {
              products: [Product]
            }

            type Product @key(fields: "id") {
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
              `Type "Address" is in the API schema but all of its fields are @inaccessible.`,
            ),
            extensions: expect.objectContaining({
              code: "ONLY_INACCESSIBLE_CHILDREN",
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
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible", "@requires"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id internalId") {
              id: ID!
              internalId: ID! @inaccessible
            }

            type Profile @inaccessible {
              name: String
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
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              profile: Profile! @inaccessible
            }

            type Profile @inaccessible {
              name: String @inaccessible
              details: Details
              address: Address @inaccessible
            }

            type Details @inaccessible {
              age: Int
            }

            type Address @inaccessible {
              street: String @inaccessible
              postalCode: String @inaccessible
            }
          `,
        },
        {
          name: "products",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key"]
              )

            type Query {
              products: [Product]
            }

            type Product @key(fields: "id") {
              id: ID!
              name: String!
            }
          `,
        },
      ]),
    );

    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@inaccessible"]
              )

            type Query {
              users: [User]
            }

            interface Node @key(fields: "id") {
              id: ID @inaccessible
            }

            type User implements Node @key(fields: "id") {
              id: ID!
            }
          `,
        },
        {
          name: "products",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@interfaceObject"]
              )

            type Node @key(fields: "id", resolvable: false) @interfaceObject {
              id: ID
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "Node" is in the API schema but all of its fields are @inaccessible.`,
            ),
            extensions: expect.objectContaining({
              code: "ONLY_INACCESSIBLE_CHILDREN",
            }),
          }),
        ]),
      }),
    );
  });
});
