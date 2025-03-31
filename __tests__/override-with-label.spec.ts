import { parse, print } from "graphql";
import { describe, expect, test } from "vitest";
import { sortSDL } from "../src/graphql/sort-sdl.js";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  satisfiesVersionRange,
  testVersions,
} from "./shared/testkit.js";

expect.addSnapshotSerializer({
  serialize: (value) => print(sortSDL(parse(value as string))),
  test: (value) =>
    typeof value === "string" && value.includes("specs.apollo.dev"),
});

describe("@override(label:)", () => {
  testVersions((api, version) => {
    const composeServices = api.composeServices;

    if (satisfiesVersionRange("< v2.7", version)) {
      test("not available, raise na error", () => {
        let result = composeServices([
          {
            name: "foo",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@override"]
                )

              type Query {
                foo: User
              }

              type User @key(fields: "id") {
                id: ID
                name: String @override(from: "bar", label: "public")
              }
            `),
          },
          {
            name: "bar",
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type Query {
                bar: User
              }

              type User @key(fields: "id") {
                id: ID
                name: String
              }
            `),
          },
        ]);

        assertCompositionFailure(result);

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[foo] Unknown argument "label" on directive "@override".',
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
        );
      });
      return;
    }

    test("available, allow to use", () => {
      // User is available in all subgraphs
      let result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

            type Query {
              foo: User
            }

            type User @key(fields: "id") {
              id: ID
              name: String @override(from: "bar", label: "public")
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

              type Query {
                bar: User
              }

              type User @key(fields: "id") {
                id: ID
                name: String
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: BAR, key: "id")
          @join__type(graph: FOO, key: "id") {
          id: ID
          name: String
            @join__field(graph: BAR, overrideLabel: "public")
            @join__field(graph: FOO, override: "bar", overrideLabel: "public")
        }
      `);

      // User is NOT available in all subgraphs
      result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override", "@shareable"])

            type Query {
              foo: User
            }

            type User @key(fields: "id") {
              id: ID
              name: String @override(from: "bar", label: "public") @shareable
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

              type Query {
                bar: User
              }

              type User @key(fields: "id") {
                id: ID
                name: String @shareable
              }
            `),
        },
        {
          name: "baz",
          typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

              type User @key(fields: "id") {
                id: ID
                name: String @shareable
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: BAR, key: "id")
          @join__type(graph: BAZ, key: "id")
          @join__type(graph: FOO, key: "id") {
          id: ID
          name: String
            @join__field(graph: BAZ)
            @join__field(graph: BAR, overrideLabel: "public")
            @join__field(graph: FOO, override: "bar", overrideLabel: "public")
        }
      `);

      result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override", "@shareable"])

            type Query {
              foo: User
            }

            type User @key(fields: "id") {
              id: ID
              name: String @override(from: "bar", label: "public") @shareable
            }
          `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

              type Query {
                bar: User
              }

              type User @key(fields: "id") {
                id: ID
                name: String @shareable
              }
            `),
        },
        {
          name: "baz",
          typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable"])

              type User @key(fields: "id") {
                id: ID
              }
            `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toContainGraphQL(/* GraphQL */ `
        type User
          @join__type(graph: BAR, key: "id")
          @join__type(graph: BAZ, key: "id")
          @join__type(graph: FOO, key: "id") {
          id: ID
          name: String
            @join__field(graph: BAR, overrideLabel: "public")
            @join__field(graph: FOO, override: "bar", overrideLabel: "public")
        }
      `);
    });

    test.each([
      "percent(-11)",
      "percent(-1.1)",
      "percent(-1)", // below 0
      "percent(-0)", // :)
      "percent(+0)", // :)
      "percent(+0.00)", // :)
      "percent(-0.00)", // :)
      // 'percent(0)', // looks like it has to be a float
      // 'percent(100)', // looks like it has to be a float
      // 'percent(1)', // looks like it has to be a float
      "percent(1.123456789)", // more than 8 fraction digits
      "percent(101)", // over 100
      "0foo",
      "_foo",
      "-foo",
      ":foo",
      ".foo",
      "/foo",
      "!foo",
      "foo%",
      "foo(",
      "foo)",
      "foo[",
      "foo]",
      "foo{",
      "foo}",
      "foo<",
      "foo>",
      "foo=",
      "foo?",
      "foo!",
      "foo@",
      "foo#",
      "foo$",
      "foo^",
      "foo&",
      "foo*",
      "foo~",
      "foo`",
      "foo|",
      "foo;",
      "foo,",
      "foo ",
      " foo",
      " 0",
    ])(`label: "%s" should fail`, (label) => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

          type Query {
            foo: User
          }

          type User @key(fields: "id") {
            id: ID
            name: String @override(from: "bar", label: "${label}")
          }
        `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              bar: User
            }

            type User @key(fields: "id") {
              id: ID
              name: String
            }
          `),
        },
      ]);

      assertCompositionFailure(result);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: `${api.injectIf("guild", "[foo] ")}Invalid @override label "${label}" on field "User.name" on subgraph "foo": labels must start with a letter and after that may contain alphanumerics, underscores, minuses, colons, periods, or slashes. Alternatively, labels may be of the form "percent(x)" where x is a float between 0-100 inclusive.`,
          extensions: expect.objectContaining({
            code: "OVERRIDE_LABEL_INVALID",
          }),
        }),
      );
    });

    test.each([
      "percent(0.00)", // inclusive
      "percent(1.00)",
      "percent(1.12345678)", // 8 fraction digits is allowed
      "percent(100.00)", // inclusive
      "foo",
      "foo_bar",
      "percent1",
      "f0",
      "f_",
      "f-",
      "f:",
      "f.",
      "f/",
    ])(`label: "%s" should pass`, (label) => {
      const result = composeServices([
        {
          name: "foo",
          typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

          type Query {
            foo: User
          }

          type User @key(fields: "id") {
            id: ID
            name: String @override(from: "bar", label: "${label}")
          }
        `),
        },
        {
          name: "bar",
          typeDefs: parse(/* GraphQL */ `
            extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

            type Query {
              bar: User
            }

            type User @key(fields: "id") {
              id: ID
              name: String
            }
          `),
        },
      ]);

      if (label === "percent(100.00)" && api.library === "apollo") {
        // Apollo does not accept 100.00 float, but it does support 100
        assertCompositionFailure(result);
        return;
      }

      assertCompositionSuccess(result);
    });

    test("should detect unsatisfiable paths", () => {
      let result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

          type Query {
            user(id: ID!): User
          }

          type User @key(fields: "id") {
            id: ID!
            group: Group @override(from: "b") # no label
          }

          type Group @key(fields: "id") {
            id: ID!
            level: Int
          }
        `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@requires", "@external", "@override"])

          type User @key(fields: "id") {
            id: ID!
            group: Group!
            groupLevel: ID! @requires(fields: "group { level }")
          }

          type Group @key(fields: "id") {
            id: ID
            level: Int @external
          }
        `),
        },
      ]);

      assertCompositionSuccess(result);

      result = composeServices([
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

          type Query {
            user(id: ID!): User
          }

          type User @key(fields: "id") {
            id: ID!
            group: Group @override(from: "b", label: "public")
          }

          type Group @key(fields: "id") {
            id: ID!
            level: Int
          }
        `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@requires", "@external", "@override"])

          type User @key(fields: "id") {
            id: ID!
            group: Group!
            groupLevel: ID! @requires(fields: "group { level }")
          }

          type Group @key(fields: "id") {
            id: ID
            level: Int @external
          }
        `),
        },
      ]);

      assertCompositionFailure(result);
    });
  });
});
