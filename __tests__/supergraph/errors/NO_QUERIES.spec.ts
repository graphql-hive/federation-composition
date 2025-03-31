import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("NO_QUERIES", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
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
              `No queries found in any subgraph: a supergraph must have a query root type.`,
            ),
            extensions: expect.objectContaining({
              code: "NO_QUERIES",
            }),
          }),
        ]),
      }),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type User @key(fields: "id") {
              id: ID!
            }

            type Query {
              users: [User]
            }
          `,
        },
      ]),
    );

    assertCompositionSuccess(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])
            
            type User @key(fields: "id") {
              id: ID!
            }

            schema {
              query: RootQuery
            }

            type RootQuery {
              users: [User]
            }
          `,
        },
      ]),
    );
  });
});
