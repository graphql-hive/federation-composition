import { describe, expect, test } from 'vitest';
import {
  assertCompositionSuccess,
  federationVersionToJoinSpecVersion,
  graphql,
  testImplementations,
} from '../shared/testkit.js';

describe('join spec version', () => {
  testImplementations(api => {
    test.each(Object.entries(federationVersionToJoinSpecVersion))(
      'Federation %s == Join %s',
      (fedVersion, joinVersion) => {
        const result = api.composeServices([
          {
            name: 'a',
            typeDefs: graphql`
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${fedVersion}" import: ["@key"])

            type User @key(fields: "id") {
              id: ID!
              name: String!
            }

            type Query {
              users: [User]
            }
          `,
          },
        ]);

        assertCompositionSuccess(result);

        expect(result.supergraphSdl).toMatch(
          `@link(url: "https://specs.apollo.dev/join/${joinVersion}", for: EXECUTION)`,
        );
      },
    );

    test('Federation v1.0 == Join v0.3', () => {
      const result = api.composeServices([
        {
          name: 'a',
          typeDefs: graphql`
            type User @key(fields: "id") {
              id: ID!
              name: String!
            }

            type Query {
              users: [User]
            }
          `,
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.supergraphSdl).toMatch(
        `@link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)`,
      );
    });
  });
});
