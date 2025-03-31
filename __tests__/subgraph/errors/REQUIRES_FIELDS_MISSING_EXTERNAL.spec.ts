import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("REQUIRES_FIELDS_MISSING_EXTERNAL", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@requires"]
              )

            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
              internalId: ID!
              profile: Profile @requires(fields: "internalId")
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
              `[users] On field "User.profile", for @requires(fields: "internalId"): field "User.internalId" should not be part of a @requires since it is already provided by this subgraph (it is not marked @external)`,
            ),
            extensions: expect.objectContaining({
              code: "REQUIRES_FIELDS_MISSING_EXTERNAL",
            }),
          }),
        ]),
      }),
    );
  });

  assertCompositionSuccess(
    api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
          type Query {
            users: [User]
          }

          type User @key(fields: "id") {
            id: ID!
            internalId: ID!
            profile: Profile @requires(fields: "internalId")
          }

          type Profile {
            name: String
          }
        `,
      },
    ]),
  );
});
