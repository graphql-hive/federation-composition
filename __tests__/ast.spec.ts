import { ConstDirectiveNode, Kind, parse, TypeKind } from "graphql";
import { describe, expect, test } from "vitest";
import { ArgumentKind } from "../src/subgraph/state.js";
import {
  createEnumTypeNode,
  createInputObjectTypeNode,
  createInterfaceTypeNode,
  createJoinGraphEnumTypeNode,
  createObjectTypeNode,
  createScalarTypeNode,
  createSchemaNode,
  createUnionTypeNode,
  stripFederation,
} from "../src/supergraph/composition/ast.js";

function createDirective(name: string): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: name,
    },
  };
}

describe("object type", () => {
  test("@join__type(graph)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String
      }
    `);
  });

  test("@join__implements(graph, interface)", () => {
    expect(
      createObjectTypeNode({
        name: "Book",
        join: {
          type: [{ graph: "A" }],
          implements: [{ graph: "A", interface: "Media" }],
        },
        fields: [
          {
            name: "title",
            type: "String",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type Book
        @join__type(graph: A)
        @join__implements(graph: A, interface: "Media") {
        title: String
      }
    `);
  });

  test("@join__type(graph, key)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [
            { graph: "A", key: "id" },
            { graph: "B", key: "id" },
          ],
        },
        fields: [
          {
            name: "id",
            type: "ID!",
          },
          {
            name: "name",
            type: "String",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id") {
        id: ID!
        name: String
      }
    `);
  });

  test("@join__type(graph, key, extension)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [
            { graph: "A", key: "id" },
            { graph: "B", key: "id", extension: true },
          ],
        },
        fields: [
          {
            name: "id",
            type: "ID!",
          },
          {
            name: "name",
            type: "String",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id", extension: true) {
        id: ID!
        name: String
      }
    `);
  });

  test("@join_field", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: { type: [{ graph: "A" }, { graph: "B" }] },
        fields: [
          {
            name: "name",
            type: "String",
            join: {
              field: [{}],
            },
          },
          {
            name: "id",
            type: "ID",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String @join__field
        id: ID
      }
    `);
  });

  test("@join_field(graph)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: { type: [{ graph: "A" }, { graph: "B" }] },
        fields: [
          {
            name: "name",
            type: "String",
            join: {
              field: [
                {
                  graph: "A",
                },
              ],
            },
          },
          {
            name: "id",
            type: "ID",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String @join__field(graph: A)
        id: ID
      }
    `);
  });

  test("@join_field(graph, type)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String",
            join: {
              field: [
                {
                  graph: "A",
                  type: "String",
                },
                {
                  graph: "B",
                  type: "String!",
                },
              ],
            },
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String
          @join__field(graph: B, type: "String!")
          @join__field(graph: A, type: "String")
      }
    `);
  });

  test("@join_field(graph, override)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String",
            join: {
              field: [
                {
                  graph: "B",
                  override: "a",
                },
              ],
            },
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String @join__field(graph: B, override: "a")
      }
    `);
  });

  test("@join_field(graph, external)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String",
            join: {
              field: [
                {
                  graph: "B",
                  external: true,
                },
              ],
            },
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String @join__field(graph: B, external: true)
      }
    `);
  });

  test("@join_field(graph, provides)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String",
            join: {
              field: [
                {
                  graph: "B",
                  provides: "name",
                },
              ],
            },
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String @join__field(graph: B, provides: "name")
      }
    `);
  });

  test("@join_field(graph, requires)", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String",
            join: {
              field: [
                {
                  graph: "B",
                  requires: "name",
                },
              ],
            },
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String @join__field(graph: B, requires: "name")
      }
    `);
  });

  test("@inaccessible", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String",
            inaccessible: true,
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @join__type(graph: B) {
        name: String @inaccessible
      }
    `);
  });

  test("field arguments", () => {
    expect(
      createObjectTypeNode({
        name: "Building",
        join: { type: [{ graph: "A" }, { graph: "B" }] },
        fields: [
          {
            name: "height",
            type: "Int!",
            arguments: [
              {
                name: "units",
                type: "String!",
                kind: ArgumentKind.SCALAR,
              },
            ],
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type Building @join__type(graph: A) @join__type(graph: B) {
        height(units: String!): Int!
      }
    `);
  });

  test("interfaces", () => {
    expect(
      createObjectTypeNode({
        name: "Book",
        interfaces: ["Media"],
        fields: [
          {
            name: "title",
            type: "String",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type Book implements Media {
        title: String
      }
    `);
  });

  test("default value", () => {
    expect(
      createObjectTypeNode({
        name: "Building",
        fields: [
          {
            name: "height",
            type: "Int!",
            arguments: [
              {
                name: "units",
                type: "Int!",
                kind: TypeKind.SCALAR,
                defaultValue: "1",
              },
            ],
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type Building {
        height(units: Int! = 1): Int!
      }
    `);
  });

  test("a directive on a field", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: { type: [{ graph: "A" }] },
        fields: [
          {
            name: "name",
            type: "String!",
            ast: {
              directives: [createDirective("lowercase")],
            },
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) {
        name: String! @lowercase
      }
    `);
  });

  test("a directive on an object type", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        join: { type: [{ graph: "A" }] },
        fields: [
          {
            name: "name",
            type: "String!",
          },
        ],
        ast: {
          directives: [createDirective("lowercase")],
        },
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @join__type(graph: A) @lowercase {
        name: String!
      }
    `);
  });

  test("@tag", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        fields: [
          {
            name: "name",
            type: "String",
            tags: ["public"],
            arguments: [
              {
                name: "limit",
                type: "Int",
                kind: ArgumentKind.SCALAR,
                tags: ["public"],
              },
            ],
          },
        ],
        tags: ["public"],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @tag(name: "public") {
        name(limit: Int @tag(name: "public")): String @tag(name: "public")
      }
    `);
  });

  test("@inaccessible", () => {
    expect(
      createObjectTypeNode({
        name: "User",
        fields: [
          {
            name: "name",
            type: "String",
            inaccessible: true,
            arguments: [
              {
                name: "limit",
                type: "Int",
                kind: ArgumentKind.SCALAR,
                inaccessible: true,
              },
            ],
          },
        ],
        inaccessible: true,
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      type User @inaccessible {
        name(limit: Int @inaccessible): String @inaccessible
      }
    `);
  });
});

describe("interface type", () => {
  test("@join__type(graph)", () => {
    expect(
      createInterfaceTypeNode({
        name: "User",
        join: { type: [{ graph: "A" }, { graph: "B" }] },
        fields: [
          {
            name: "name",
            type: "String",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      interface User @join__type(graph: A) @join__type(graph: B) {
        name: String
      }
    `);
  });

  test("@join__type(graph, key, isInterfaceObject)", () => {
    expect(
      createInterfaceTypeNode({
        name: "Media",
        join: {
          type: [
            { graph: "A", key: "id" },
            { graph: "B", key: "id", isInterfaceObject: true },
          ],
        },
        fields: [
          {
            name: "id",
            type: "ID!",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      interface Media
        @join__type(graph: A, key: "id")
        @join__type(graph: B, key: "id", isInterfaceObject: true) {
        id: ID!
      }
    `);
  });

  test("@join__field(graph)", () => {
    expect(
      createInterfaceTypeNode({
        name: "User",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String",
            join: {
              field: [
                {
                  graph: "A",
                },
              ],
            },
          },
          {
            name: "id",
            type: "ID",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      interface User @join__type(graph: A) @join__type(graph: B) {
        name: String @join__field(graph: A)
        id: ID
      }
    `);
  });

  test("field arguments", () => {
    expect(
      createInterfaceTypeNode({
        name: "Building",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "height",
            type: "Int!",
            arguments: [
              {
                name: "units",
                type: "Int!",
                kind: ArgumentKind.SCALAR,
              },
            ],
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      interface Building @join__type(graph: A) @join__type(graph: B) {
        height(units: Int!): Int!
      }
    `);
  });

  test("interfaces", () => {
    expect(
      createInterfaceTypeNode({
        name: "Book",
        interfaces: ["Media"],
        fields: [
          {
            name: "title",
            type: "String",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      interface Book implements Media {
        title: String
      }
    `);
  });

  test("default value", () => {
    expect(
      createInterfaceTypeNode({
        name: "Skyscraper",
        interfaces: ["Building"],
        fields: [
          {
            name: "height",
            type: "Int!",
            arguments: [
              {
                name: "units",
                type: "Int!",
                kind: ArgumentKind.SCALAR,
                defaultValue: "1",
              },
            ],
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      interface Skyscraper implements Building {
        height(units: Int! = 1): Int!
      }
    `);
  });

  test("@tag", () => {
    expect(
      createInterfaceTypeNode({
        name: "Building",
        fields: [
          {
            name: "height",
            type: "Int!",
            tags: ["public"],
            arguments: [
              {
                name: "units",
                type: "Int!",
                kind: ArgumentKind.SCALAR,
                tags: ["public"],
              },
            ],
          },
        ],
        tags: ["public"],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      interface Building @tag(name: "public") {
        height(units: Int! @tag(name: "public")): Int! @tag(name: "public")
      }
    `);
  });

  test("@inaccessible", () => {
    expect(
      createInterfaceTypeNode({
        name: "User",
        fields: [
          {
            name: "name",
            type: "String",
            inaccessible: true,
            arguments: [
              {
                name: "limit",
                type: "Int",
                kind: ArgumentKind.SCALAR,
                inaccessible: true,
              },
            ],
          },
        ],
        inaccessible: true,
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      interface User @inaccessible {
        name(limit: Int @inaccessible): String @inaccessible
      }
    `);
  });
});

describe("union type", () => {
  test("@join__type(graph) + @join__unionMember(graph, member)", () => {
    expect(
      createUnionTypeNode({
        name: "Media",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
          unionMember: [
            { graph: "A", member: "Book" },
            { graph: "B", member: "Book" },
            { graph: "B", member: "Movie" },
          ],
        },
        members: ["Book", "Movie"],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      union Media
        @join__type(graph: A)
        @join__type(graph: B)
        @join__unionMember(graph: A, member: "Book")
        @join__unionMember(graph: B, member: "Movie")
        @join__unionMember(graph: B, member: "Book") =
        | Movie
        | Book
    `);
  });

  test("@tag", () => {
    expect(
      createUnionTypeNode({
        name: "Media",
        members: ["Book", "Movie"],
        tags: ["public"],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      union Media @tag(name: "public") = Movie | Book
    `);
  });

  test("@inaccessible", () => {
    expect(
      createUnionTypeNode({
        name: "Media",
        members: ["Book", "Movie"],
        inaccessible: true,
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      union Media @inaccessible = Movie | Book
    `);
  });

  test("directives", () => {
    expect(
      createUnionTypeNode({
        name: "Media",
        members: ["Book", "Movie"],
        ast: {
          directives: [createDirective("custom")],
        },
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      union Media @custom = Movie | Book
    `);
  });
});

describe("input object type", () => {
  test("@join__type(graph)", () => {
    expect(
      createInputObjectTypeNode({
        name: "UserInput",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        fields: [
          {
            name: "name",
            type: "String!",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      input UserInput @join__type(graph: A) @join__type(graph: B) {
        name: String!
      }
    `);
  });

  test("@inaccessible", () => {
    expect(
      createInputObjectTypeNode({
        name: "User",
        fields: [
          {
            name: "name",
            type: "String",
            inaccessible: true,
          },
        ],
        inaccessible: true,
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      input User @inaccessible {
        name: String @inaccessible
      }
    `);
  });

  test("@tag", () => {
    expect(
      createInputObjectTypeNode({
        name: "UserInput",
        fields: [
          {
            name: "name",
            type: "String!",
            tags: ["public"],
          },
        ],
        tags: ["public"],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      input UserInput @tag(name: "public") {
        name: String! @tag(name: "public")
      }
    `);
  });

  test("directive", () => {
    expect(
      createInputObjectTypeNode({
        name: "User",
        fields: [
          {
            name: "name",
            type: "String",
            ast: {
              directives: [createDirective("custom")],
            },
          },
        ],
        ast: {
          directives: [createDirective("custom")],
        },
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      input User @custom {
        name: String @custom
      }
    `);
  });

  test("default value", () => {
    expect(
      createInputObjectTypeNode({
        name: "Filter",
        fields: [
          {
            name: "limit",
            type: "Int",
            defaultValue: "2",
          },
          {
            name: "obj",
            type: "Obj",
            defaultValue: "{limit: 1}",
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      input Filter {
        obj: Obj = { limit: 1 }
        limit: Int = 2
      }
    `);
  });
});

describe("enum object type", () => {
  test("@join__type(graph) + @join_enumValue(graph)", () => {
    expect(
      createEnumTypeNode({
        name: "UserType",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        values: [
          {
            name: "ADMIN",
            join: {
              enumValue: [
                {
                  graph: "A",
                },
                {
                  graph: "B",
                },
              ],
            },
          },
          {
            name: "REGULAR",
            join: {
              enumValue: [
                {
                  graph: "B",
                },
              ],
            },
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      enum UserType @join__type(graph: B) @join__type(graph: A) {
        REGULAR @join__enumValue(graph: B)
        ADMIN @join__enumValue(graph: A) @join__enumValue(graph: B)
      }
    `);
  });

  test("@tag", () => {
    expect(
      createEnumTypeNode({
        name: "UserType",
        tags: ["public"],
        values: [
          {
            name: "ADMIN",
            tags: ["public"],
          },
          {
            name: "REGULAR",
            tags: ["public"],
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      enum UserType @tag(name: "public") {
        REGULAR @tag(name: "public")
        ADMIN @tag(name: "public")
      }
    `);
  });

  test("@inaccessible", () => {
    expect(
      createEnumTypeNode({
        name: "Media",
        values: [
          {
            name: "BOOK",
          },
          {
            name: "MOVIE",
            inaccessible: true,
          },
        ],
        inaccessible: true,
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      enum Media @inaccessible {
        BOOK
        MOVIE @inaccessible
      }
    `);
  });

  test("directives", () => {
    expect(
      createEnumTypeNode({
        name: "Media",
        values: [
          {
            name: "BOOK",
            ast: {
              directives: [createDirective("any")],
            },
          },
          {
            name: "MOVIE",
          },
        ],
        ast: {
          directives: [createDirective("custom")],
        },
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      enum Media @custom {
        BOOK @any
        MOVIE
      }
    `);
  });
});

describe("schema", () => {
  test("operation types", () => {
    expect(
      createSchemaNode({
        query: "Query",
        mutation: "Mutation",
        subscription: "Subscription",
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      schema {
        query: Query
        mutation: Mutation
        subscription: Subscription
      }
    `);
  });

  test("links", () => {
    expect(
      createSchemaNode({
        query: "Query",
        links: [
          {
            url: "https://specs.apollo.dev/link/v1.0",
          },
          {
            url: "https://specs.apollo.dev/join/v0.3",
            for: "EXECUTION",
          },
          {
            url: "https://myspecs.dev/lowercase/v1.0",
            import: [
              {
                name: "@lowercase",
              },
            ],
          },
        ],
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
        @link(
          url: "https://myspecs.dev/lowercase/v1.0"
          import: ["@lowercase"]
        ) {
        query: Query
      }
    `);
  });
});

describe("join__Graph enum type", () => {
  test("@join__graph", () => {
    expect(
      createJoinGraphEnumTypeNode([
        {
          name: "products",
          url: "http://products.com",
          enumValue: "PRODUCTS",
        },
        {
          name: "reviews",
          enumValue: "REVIEWS",
        },
      ]),
    ).toEqualGraphQL(/* GraphQL */ `
      enum join__Graph {
        PRODUCTS @join__graph(name: "products", url: "http://products.com")
        REVIEWS @join__graph(name: "reviews", url: "")
      }
    `);
  });
});

describe("scalars", () => {
  test("scalar and directive on a scalar", () => {
    expect(
      createScalarTypeNode({
        name: "MyScalar",
        join: {
          type: [{ graph: "A" }, { graph: "B" }],
        },
        ast: {
          directives: [createDirective("custom")],
        },
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      scalar MyScalar @custom @join__type(graph: A) @join__type(graph: B)
    `);
  });

  test("@inaccessible", () => {
    expect(
      createScalarTypeNode({
        name: "MyScalar",
        inaccessible: true,
      }),
    ).toEqualGraphQL(/* GraphQL */ `
      scalar MyScalar @inaccessible
    `);
  });
});

describe("strip federation", () => {
  test("@join__graph", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          directive @join__graph on ENUM_VALUE
          directive @lowercase on ENUM_VALUE

          enum Foo {
            PANDAS @join__graph(name: "pandas", url: "") @lowercase
            USERS @join__graph(name: "users", url: "https://users.com")
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      directive @lowercase on ENUM_VALUE

      enum Foo {
        PANDAS @lowercase
        USERS
      }
    `);
  });

  test("@join__enumValue", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          directive @join__enumValue on ENUM_VALUE

          enum Foo {
            PANDAS @join__enumValue(graph: B)
            USERS @join__enumValue(graph: C)
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      enum Foo {
        PANDAS
        USERS
      }
    `);
  });

  test("@join__unionMember", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          directive @join__unionMember on ENUM_VALUE

          enum Foo {
            PANDAS @join__unionMember(graph: B)
            USERS @join__unionMember(graph: C)
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      enum Foo {
        PANDAS
        USERS
      }
    `);
  });

  test("@join__field", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          directive @join__field on ENUM_VALUE

          enum Foo {
            PANDAS @join__field(graph: B)
            USERS @join__field(graph: C)
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      enum Foo {
        PANDAS
        USERS
      }
    `);
  });

  test("@join__implements", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          directive @join__implements on ENUM_VALUE

          enum Foo {
            PANDAS @join__implements(graph: B)
            USERS @join__implements(graph: C)
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      enum Foo {
        PANDAS
        USERS
      }
    `);
  });

  test("@join__type", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          directive @join__type on ENUM_VALUE

          type Foo @join__type {
            name: String
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      type Foo {
        name: String
      }
    `);
  });

  test("@link", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          schema
            @link(url: "https://specs.apollo.dev/link/v1.0")
            @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) {
            query: Query
          }

          directive @link(
            url: String
            as: String
            for: link__Purpose
            import: [link__Import]
          ) repeatable on SCHEMA
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      schema {
        query: Query
      }
    `);
  });

  test("@tag", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          directive @tag on ENUM_VALUE

          type Foo @tag {
            name: String
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      type Foo {
        name: String
      }
    `);
  });

  test("enum link__Purpose", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          enum link__Purpose {
            EXECUTION
            DOCUMENTATION
          }

          enum Foo {
            BAR
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      enum Foo {
        BAR
      }
    `);
  });

  test("scalar link__Import", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          scalar link__Import
          scalar JSON
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      scalar JSON
    `);
  });

  test("enum join__Graph", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          enum join__Graph {
            EXECUTION
            DOCUMENTATION
          }

          enum Foo {
            BAR
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      enum Foo {
        BAR
      }
    `);
  });

  test("scalar join__FieldSet", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          scalar join__FieldSet
          scalar JSON
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      scalar JSON
    `);
  });

  test("strip @inaccessible", () => {
    expect(
      stripFederation(
        parse(/* GraphQL */ `
          schema {
            query: Query
          }

          type Panda {
            name: String!
            favoriteFood: String @inaccessible
          }

          type Profile @inaccessible {
            name: String
          }

          type Query {
            allPandas: [Panda] @inaccessible
            users(filter: Filter, anotherFilter: AnotherFilter): [User]
            panda(name: String!): Panda
          }

          input Filter @inaccessible {
            limit: Int
          }

          input AnotherFilter {
            limit: Int @inaccessible
            after: ID
          }

          enum Role @inaccessible {
            ADMIN
            USER
          }

          enum Access {
            READ
            WRITE @inaccessible
          }

          type User {
            id: ID!
            name: String
            totalProductsCreated: Int @inaccessible
            profile: Profile
            role: Role
            access: Access
          }
        `),
      ),
    ).toEqualGraphQL(/* GraphQL */ `
      schema {
        query: Query
      }

      type Panda {
        name: String!
      }

      input AnotherFilter {
        after: ID
      }

      type Query {
        panda(name: String!): Panda
        users(anotherFilter: AnotherFilter): [User]
      }

      enum Access {
        READ
      }

      type User {
        id: ID!
        name: String
        access: Access
      }
    `);
  });
});
