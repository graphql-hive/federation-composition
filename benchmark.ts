import { bench, group, run } from 'mitata';
import { composeServices as apolloComposeServices } from '@apollo/composition';
import { getSubgraphs } from './__tests__/fixtures/huge-schema/index.js';
import { graphql } from './__tests__/shared/utils.js';
import {
  assertCompositionSuccess,
  composeServices as guildComposeServices,
} from './src/compose.js';

const basicServices = [
  {
    name: 'products',
    typeDefs: graphql`
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

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
    name: 'reviews',
    typeDefs: graphql`
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

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

const hugeSchema = await getSubgraphs();

group('basic schema', () => {
  bench('apollo', () => {
    assertCompositionSuccess(apolloComposeServices(basicServices));
  }).gc('inner');

  bench('guild', () => {
    assertCompositionSuccess(guildComposeServices(basicServices));
  }).gc('inner');
});

group('huge schema', () => {
  bench('apollo', () => {
    assertCompositionSuccess(apolloComposeServices(hugeSchema));
  }).gc('inner');

  bench('guild', () => {
    assertCompositionSuccess(guildComposeServices(hugeSchema));
  }).gc('inner');
});

await run();
