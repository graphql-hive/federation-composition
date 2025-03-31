import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("PROVIDES_UNSUPPORTED_ON_INTERFACE", () => {
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
              profile: Profile
            }

            interface User @key(fields: "id") {
              id: ID!
              name: String!
              profile: Profile @provides(fields: "name")
            }

            type Profile {
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
              `[users] Cannot use @provides on field "User.profile" of parent type "User": @provides is not yet supported within interfaces`,
            ),
            extensions: expect.objectContaining({
              code: "PROVIDES_UNSUPPORTED_ON_INTERFACE",
            }),
          }),
        ]),
      }),
    );
  });
});
