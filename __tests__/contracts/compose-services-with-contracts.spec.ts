import {
  type ConstDirectiveNode,
  type DocumentNode,
  Kind,
  parse,
  visit,
} from "graphql";
import { describe, expect, test } from "vitest";
import { composeServices, type CompositionResult } from "../../src/compose.js";
import {
  composeSchemaContract,
  composeServicesWithContracts,
  type SchemaContract,
} from "../../src/contracts/schema-contract.js";
import { extractLinkImplementations } from "../../src/utils/link/index.js";
import { getSubgraphs as getDGS } from "../fixtures/dgs/index.js";

type Service = { name: string; typeDefs: DocumentNode };

function describeResult(result: CompositionResult) {
  return result.errors
    ? { errors: result.errors.map((error) => error.message) }
    : { supergraphSdl: result.supergraphSdl };
}

/**
 * Deriving contracts from the composed supergraph must give exactly the result
 * of composing each contract from the subgraphs.
 */
function expectSameAsComposingEachContract(
  services: Service[],
  contracts: SchemaContract[],
) {
  const result = composeServicesWithContracts(services, contracts);

  expect(describeResult(result.supergraph)).toEqual(
    describeResult(composeServices(services)),
  );
  expect(result.contracts).toHaveLength(contracts.length);

  contracts.forEach((contract, i) => {
    expect(describeResult(result.contracts[i])).toEqual(
      describeResult(
        composeSchemaContract(
          services,
          contract.filter,
          contract.removeUnreachableTypes ?? true,
        ),
      ),
    );
  });

  return result;
}

function include(...tags: string[]): SchemaContract {
  return { filter: { include: new Set(tags), exclude: new Set() } };
}

function exclude(...tags: string[]): SchemaContract {
  return { filter: { include: new Set(), exclude: new Set(tags) } };
}

const fed2 = (imports: string[]) => /* GraphQL */ `
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.3"
      import: [${imports.map((i) => `"${i}"`).join(", ")}]
    )
`;

