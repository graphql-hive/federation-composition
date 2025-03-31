import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("INVALID_SUBGRAPH_NAME", () => {
    expect(
      api.composeServices([
        {
          name: "_",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key"]
              )
            
            type Query {
              users: [User]
            }

            type User @key(fields: "id") {
              id: ID!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[_] Invalid name _ for a subgraph: this name is reserved`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_SUBGRAPH_NAME",
            }),
          }),
        ]),
      }),
    );
  });
});
