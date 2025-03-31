import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("TYPE_DEFINITION_INVALID", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "FieldSet"])

            directive @key(
              fields: FieldSet!
              resolvable: Boolean = true
            ) repeatable on OBJECT | INTERFACE

            input FieldSet {
              fields: [String!]!
            }

            type User @key(fields: "id name ") {
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
          expect.objectContaining({
            message: `[users] Invalid definition for type FieldSet: FieldSet should be a ScalarType but is defined as a InputObjectType`,
            extensions: expect.objectContaining({
              code: "TYPE_DEFINITION_INVALID",
            }),
          }),
        ]),
      }),
    );
  });
});
