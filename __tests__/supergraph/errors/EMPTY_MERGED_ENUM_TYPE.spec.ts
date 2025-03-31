import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("EMPTY_MERGED_ENUM_TYPE", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

          type User @shareable {
            name: String!
          }

          enum UserType {
            ADMIN
            UNREGULAR
          }
        `,
      },
      {
        name: "b",
        typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"])

          type User @shareable {
            name: String!
          }

          enum UserType {
            REGULAR
            ANONYMOUS
          }

          type Query {
            users(type: UserType): [User]
          }
        `,
      },
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: `None of the values of enum type "UserType" are defined consistently in all the subgraphs defining that type. As only values common to all subgraphs are merged, this would result in an empty type.`,
            extensions: expect.objectContaining({
              code: "EMPTY_MERGED_ENUM_TYPE",
            }),
          }),
        ]),
      }),
    );
  });
});
