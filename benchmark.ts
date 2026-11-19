import { Kind, visit, type DocumentNode } from "graphql";
import { bench, group, run } from "mitata";
import { composeServices as apolloComposeServices } from "@apollo/composition";
import { getSubgraphs as huge } from "./__tests__/fixtures/huge-schema/index.js";
import { getSubgraphs as dgs } from "./__tests__/fixtures/dgs/index.js";
import { createStarsStuff } from "./__tests__/fixtures/stars-stuff.js";
import { graphql } from "./__tests__/shared/utils.js";
import {
  assertCompositionSuccess,
  composeServices as guildComposeServices,
  type CompositionResult,
} from "./src/compose.js";
import {
  composeSchemaContract,
  composeServicesWithContracts,
  type SchemaContract,
} from "./src/contracts/schema-contract.js";
import { extractLinkImplementations } from "./src/utils/link/index.js";

const starsStuff = Object.values(createStarsStuff());

const basicServices = [
  {
    name: "products",
    typeDefs: graphql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type Query {
        products: [Product!]!
      }

      type Product @key(fields: "id") {
        id: ID!
        name: String!
      }
    `,
  },
  {
    name: "reviews",
    typeDefs: graphql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type Query {
        reviews: [Review!]!
      }

      type Product @key(fields: "id") {
        id: ID!
        reviews: [Review!]!
      }

      type Review @key(fields: "id") {
        id: ID!
        body: String!
      }
    `,
  },
];

const hugeSchema = await huge();
const mediumSchema = await dgs();

/**
 * Tags root query fields, one in three as "internal" and one in three as "partner",
 * so the contracts have something to filter.
 */
function withTags<T extends { typeDefs: DocumentNode }>(services: T[]): T[] {
  return services.map((service) => {
    const tagDirectiveName = extractLinkImplementations(
      service.typeDefs,
    ).resolveImportName("https://specs.apollo.dev/federation", "@tag");
    let i = 0;
    const onlyQuery = (node: { name: { value: string } }) =>
      node.name.value === "Query" ? undefined : false;
    const skip = () => false;

    return {
      ...service,
      typeDefs: visit(service.typeDefs, {
        ObjectTypeDefinition: onlyQuery,
        ObjectTypeExtension: onlyQuery,
        InterfaceTypeDefinition: skip,
        InterfaceTypeExtension: skip,
        InputObjectTypeDefinition: skip,
        InputObjectTypeExtension: skip,
        FieldDefinition(node) {
          const tag = ["internal", "partner", null][i++ % 3];
          if (!tag) {
            return false;
          }
          return {
            ...node,
            directives: [
              ...(node.directives ?? []),
              {
                kind: Kind.DIRECTIVE,
                name: { kind: Kind.NAME, value: tagDirectiveName },
                arguments: [
                  {
                    kind: Kind.ARGUMENT,
                    name: { kind: Kind.NAME, value: "name" },
                    value: { kind: Kind.STRING, value: tag },
                  },
                ],
              },
            ],
          };
        },
      }),
    };
  });
}

const contracts: SchemaContract[] = [
  { filter: { include: new Set(), exclude: new Set(["internal"]) } },
  { filter: { include: new Set(), exclude: new Set(["partner"]) } },
  { filter: { include: new Set(), exclude: new Set(["internal", "partner"]) } },
];

function assertAllSuccess(results: CompositionResult[]) {
  for (const result of results) {
    assertCompositionSuccess(result);
  }
}

function contractsGroup(name: string, services: ReturnType<typeof withTags>) {
  group(`${name} + ${contracts.length} contracts`, () => {
    bench("guild: composeServices + composeSchemaContract", () => {
      assertAllSuccess([
        guildComposeServices(services),
        ...contracts.map((contract) =>
          composeSchemaContract(services, contract.filter),
        ),
      ]);
    }).gc("inner");

    bench("guild: composeServicesWithContracts", () => {
      const result = composeServicesWithContracts(services, contracts);
      assertAllSuccess([result.supergraph, ...result.contracts]);
    }).gc("inner");
  });
}

group("basic schema", () => {
  bench("apollo", () => {
    assertCompositionSuccess(apolloComposeServices(basicServices));
  }).gc("inner");

  bench("guild", () => {
    assertCompositionSuccess(guildComposeServices(basicServices));
  }).gc("inner");
});

group("starsStuff schema", () => {
  bench("apollo", () => {
    assertCompositionSuccess(apolloComposeServices(starsStuff));
  }).gc("inner");

  bench("guild", () => {
    assertCompositionSuccess(guildComposeServices(starsStuff));
  }).gc("inner");
});

group("medium schema", () => {
  bench("apollo", () => {
    assertCompositionSuccess(apolloComposeServices(mediumSchema));
  }).gc("inner");

  bench("guild", () => {
    assertCompositionSuccess(guildComposeServices(mediumSchema));
  }).gc("inner");
});

group("huge schema", () => {
  bench("apollo", () => {
    assertCompositionSuccess(apolloComposeServices(hugeSchema));
  }).gc("inner");

  bench("guild", () => {
    assertCompositionSuccess(guildComposeServices(hugeSchema));
  }).gc("inner");
});

contractsGroup("medium schema", withTags(mediumSchema));
contractsGroup("huge schema", withTags(hugeSchema));

await run();
