import { parse, print } from 'graphql';
import { describe, expect, test } from 'vitest';
import { sortSDL } from '../src/graphql/sort-sdl.js';
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  satisfiesVersionRange,
  testVersions,
} from './shared/testkit.js';

expect.addSnapshotSerializer({
  serialize: value => print(sortSDL(parse(value as string))),
  test: value => typeof value === 'string' && value.includes('specs.apollo.dev'),
});

describe('@context and @fromContext', () => {
  testVersions((api, version) => {
    const composeServices = api.composeServices;

    if (satisfiesVersionRange('< v2.8', version)) {
      test('not available, raise na error', () => {
        const result = composeServices([
          {
            name: 'foo',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@context", "@fromContext", "@shareable", "@external"])

              type Currency @shareable {
                 id: ID!
                 isoCode: String!
              }

              type User @key(fields: "id") @context(name: "userContext") {
                id: ID!
                userCurrency: Currency! @external
                lastTransaction: Transaction!
              }

              type Transaction @key(fields: "id") {
                id: ID!
                currency: Currency!
                amount: Int!
                amountInUserCurrency(
                  currencyCode: String
                      @fromContext(field: "$userContext { userCurrency { isoCode } }")
                ): Int!
              }
            `),
          },
        ]);

        assertCompositionFailure(result);

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[foo] Cannot import unknown element "@context".',
            extensions: expect.objectContaining({
              code: 'INVALID_LINK_DIRECTIVE_USAGE',
            }),
          }),
        );

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[foo] Cannot import unknown element "@fromContext".',
            extensions: expect.objectContaining({
              code: 'INVALID_LINK_DIRECTIVE_USAGE',
            }),
          }),
        );
      });
      return;
    }

    test(
      api.library === 'guild'
        ? `allow to use the version, but disallow to import @context and @fromContext`
        : 'available, allow to use',
      () => {
        const result = composeServices([
          {
            name: 'foo',
            typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@context", "@fromContext", "@shareable", "@external"])

              type Currency @shareable {
                 id: ID!
                 isoCode: String!
              }

              type User @key(fields: "id") @context(name: "userContext") {
                id: ID!
                userCurrency: Currency!
                lastTransaction: Transaction!
              }

              type Transaction @key(fields: "id") {
                id: ID!
                currency: Currency!
                amount: Int!
                amountInUserCurrency(
                  currencyCode: String
                      @fromContext(field: "$userContext { userCurrency { isoCode } }")
                ): Int!
              }

              type Query {
                user(id: ID!): User
              }
          `),
          },
        ]);

        if (api.library === 'apollo') {
          assertCompositionSuccess(result);
          return;
        }

        // Our composition does not support override labels yet
        assertCompositionFailure(result);

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[foo] @context directive is not yet supported.',
            extensions: expect.objectContaining({
              code: 'UNSUPPORTED_FEATURE',
            }),
          }),
        );

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message: '[foo] @fromContext directive is not yet supported.',
            extensions: expect.objectContaining({
              code: 'UNSUPPORTED_FEATURE',
            }),
          }),
        );
      },
    );

    test('public sdl should not contain @context and @fromContext related definitions', () => {
      const result = composeServices([
        {
          name: 'foo',
          typeDefs: parse(/* GraphQL */ `
              extend schema
                @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])


              type User @key(fields: "id") {
                id: ID!
                name: String!
              }

              type Query {
                user(id: ID!): User
              }
          `),
        },
      ]);

      assertCompositionSuccess(result);

      expect(result.publicSdl).not.toMatch('@context');
      expect(result.publicSdl).not.toMatch('@fromContext');
      expect(result.publicSdl).not.toMatch('join__ContextArgument');
      expect(result.publicSdl).not.toMatch('join__FieldValue');
    });
  });
});
