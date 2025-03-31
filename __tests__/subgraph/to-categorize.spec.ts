import { expect, test } from "vitest";
import {
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../shared/testkit.js";

testVersions((api, version) => {
  test("valid - composed directive gets an empty object instead of { name }", () => {
    const result = api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/link/v1.0")
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@composeDirective"]
              )
              @link(url: "https://myspecs.dev/hello/v1.0", import: ["@hello", "Person"])
              @composeDirective(name: "@hello")

            directive @hello(person: Person) on FIELD_DEFINITION

            input Person {
              name: String!
            }

            type Query {
              words: [String!]! @hello(person: {})
            }
          `,
      },
    ]);

    if (version === "v2.0") {
      expect(result).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            api.library === "apollo"
              ? // Apollo is weird here and thinks that the schema is a Federation v1 schema, even though it's not (@link usage).
                // It also has a typo :)
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[users] Unknown directive "@composeDirective". If you meant the "@composeDirective" federation 2 directive, note that this schema is a federation 1 schema. To be a federation 2 schema, it needs to @link to the federation specifcation v2.`,
                  ),
                  extensions: expect.objectContaining({
                    code: "INVALID_GRAPHQL",
                  }),
                })
              : // We don't want to follow Apollo's example here as returning the INVALID_LINK_DIRECTIVE_USAGE error makes more sense.
                expect.objectContaining({
                  message: expect.stringContaining(
                    `[users] Cannot import unknown element "@composeDirective".`,
                  ),
                  extensions: expect.objectContaining({
                    code: "INVALID_LINK_DIRECTIVE_USAGE",
                  }),
                }),
          ]),
        }),
      );
    } else {
      assertCompositionSuccess(result);
    }
  });
});
