import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("ROOT_MUTATION_USED", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Mutation {
              users: [User!]!
            }

            schema {
              mutation: RootMutation
            }

            type RootMutation {
              users: [User!]!
            }

            type User @key(fields: "id") {
              id: ID
              friends: [User!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `The schema has a type named "Mutation" but it is not set as the mutation root type ("RootMutation" is instead): this is not supported by federation. If a root type does not use its default name, there should be no other type with that default name.`,
            ),
            extensions: expect.objectContaining({
              code: "ROOT_MUTATION_USED",
            }),
          }),
        ]),
      }),
    );
  });
});
