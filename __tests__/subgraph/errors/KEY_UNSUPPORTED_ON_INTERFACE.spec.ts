import { expect, test } from "vitest";
import {
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("KEY_UNSUPPORTED_ON_INTERFACE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

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
                email: String
              }
            `,
        },
      ]),
    ).toEqual(
      satisfiesVersionRange(">= v2.3", version)
        ? expect.objectContaining({
            supergraphSdl: expect.any(String),
          })
        : expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining(
                  `[users] Cannot use @key on interface "User": @key is not yet supported on interfaces`,
                ),
                extensions: expect.objectContaining({
                  code: "KEY_UNSUPPORTED_ON_INTERFACE",
                }),
              }),
            ]),
          }),
    );
  });
});
