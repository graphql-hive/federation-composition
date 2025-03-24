import { parse, print } from 'graphql';
import { expect, test } from 'vitest';
import { sortSDL } from '../src/graphql/sort-sdl.js';
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  testImplementations,
} from './shared/testkit.js';

expect.addSnapshotSerializer({
  serialize: value => print(sortSDL(parse(value as string))),
  test: value => typeof value === 'string' && value.includes('specs.apollo.dev'),
});

testImplementations(api => {
  const composeServices = api.composeServices;

  test('allow to use v2.7, but not progressive @override labels', () => {
    const result = composeServices([
      {
        name: 'foo',
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key", "@override"])

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
  });
});
