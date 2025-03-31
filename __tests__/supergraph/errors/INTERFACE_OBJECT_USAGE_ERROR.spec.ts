import { expect, test } from "vitest";
import {
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("INTERFACE_OBJECT_USAGE_ERROR", () => {
    expect(
      api.composeServices([
        {
          name: "book",
          typeDefs: graphql`
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            interface Media @key(fields: "id") {
              id: ID!
              title: String!
            }

            type Book implements Media @key(fields: "id") {
              id: ID!
              title: String!
            }
          `,
        },
        {
          name: "review",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@interfaceObject"]
              )

            type Media @interfaceObject {
              id: ID!
              reviews: [Review!]!
            }

            type Review {
              score: Int!
            }

            type Query {
              topRatedMedia: [Media!]!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          satisfiesVersionRange(">= v2.3", version)
            ? expect.objectContaining({
                message: expect.stringContaining(
                  `The @interfaceObject directive can only be applied to entity types but type "Media" has no @key in this subgraph.`,
                ),
                extensions: expect.objectContaining({
                  code: "INTERFACE_OBJECT_USAGE_ERROR",
                }),
              })
            : expect.objectContaining({
                message: expect.stringContaining(
                  `[review] Cannot import unknown element "@interfaceObject".`,
                ),
                extensions: expect.objectContaining({
                  code: "INVALID_LINK_DIRECTIVE_USAGE",
                }),
              }),
        ]),
      }),
    );

    // KNOW: detect if the `@interfaceObject` directive is applied to a type with `@key` directive
  });
});
