import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("ENUM_VALUE_MISMATCH", () => {
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
              id: ID
              type: UserType
            }

            enum UserType {
              REGULAR
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
            
            type Query {
              usersByType(type: UserType): [User!]!
            }

            extend type User @key(fields: "id") {
              id: ID
              type: UserType
            }

            enum UserType {
              ANONYMOUS
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Enum type "UserType" is used as both input type (for example, as type of "Query.usersByType(type:)") and output type (for example, as type of "User.type"), but value "ANONYMOUS" is not defined in all the subgraphs defining "UserType": "ANONYMOUS" is defined in subgraph "feed" but not in subgraph "users"`,
            ),
            extensions: expect.objectContaining({
              code: "ENUM_VALUE_MISMATCH",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `Enum type "UserType" is used as both input type (for example, as type of "Query.usersByType(type:)") and output type (for example, as type of "User.type"), but value "REGULAR" is not defined in all the subgraphs defining "UserType": "REGULAR" is defined in subgraph "users" but not in subgraph "feed"`,
            ),
            extensions: expect.objectContaining({
              code: "ENUM_VALUE_MISMATCH",
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
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@shareable"])
            
            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID
              type: UserType @shareable
            }

            enum UserType {
              REGULAR
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@inaccessible", "@shareable"])
            
            type Query {
              usersByType(type: UserType): [User!]!
            }

            extend type User @key(fields: "id") {
              id: ID
              type: UserType @shareable
            }

            enum UserType {
              ANONYMOUS @inaccessible
              REGULAR
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        supergraphSdl: expect.any(String),
      }),
    );
  });
});
