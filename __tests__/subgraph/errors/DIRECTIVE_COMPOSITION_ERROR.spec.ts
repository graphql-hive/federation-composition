import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("DIRECTIVE_COMPOSITION_ERROR", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/link/v1.0")
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@composeDirective"]
              )
              @link(url: "https://myspecs.dev/hello/v1.0", import: ["@hello"])
              @composeDirective(name: "@hello")

            type Query {
              words: [String!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          version === "v2.0"
            ? api.library === "apollo"
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
                })
            : expect.objectContaining({
                message: expect.stringContaining(
                  `Could not find matching directive definition for argument to @composeDirective "@hello" in subgraph "users".`,
                ),
                extensions: expect.objectContaining({
                  code: "DIRECTIVE_COMPOSITION_ERROR",
                }),
              }),
        ]),
      }),
    );

    expect(
      api.composeServices([
        {
          name: "foo",
          typeDefs: graphql`
          directive @composeDirective(name: String!) repeatable on SCHEMA
          directive @block on FIELD_DEFINITION
          extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@composeDirective"]) @composeDirective(name: "@block")

         type Query {
          foo: String @block
         } 
        `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          version === "v2.0"
            ? expect.any(Object)
            : expect.objectContaining({
                message: expect.stringContaining(
                  `Directive "@block" in subgraph "foo" cannot be composed because it is not a member of a core feature`,
                ),
                extensions: expect.objectContaining({
                  code: "DIRECTIVE_COMPOSITION_ERROR",
                }),
              }),
        ]),
      }),
    );
  });
});
