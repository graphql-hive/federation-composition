import { expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  testVersions,
} from "../shared/testkit.js";

testVersions((api, version) => {
  test("error if directive is defined without overlapping locations across subgraphs and all included in @composeDirective", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            type User @key(fields: "id") {
              id: ID!
              name: String! @lowercase
            }

            type Query {
              users: [User]
            }
          `,
      },
      {
        name: "b",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on OBJECT

            extend type User @key(fields: "id") {
              id: ID!
              comments: [Comment]
            }

            type Comment @lowercase {
              id: ID!
              text: String!
            }

            type Query {
              comments: [Comment]
            }
          `,
      },
    ]);

    assertCompositionFailure(result);

    if (version === "v2.0") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[a] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[b] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            api.library === "apollo"
              ? // I don't understand why @apollo/composition gives that error.
                // Why it's not 'Directive "@lowercase" may not be used on OBJECT' instead...
                // What is the logic here...
                'Directive "@lowercase" may not be used on FIELD_DEFINITION.'
              : 'Directive "@lowercase" has no shared locations between subgraphs',
        }),
      );
    }
  });

  test("error if two different major versions of the same spec were used to import the same directive", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/lowercase/v1.1", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            type User @key(fields: "id") {
              id: ID!
              name: String! @lowercase
            }
          `,
      },
      {
        name: "b",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/lowercase/v2.3", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on OBJECT | FIELD_DEFINITION

            extend type User @key(fields: "id") @lowercase {
              id: ID!
              comments: [Comment]
            }

            type Comment @lowercase {
              id: ID!
              text: String!
            }

            type Query {
              comments: [Comment]
            }
          `,
      },
    ]);

    assertCompositionFailure(result);

    if (version === "v2.0") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[a] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[b] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            'Core feature "https://myspecs.dev/lowercase" requested to be merged has major version mismatch across subgraphs',
          extensions: expect.objectContaining({
            code: "DIRECTIVE_COMPOSITION_ERROR",
          }),
        }),
      );
    }
  });

  test("DIRECTIVE_COMPOSITION_ERROR: the same composed directive used under different names (alias)", () => {
    const compose = () =>
      api.composeServices([
        {
          name: "a",
          typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
            @link(url: "https://myspecs.dev/lowercase/v1.0", import: ["@lowercase"])
            @composeDirective(name: "@lowercase")

          directive @lowercase on FIELD_DEFINITION

          type User @key(fields: "id") {
            id: ID!
            name: String! @lowercase
          }
        `,
        },
        {
          name: "b",
          typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
            @link(url: "https://myspecs.dev/lowercase/v1.0", import: [{name: "@lowercase", as: "@lower"}])
            @composeDirective(name: "@lower")

          directive @lower on OBJECT | FIELD_DEFINITION

          extend type User @key(fields: "id") {
            id: ID!
            comments: [Comment]
          }

          type Comment @lower {
            id: ID!
            text: String!
          }

          type Query {
            comments: [Comment]
          }
        `,
        },
        {
          name: "c",
          typeDefs: graphql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
            @link(url: "https://myspecs.dev/lowercase/v1.0", import: [{name: "@lowercase", as: "@lower_case"}])
            @composeDirective(name: "@lower_case")

          directive @lower_case on FIELD_DEFINITION

          extend type User @key(fields: "id") {
            id: ID!
            reviews: [Review]
          }

          type Review {
            id: ID!
            text: String! @lower_case
          }

          type Query {
            reviews: [Review]
          }
        `,
        },
      ]);

    if (version === "v2.0") {
      const result = compose();
      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[a] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[b] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[c] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
    } else if (api.library === "apollo") {
      // Apollo Composition throws an error here, but I don't think we should, it should be a composition error instead.
      expect(compose).toThrowError();
    } else {
      const result = compose();
      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            'Composed directive "@lowercase" has incompatible name across subgraphs: it has name "@lowercase" in subgraph "a" but name "@lower" in subgraph "b" and name "@lower_case" in subgraph "c". Composed directive must have the same name across all subgraphs.',
          extensions: expect.objectContaining({
            code: "DIRECTIVE_COMPOSITION_ERROR",
          }),
        }),
      );
    }
  });

  test("error if two different major versions of the same spec were used to import two different directives", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/casing/v1.1", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            type User @key(fields: "id") {
              id: ID!
              name: String! @lowercase
            }
          `,
      },
      {
        name: "b",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/casing/v2.3", import: ["@uppercase"])
              @composeDirective(name: "@uppercase")

            directive @uppercase on FIELD_DEFINITION

            extend type User @key(fields: "id") {
              id: ID!
              comments: [Comment]
            }

            type Comment {
              id: ID!
              text: String! @uppercase
            }

            type Query {
              comments: [Comment]
            }
          `,
      },
    ]);

    assertCompositionFailure(result);

    if (version === "v2.0") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[a] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[b] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            'Core feature "https://myspecs.dev/casing" requested to be merged has major version mismatch across subgraphs',
          extensions: expect.objectContaining({
            code: "DIRECTIVE_COMPOSITION_ERROR",
          }),
        }),
      );
    }
  });

  test("error if two different major versions of the same spec were used to import two different kind of definitions", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/casing/v1.1", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            type User @key(fields: "id") {
              id: ID!
              name: String! @lowercase
            }
          `,
      },
      {
        name: "b",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key"])
              @link(url: "https://myspecs.dev/casing/v2.3", import: ["UppercaseString"])

            scalar UppercaseString

            extend type User @key(fields: "id") {
              id: ID!
              comments: [Comment]
            }

            type Comment {
              id: ID!
              text: UppercaseString!
            }

            type Query {
              comments: [Comment]
            }
          `,
      },
    ]);

    if (version === "v2.0") {
      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[a] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
    } else {
      assertCompositionSuccess(result);
    }
  });

  test("error if two different specs were used to import the same directive", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/casing/v1.1", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            type User @key(fields: "id") {
              id: ID!
              name: String! @lowercase
            }
          `,
      },
      {
        name: "b",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/lower/v2.3", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            extend type User @key(fields: "id") {
              id: ID!
              comments: [Comment]
            }

            type Comment {
              id: ID!
              text: String! @lowercase
            }

            type Query {
              comments: [Comment]
            }
          `,
      },
    ]);

    assertCompositionFailure(result);

    if (version === "v2.0") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[a] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[b] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            'Composed directive "@lowercase" is not linked by the same core feature in every subgraph',
          extensions: expect.objectContaining({
            code: "DIRECTIVE_COMPOSITION_ERROR",
          }),
        }),
      );
    }
  });

  test("error if two different specs were used to import the same directive (alias)", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/casing/v1.1", import: ["@lowercase"])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            type User @key(fields: "id") {
              id: ID!
              name: String! @lowercase
            }
          `,
      },
      {
        name: "b",
        typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}" import: ["@key", "@composeDirective"])
              @link(url: "https://myspecs.dev/lower/v2.3", import: [{name: "@lower", as: "@lowercase"}])
              @composeDirective(name: "@lowercase")

            directive @lowercase on FIELD_DEFINITION

            extend type User @key(fields: "id") {
              id: ID!
              comments: [Comment]
            }

            type Comment {
              id: ID!
              text: String! @lowercase
            }

            type Query {
              comments: [Comment]
            }
          `,
      },
    ]);

    assertCompositionFailure(result);

    if (version === "v2.0") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[a] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: '[b] Cannot import unknown element "@composeDirective".',
          extensions: expect.objectContaining({
            code: "INVALID_LINK_DIRECTIVE_USAGE",
          }),
        }),
      );
    } else {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            'Composed directive "@lowercase" is not linked by the same core feature in every subgraph',
          extensions: expect.objectContaining({
            code: "DIRECTIVE_COMPOSITION_ERROR",
          }),
        }),
      );
    }
  });
});
