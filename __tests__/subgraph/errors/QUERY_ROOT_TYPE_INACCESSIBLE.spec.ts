import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("QUERY_ROOT_TYPE_INACCESSIBLE", () => {
    expect(
      api.composeServices([
        {
          name: "book",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible"]
              )

            extend schema {
              query: RootQuery
            }

            type RootQuery @inaccessible {
              words: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "Query" is @inaccessible but is the root query type, which must be in the API schema.`,
            ),
            extensions: expect.objectContaining({
              code: "QUERY_ROOT_TYPE_INACCESSIBLE",
            }),
          }),
        ]),
      }),
    );

    expect(
      api.composeServices([
        {
          name: "book",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible"]
              )

            type Query @inaccessible {
              words: [String]
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Type "Query" is @inaccessible but is the root query type, which must be in the API schema.`,
            ),
            extensions: expect.objectContaining({
              code: "QUERY_ROOT_TYPE_INACCESSIBLE",
            }),
          }),
        ]),
      }),
    );
  });
});