describe("composeServicesWithContracts", () => {
  test("composes the supergraph and the contracts, in order", () => {
    const services = [
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          ${fed2(["@key", "@tag"])}
          type Query {
            public: String @tag(name: "public")
            internal: String @tag(name: "internal")
          }
        `),
      },
    ];

    const result = expectSameAsComposingEachContract(services, [
      exclude("internal"),
      include("internal"),
    ]);

    expect(result.supergraph.publicSdl).toContain("internal: String");
    expect(result.contracts[0].publicSdl).not.toContain("internal: String");
    expect(result.contracts[0].publicSdl).toContain("public: String");
    expect(result.contracts[1].publicSdl).toContain("internal: String");
    expect(result.contracts[1].publicSdl).not.toContain("public: String");
  });

  test("a contract does not leak into the next one", () => {
    const services = [
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          ${fed2(["@key", "@tag"])}
          type Query {
            a: A @tag(name: "a")
            b: String @tag(name: "b")
          }
          type A @key(fields: "id") {
            id: ID!
            secret: String @tag(name: "secret")
          }
          enum Color {
            RED @tag(name: "a")
            BLUE @tag(name: "b")
          }
        `),
      },
    ];

    expectSameAsComposingEachContract(services, [
      exclude("a"), // fails: Query.a references the excluded type A
      exclude("secret"),
      include("b"),
      exclude("b"),
      include(),
    ]);
  });

  test("a contract reuses the definitions it does not change", () => {
    const services = [
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          ${fed2(["@key", "@tag"])}
          type Query {
            user: User
            internal: String @tag(name: "internal")
          }
          type User @key(fields: "id") {
            id: ID!
            name: String
          }
        `),
      },
    ];

    const result = expectSameAsComposingEachContract(services, [
      exclude("internal"),
    ]);

    function definition(result: CompositionResult, name: string) {
      return result.supergraphDocumentNode!.definitions.find(
        (node) => "name" in node && node.name?.value === name,
      );
    }

    expect(definition(result.contracts[0], "User")).toBeDefined();
    expect(definition(result.contracts[0], "User")).toBe(
      definition(result.supergraph, "User"),
    );
    expect(definition(result.contracts[0], "Query")).not.toBe(
      definition(result.supergraph, "Query"),
    );
  });

  test("subgraphs fail to compose", () => {
    const services = [
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          ${fed2(["@key", "@tag"])}
          type Query {
            a: String @tag(name: "a")
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          ${fed2(["@key", "@tag"])}
          type Query {
            a: Int
          }
        `),
      },
    ];

    const result = expectSameAsComposingEachContract(services, [exclude("a")]);

    expect(result.supergraph.errors).toBeDefined();
    expect(result.contracts[0].errors).toBeDefined();
  });

  describe("errors introduced by a contract", () => {
    test.each([
      {
        code: "REFERENCED_INACCESSIBLE",
        sdl: /* GraphQL */ `
          type Query {
            a: A @tag(name: "public")
          }
          type A @tag(name: "internal") {
            id: ID!
          }
        `,
      },
      {
        code: "REQUIRED_INACCESSIBLE",
        sdl: /* GraphQL */ `
          type Query {
            a(id: ID! @tag(name: "internal")): String @tag(name: "public")
          }
        `,
      },
      {
        code: "ONLY_INACCESSIBLE_CHILDREN",
        sdl: /* GraphQL */ `
          type Query {
            a: String @tag(name: "internal")
          }
        `,
      },
      {
        // reported by subgraph validation, before the supergraph is validated
        code: "QUERY_ROOT_TYPE_INACCESSIBLE",
        sdl: /* GraphQL */ `
          type Query @tag(name: "internal") {
            a: String
          }
        `,
      },
    ])("$code", ({ code, sdl }) => {
      const result = expectSameAsComposingEachContract(
        [{ name: "a", typeDefs: parse(fed2(["@key", "@tag"]) + sdl) }],
        [exclude("internal")],
      );

      expect(result.contracts[0].errors).toContainEqual(
        expect.objectContaining({
          extensions: expect.objectContaining({ code }),
        }),
      );
    });
  });

  // Cases where the tag filter works on the subgraphs in ways the composed supergraph alone does not tell.
  describe("same result as filtering the subgraphs", () => {
    test("renamed root types are filtered by the names used in each subgraph", () => {
      expectSameAsComposingEachContract(
        [
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              schema {
                query: CustomQueryName
              }
              type CustomQueryName {
                helloFromA: String @tag(name: "c")
              }
            `),
          },
          {
            name: "b",
            typeDefs: parse(/* GraphQL */ `
              type Query @tag(name: "a") {
                helloFromB: String @tag(name: "c")
              }
            `),
          },
        ],
        [include("a"), exclude("a"), include("c")],
      );
    });

    test("fields of a type annotated with @external (Federation v1)", () => {
      expectSameAsComposingEachContract(
        [
          {
            name: "users",
            typeDefs: parse(/* GraphQL */ `
              type Query {
                users: [User]
              }
              type User @key(fields: "id") @external {
                id: ID!
                name: String!
              }
            `),
          },
        ],
        [exclude("b"), include("a")],
      );
    });

    test("@tag on an @external field stays (Federation v1)", () => {
      expectSameAsComposingEachContract(
        [
          {
            name: "inventory",
            typeDefs: parse(/* GraphQL */ `
              directive @tag(name: String!) repeatable on FIELD_DEFINITION

              extend type Product @key(fields: "id") {
                id: ID! @external @tag(name: "public")
                delivery: String @tag(name: "public")
              }
            `),
          },
          {
            name: "products",
            typeDefs: parse(/* GraphQL */ `
              directive @tag(name: String!) repeatable on FIELD_DEFINITION

              type Product @key(fields: "id") {
                id: ID!
                name: String @tag(name: "internal")
              }
              type Query {
                product: Product @tag(name: "public")
              }
            `),
          },
        ],
        [exclude("internal"), include("public")],
      );
    });

    test("@tag on an argument of a directive definition", () => {
      expectSameAsComposingEachContract(
        [
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/v2.2"
                  import: ["@tag", "@composeDirective"]
                )
                @link(
                  url: "https://myspecs.dev/access/v1.0"
                  import: ["@access"]
                )
                @composeDirective(name: "@access")

              directive @access(
                scope: String @tag(name: "admin")
              ) on FIELD_DEFINITION

              type Query {
                employee: String @tag(name: "admin") @access(scope: "admin")
                name: String
              }
            `),
          },
        ],
        [exclude("admin"), include("admin")],
      );
    });

    test("federation types declared in a subgraph", () => {
      expectSameAsComposingEachContract(
        [
          {
            name: "users",
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/v2.3"
                  import: ["@key", "FieldSet"]
                )

              scalar FieldSet @federation__tag(name: "internal")

              type Query {
                user: User
              }
              type User @key(fields: "id") {
                id: ID!
              }
            `),
          },
        ],
        [exclude("internal")],
      );
    });

    test("excluded argument of an interface field", () => {
      expectSameAsComposingEachContract(
        [
          {
            name: "a",
            typeDefs: parse(/* GraphQL */ `
              ${fed2(["@key", "@tag"])}
              interface User {
                id: ID!
                tags(limit: Int @tag(name: "internal")): [String!]!
              }
              type Admin implements User @key(fields: "id") {
                id: ID!
                tags(limit: Int): [String!]!
              }
              type Query {
                users: [User]
              }
            `),
          },
        ],
        [exclude("internal")],
      );
    });
  });

  test("random tags on a real-world schema", async () => {
    const services = await getDGS();

    for (const seed of [1, 2, 3]) {
      const random = createRandom(seed);
      const tagged = services.map((service) => ({
        ...service,
        typeDefs: addRandomTags(service.typeDefs, random),
      }));

      expectSameAsComposingEachContract(tagged, [
        include("a"),
        exclude("b"),
        {
          filter: { include: new Set(["a", "c"]), exclude: new Set(["b"]) },
          removeUnreachableTypes: false,
        },
      ]);
    }
  }, 60_000);
});

function createRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Adds `@tag(name: "a" | "b" | "c")` to a third of types, fields, arguments and enum values. */
function addRandomTags(
  typeDefs: DocumentNode,
  random: () => number,
): DocumentNode {
  const tagDirectiveName = extractLinkImplementations(
    typeDefs,
  ).resolveImportName("https://specs.apollo.dev/federation", "@tag");
  const taggable = new Set<string>([
    Kind.OBJECT_TYPE_DEFINITION,
    Kind.OBJECT_TYPE_EXTENSION,
    Kind.INTERFACE_TYPE_DEFINITION,
    Kind.INPUT_OBJECT_TYPE_DEFINITION,
    Kind.ENUM_TYPE_DEFINITION,
    Kind.SCALAR_TYPE_DEFINITION,
    Kind.UNION_TYPE_DEFINITION,
    Kind.FIELD_DEFINITION,
    Kind.INPUT_VALUE_DEFINITION,
    Kind.ENUM_VALUE_DEFINITION,
  ]);

  return visit(typeDefs, {
    enter(node) {
      if (!taggable.has(node.kind) || random() > 0.33) {
        return;
      }

      const withDirectives = node as {
        directives?: readonly ConstDirectiveNode[];
      };

      // `@tag` can't be applied to external fields
      if (
        withDirectives.directives?.some((d) =>
          d.name.value.endsWith("external"),
        )
      ) {
        return;
      }

      const tag: ConstDirectiveNode = {
        kind: Kind.DIRECTIVE,
        name: { kind: Kind.NAME, value: tagDirectiveName },
        arguments: [
          {
            kind: Kind.ARGUMENT,
            name: { kind: Kind.NAME, value: "name" },
            value: {
              kind: Kind.STRING,
              value: ["a", "b", "c"][Math.floor(random() * 3)],
            },
          },
        ],
      };

      return {
        ...node,
        directives: [...(withDirectives.directives ?? []), tag],
      };
    },
  });
}
