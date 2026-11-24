import { expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("INVALID_GRAPHQL - invalid value for fields (input object)", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.2"
                import: ["@key"]
              )

            directive @key(
              fields: FieldSet!
              resolvable: Boolean = true
            ) repeatable on OBJECT | INTERFACE

            input FieldSet {
              fields: [String!]!
            }

            type User @key(fields: "id name ") {
              id: ID!
              name: String
            }

            extend type Query {
              user(id: ID!): User
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: `[users] Invalid value for "@key(fields:)" of type "FieldSet!" in application of "@key" to "User".`,
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
        ]),
      }),
    );
  });

  test("INVALID_GRAPHQL - @provides without fields", () => {
    expect(
      api.composeServices([
        {
          name: "billing",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@provides"]
              )

            type Payment @key(fields: "id") {
              id: ID!
              amount: Int!
            }

            type Invoice @key(fields: "id") {
              id: ID!
              amount: Int!
              payment: Payment @provides
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              // TODO: federation__FieldSet for Apollo `String!` for guild but it should be the same
              `Argument "@provides(fields:)" of type "${
                api.library === "guild" ? "FieldSet" : "federation__FieldSet"
              }!" is required, but it was not provided.`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
        ]),
      }),
    );
  });

  test("INVALID_GRAPHQL - unknown type", () => {
    expect(
      api.composeServices([
        {
          name: "users",
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
              id: ID
              profile: Profile
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(`[users] Unknown type Profile`),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
        ]),
      }),
    );
  });

  test("INVALID_GRAPHQL - default value", () => {
    const result = api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key"]
            )

          type Query {
            users(role: Role = "Oopsie"): [User]
            allUsers(role: Role = OOPSIE): [User]
            usersByIDs(ids: [ID!]! = []): [User]
            usersByID(id: ID! = NULL): [User]
            usersByID2(id: ID! = null): [User]
            filterUsers(filter: Filter = {
              role: "Oopsie"
            }): [User]
          }

          input Filter {
            role: Role = OOPSIE
          }

          enum Role {
            ADMIN
            USER
          }

          type User @key(fields: "id") {
            id: ID
            name: String
          }
        `,
      },
    ]);
    assertCompositionFailure(result);

    expect(result).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Invalid default value (got: "Oopsie") provided for argument Query.users(role:) of type Role.`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Invalid default value (got: ${
                api.library === "apollo" ? `"OOPSIE"` : "OOPSIE"
              }) provided for argument Query.allUsers(role:) of type Role.`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Invalid default value (got: {role: "Oopsie"}) provided for argument Query.filterUsers(filter:) of type Filter.`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Invalid default value (got: ${
                api.library === "apollo" ? `"OOPSIE"` : "OOPSIE"
              }) provided for input field Filter.role of type Role.`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
          expect.objectContaining({
            message: expect.stringContaining(
              `[users] Invalid default value (got: null) provided for argument Query.usersByID2(id:) of type ID!.`,
            ),
            extensions: expect.objectContaining({
              code: "INVALID_GRAPHQL",
            }),
          }),
        ]),
      }),
    );

    if (api.library === "apollo") {
      // Apollo has less strict validation for default values.
      return;
    }

    expect(result.errors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(`Query.usersByIDs(ids:)`),
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      ]),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(`Query.usersByID(id:)`),
          extensions: expect.objectContaining({
            code: "INVALID_GRAPHQL",
          }),
        }),
      ]),
    );
  });

  test("INVALID_GRAPHQL - composeDirective gets a Boolean instead of String", () => {
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
              @composeDirective(name: true)

            directive @hello(name: String) on FIELD_DEFINITION

            type Query {
              words: [String!]! @hello(name: true)
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining(
          version === "v2.0"
            ? api.library === "apollo"
              ? // Apollo is weird here and thinks that the schema is a Federation v1 schema, even though it's not (@link usage).
                // It also has a typo :)
                [
                  expect.objectContaining({
                    message: expect.stringContaining(
                      `[users] Unknown directive "@composeDirective". If you meant the "@composeDirective" federation 2 directive, note that this schema is a federation 1 schema. To be a federation 2 schema, it needs to @link to the federation specifcation v2.`,
                    ),
                    extensions: expect.objectContaining({
                      code: "INVALID_GRAPHQL",
                    }),
                  }),
                ]
              : // We don't want to follow Apollo's example here as returning the INVALID_LINK_DIRECTIVE_USAGE error makes more sense.
                [
                  expect.objectContaining({
                    message: expect.stringContaining(
                      `[users] Cannot import unknown element "@composeDirective".`,
                    ),
                    extensions: expect.objectContaining({
                      code: "INVALID_LINK_DIRECTIVE_USAGE",
                    }),
                  }),
                ]
            : [
                expect.objectContaining({
                  message: `[users] Invalid value for "@composeDirective(name:)" of type "${
                    api.library === "apollo" ? "String" : "String!"
                  }" in application of "@composeDirective" to "schema".`,
                  extensions: expect.objectContaining({
                    code: "INVALID_GRAPHQL",
                  }),
                }),
                expect.objectContaining({
                  message: `[users] Invalid value for "@hello(name:)" of type "String" in application of "@hello" to "Query.words".`,
                  extensions: expect.objectContaining({
                    code: "INVALID_GRAPHQL",
                  }),
                }),
              ],
        ),
      }),
    );
  });

  test("INVALID_GRAPHQL - composed directive gets an Int instead of Input type", () => {
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
              @link(url: "https://myspecs.dev/hello/v1.0", import: ["@hello", "Person"])
              @composeDirective(name: "@hello")

            directive @hello(person: Person) on FIELD_DEFINITION

            input Person {
              name: String!
            }

            type Query {
              words: [String!]! @hello(person: 123)
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
                message: `[users] Invalid value for "@hello(person:)" of type "Person" in application of "@hello" to "Query.words".`,
                extensions: expect.objectContaining({
                  code: "INVALID_GRAPHQL",
                }),
              }),
        ]),
      }),
    );
  });

  test("INVALID_GRAPHQL - composed directive gets a Float instead of Input type", () => {
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
              @link(url: "https://myspecs.dev/hello/v1.0", import: ["@hello", "Person"])
              @composeDirective(name: "@hello")

            directive @hello(person: Person) on FIELD_DEFINITION

            input Person {
              name: String!
            }

            type Query {
              words: [String!]! @hello(person: 123.4)
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
                message: `[users] Invalid value for "@hello(person:)" of type "Person" in application of "@hello" to "Query.words".`,
                extensions: expect.objectContaining({
                  code: "INVALID_GRAPHQL",
                }),
              }),
        ]),
      }),
    );
  });

  test("No INVALID_GRAPHQL when directive gets [] instead of [STRING]", () => {
    assertCompositionSuccess(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@shareable"]
            )

          directive @hello(names: [String]) on FIELD_DEFINITION

          type Query {
            words: [String!]! @shareable @hello(names: [])
          }
        `,
        },
      ]),
    );
  });

  test("directive overwritten specified directive (like @deprecated) on wrong location", () => {
    assertCompositionFailure(
      api.composeServices([
        {
          name: "mono",
          typeDefs: graphql`
            schema
              @link(url: "https://specs.apollo.dev/link/v1.0")
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@shareable"]) {
              query: Query
            }

            directive @deprecated(reason: String = "No longer supported") on FIELD_DEFINITION

            directive @shareable repeatable on OBJECT | FIELD_DEFINITION

            type Query @shareable {
              view(input: Input): View!
            }

            type View @shareable {
              user: String
              post: String!
            }

            input Input {
              input: String @deprecated(reason: "impossibru")
            }
          `,
        },
      ]),
    );
  });

  test("interface field -> object field subtype", () => {
    const result = api.composeServices([
      {
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.6"
              import: ["@key"]
            )

          type Query {
            a: Admin
          }

          type Admin implements Node {
            id: ID
          }

          interface Node {
            id: ID!
          }
        `,
        name: "a",
      },
    ]);

    assertCompositionFailure(result);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message:
          "[a] Interface field Node.id expects type ID! but Admin.id of type ID is not a proper subtype.",
        extensions: expect.objectContaining({ code: "INVALID_GRAPHQL" }),
      }),
    );
  });
});

