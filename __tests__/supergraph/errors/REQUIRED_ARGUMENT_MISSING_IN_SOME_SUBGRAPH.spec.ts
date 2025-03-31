import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type Query {
              user(id: Int!): User!
            }

            type User @key(fields: "id") {
              id: Int!
            }
          `,
        },
        {
          name: "feed",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@external"])

            type Query {
              user: User!
            }

            type User @key(fields: "id") {
              id: Int! @external
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Argument "Query.user(id:)" is required in some subgraphs but does not appear in all subgraphs: it is required in subgraph "users" but does not appear in subgraph "feed"`,
            ),
            extensions: expect.objectContaining({
              code: "REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH",
            }),
          }),
        ]),
      }),
    );
  });
});
