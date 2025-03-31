import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("KEY_FIELDS_HAS_ARGS", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              users: [User]
            }

            type User @key(fields: "id tags") {
              id: ID!
              tags(limit: Int = 10): [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] On type "User", for @key(fields: "id tags"): field User.tags cannot be included because it has arguments (fields with argument are not allowed in @key)`,
            ),
            extensions: expect.objectContaining({
              code: "KEY_FIELDS_HAS_ARGS",
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
            type Query {
              users: [User]
            }

            type User @key(fields: "id tags") {
              id: ID!
              tags(limit: Int = 10): [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] On type "User", for @key(fields: "id tags"): field User.tags cannot be included because it has arguments (fields with argument are not allowed in @key)`,
            ),
            extensions: expect.objectContaining({
              code: "KEY_FIELDS_HAS_ARGS",
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
            type Query {
              users: [User]
            }

            type User @key(fields: "id tags") @key(fields: "id") {
              id: ID!
              tags(tags: [String]): [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] On type "User", for @key(fields: "id tags"): field User.tags cannot be included because it has arguments (fields with argument are not allowed in @key)`,
            ),
            extensions: expect.objectContaining({
              code: "KEY_FIELDS_HAS_ARGS",
            }),
          }),
        ]),
      }),
    );
  });
});
