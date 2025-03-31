import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("INVALID_SHAREABLE_USAGE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

            type User implements Node {
              id: ID!
              name: String
            }

            interface Node {
              id: ID! @shareable
            }

            type Query {
              user: User
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Invalid use of @shareable on field "Node.id": only object type fields can be marked with @shareable`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_SHAREABLE_USAGE",
            }),
          }),
        ]),
      }),
    );
  });
});
