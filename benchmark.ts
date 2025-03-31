import { bench, group, run } from 'mitata';
import { composeServices as apolloComposeServices } from '@apollo/composition';
import { getSubgraphs as huge } from './__tests__/fixtures/huge-schema/index.js';
import { getSubgraphs as dgs } from './__tests__/fixtures/dgs/index.js';
import {createStarsStuff} from './__tests__/fixtures/stars-stuff.js'
import { graphql } from './__tests__/shared/utils.js';
import {
  assertCompositionSuccess,
  composeServices as guildComposeServices,
} from './src/compose.js';

const starsStuff = Object.values(createStarsStuff());

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

const hugeSchema = await huge();
const mediumSchema = await dgs();

group('basic schema', () => {
  bench('apollo', () => {
    assertCompositionSuccess(apolloComposeServices(basicServices));
  }).gc('inner');

  bench('guild', () => {
    assertCompositionSuccess(guildComposeServices(basicServices));
  }).gc('inner');
});

group('starsStuff schema', () => {
  bench('apollo', () => {
    assertCompositionSuccess(apolloComposeServices(starsStuff));
  }).gc('inner');

  bench('guild', () => {
    assertCompositionSuccess(guildComposeServices(starsStuff));
  }).gc('inner');
});

group('medium schema', () => {
  bench('apollo', () => {
    assertCompositionSuccess(apolloComposeServices(mediumSchema));
  }).gc('inner');

  bench('guild', () => {
    assertCompositionSuccess(guildComposeServices(mediumSchema));
  }).gc('inner');
})

group('huge schema', () => {
  bench('apollo', () => {
    assertCompositionSuccess(apolloComposeServices(hugeSchema));
  }).gc('inner');

  bench('guild', () => {
    assertCompositionSuccess(guildComposeServices(hugeSchema));
  }).gc('inner');
});

await run();
