import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("KEY_INVALID_FIELDS_TYPE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              users: [User!]!
            }

            type User @key(fields: true) {
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
              `[users] On type "User", for @key(fields: true): Invalid value for argument "fields": must be a string.`,
            ),
            extensions: expect.objectContaining({
              code: "KEY_INVALID_FIELDS_TYPE",
            }),
          }),
        ]),
      }),
    );
  });

  assertCompositionSuccess(
    api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          type User @key(fields: ["id", "uuid"]) {
            id: ID!
            uuid: ID!
            name: String
          }

          type Query {
            users: [User]
          }
        `,
      },
    ]),
  );
});
