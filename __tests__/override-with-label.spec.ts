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

describe('@override(label:)', () => {
  testVersions((api, version) => {
    const composeServices = api.composeServices;

    if (satisfiesVersionRange('< v2.7', version)) {
      test('not available, raise na error', () => {
        const result = composeServices([
          {
            name: 'foo',
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
                name: String @override(from: "bar", label: "foo")
              }
            `),
          },
          {
            name: 'bar',
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
              code: 'INVALID_GRAPHQL',
            }),
          }),
        );
      });
      return;
    }

    test(
      api.library === 'guild'
        ? `allow to use the version, but disallow to import @override(label:)`
        : 'available, allow to use',
      () => {
        const result = composeServices([
          {
            name: 'foo',
            typeDefs: parse(/* GraphQL */ `
            extend schema
              @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@override"])

            type Query {
              foo: User
            }

            type User @key(fields: "id") {
              id: ID
              name: String @override(from: "bar", label: "foo")
            }
          `),
          },
          {
            name: 'bar',
            typeDefs: parse(/* GraphQL */ `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key"])

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

        if (api.library === 'apollo') {
          assertCompositionSuccess(result);
          return;
        }

        // Our composition does not support override labels yet
        assertCompositionFailure(result);

        expect(result.errors).toContainEqual(
          expect.objectContaining({
            message:
              '[foo] Progressive @override labels are not yet supported. Attempted to override field "User.name".',
            extensions: expect.objectContaining({
              code: 'UNSUPPORTED_FEATURE',
              subgraphName: 'foo',
            }),
          }),
        );
      },
    );
  });
});
