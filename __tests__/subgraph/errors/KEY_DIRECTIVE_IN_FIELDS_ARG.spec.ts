import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("KEY_DIRECTIVE_IN_FIELDS_ARG", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@composeDirective"]
              )
              @link(url: "https://myspecs.dev/testkit/v1.0", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            type User @key(fields: "id name @lowercase ") {
              id: ID!
              name: String
            }

            extend type Query {
              user(id: ID!): User
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          version === "v2.0"
            ? expect.objectContaining({
                message:
                  '[users] Cannot import unknown element "@composeDirective".',
                extensions: expect.objectContaining({
                  code: "INVALID_LINK_DIRECTIVE_USAGE",
                }),
              })
            : expect.objectContaining({
                message: `[users] On type "User", for @key(fields: "id name @lowercase "): cannot have directive applications in the @key(fields:) argument but found @lowercase.`,
                extensions: expect.objectContaining({
                  code: "KEY_DIRECTIVE_IN_FIELDS_ARG",
                }),
              }),
        ]),
      }),
    );
  });
});