testVersions((api, version) => {
  // `schema` goes after the federation `@link`, `link` inside it
  const compose = (c: {
    imports?: string;
    link?: string;
    schema?: string;
    sdl: string;
  }) =>
    api.composeServices([
      {
        name: "users",
        typeDefs: graphql`
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/${version}"
              import: ["@key"${c.imports ?? ""}]
              ${c.link ?? ""}
            )
            ${c.schema ?? ""}

          ${c.sdl}

          type Query {
            users: [User!]!
          }
        `,
      },
    ]);

  const relationship = `
    @link(url: "https://myspecs.dev/rel/v1.0", import: ["@rel"])
    @composeDirective(name: "@rel")
  `;

  test.each([
    {
      name: "an unquoted value for a String argument, as a string",
      imports: `, "@tag"`,
      sdl: `directive @rel(kind: String, kinds: [String]) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: ID!
          a: String @rel(kind: UserLink, kinds: [UserLink, "other"]) @tag(name: Public)
        }`,
      contains: `@tag(name: "Public")`,
    },
    {
      name: "a quoted value for an enum argument, as an enum value",
      imports: `, "@composeDirective"`,
      schema: relationship,
      sdl: `directive @rel(level: Level, levels: [Level]) on FIELD_DEFINITION
        enum Level { HIGH LOW }
        type User @key(fields: "id") {
          id: ID!
          a: String @rel(level: "HIGH", levels: ["HIGH", LOW])
        }`,
      contains: `@rel(level: HIGH, levels: [HIGH, LOW])`,
      since: "v2.1" as const, // @composeDirective
    },
    {
      name: "an unquoted value for an aliased directive",
      imports: `, { name: "@tag", as: "@mytag" }`,
      sdl: `type User @key(fields: "id") { id: ID! a: String @mytag(name: Public) }`,
      contains: `(name: "Public")`, // the directive keeps its alias
    },
    {
      name: "string and int literals for ID",
      sdl: `directive @ref(id: ID, ids: [ID]) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: ID!
          a: String @ref(id: "abc")
          b: String @ref(id: 1)
          c: String @ref(ids: ["abc", 1])
        }`,
    },
    {
      name: "null for a nullable argument",
      sdl: `directive @opt(s: String, i: Int, list: [String]) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: ID!
          a: String @opt(s: null, i: null, list: null)
          b: String @opt(list: [null])
        }`,
    },
    {
      name: "a nested list checked at every level",
      sdl: `directive @nested(v: [[String!]!]!) on FIELD_DEFINITION
        type User @key(fields: "id") { id: ID! a: String @nested(v: [[], ["ok"]]) }`,
    },
    {
      name: "a quoted value for @link(for:)",
      link: `for: "EXECUTION"`,
      sdl: `type User @key(fields: "id") { id: ID! }`,
    },
  ])("INVALID_GRAPHQL - accepts $name", ({ contains, since, ...c }) => {
    if (since && satisfiesVersionRange(`< ${since}`, version)) {
      return;
    }

    const result = compose(c);

    assertCompositionSuccess(result);

    if (contains) {
      expect(result.supergraphSdl).toContain(contains);
    }
  });

  test.each([
    {
      name: "a quoted value that is not a value of the enum",
      sdl: `directive @rel(level: Level) on FIELD_DEFINITION
        enum Level { HIGH LOW }
        type User @key(fields: "id") { id: ID! a: String @rel(level: "NOPE") }`,
      error: `"@rel(level:)" of type "Level" in application of "@rel" to "User.a"`,
    },
    {
      name: "a list value for a non-list argument",
      sdl: `directive @one(s: String) on FIELD_DEFINITION
        type User @key(fields: "id") { id: ID! a: String @one(s: ["txt"]) }`,
      error: `"@one(s:)" of type "String" in application of "@one" to "User.a"`,
    },
    {
      name: "null as an item of a non-null item type",
      sdl: `directive @many(list: [String!]) on FIELD_DEFINITION
        type User @key(fields: "id") { id: ID! a: String @many(list: [null]) }`,
      error: `"@many(list:)" of type "[String!]" in application of "@many" to "User.a"`,
    },
    {
      name: "a bad item of a nested list",
      sdl: `directive @nested(v: [[String!]!]!) on FIELD_DEFINITION
        type User @key(fields: "id") { id: ID! a: String @nested(v: [["ok", 42]]) }`,
      error: `"@nested(v:)" of type "[[String!]!]!" in application of "@nested" to "User.a"`,
    },
    {
      name: "an unquoted @link url",
      schema: `@link(url: notAUrl)`,
      sdl: `type User @key(fields: "id") { id: ID! }`,
      error: `"@link(url:)" of type "String" in application of "@link" to "schema"`,
      // Apollo throws `TypeError: Invalid URL` instead of reporting it
      skipApollo: true,
    },
  ])("INVALID_GRAPHQL - rejects $name", ({ error, skipApollo, ...c }) => {
    if (skipApollo && api.library === "apollo") {
      return;
    }

    const result = compose(c);

    assertCompositionFailure(result);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: `[users] Invalid value for ${error}.`,
        extensions: expect.objectContaining({ code: "INVALID_GRAPHQL" }),
      }),
    );
  });
});
