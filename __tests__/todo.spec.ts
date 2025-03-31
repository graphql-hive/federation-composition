import { test, describe, expect } from "vitest";
import {
  assertCompositionSuccess,
  testImplementations,
} from "./shared/testkit";
import { parse } from "graphql";

testImplementations((api) => {
  test.todo("circular-reference-interface", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@external", "@provides"]
            )

          type Query {
            product: Product
          }

          interface Product {
            samePriceProduct: Product
          }

          type Book implements Product @key(fields: "id") {
            id: ID!
            samePriceProduct: Book @provides(fields: "price")
            price: Float @external
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id") {
            id: ID!
            price: Float @shareable
          }
        `),
      },
    ]);

    assertCompositionSuccess(result);
  });

  test.todo("requires-with-fragments", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.5"
              import: ["@key", "@shareable"]
            )

          type Query @shareable {
            a: Entity
          }

          type Entity @key(fields: "id") {
            id: ID!
            data: Foo
          }

          interface Foo {
            foo: String!
          }

          interface Bar implements Foo {
            foo: String!
            bar: String!
          }

          type Baz implements Foo & Bar @shareable {
            foo: String!
            bar: String!
            baz: String!
          }

          type Qux implements Foo & Bar @shareable {
            foo: String!
            bar: String!
            qux: String!
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.5"
              import: [
                "@key"
                "@shareable"
                "@inaccessible"
                "@external"
                "@requires"
              ]
            )

          type Query @shareable {
            b: Entity
            bb: Entity
          }

          type Entity @key(fields: "id") {
            id: ID!
            data: Foo @external
            requirer: String!
              @requires(
                fields: """
                data {
                  foo
                  ... on Bar {
                    bar
                    ... on Baz {
                      baz
                    }
                    ... on Qux {
                      qux
                    }
                  }
                }
                """
              )
            requirer2: String!
              @requires(
                fields: """
                data {
                  ... on Foo {
                    foo
                  }
                }
                """
              )
          }

          interface Foo {
            foo: String!
          }

          interface Bar implements Foo {
            foo: String!
            bar: String!
          }

          type Baz implements Foo & Bar @shareable @inaccessible {
            foo: String!
            bar: String!
            baz: String!
          }

          type Qux implements Foo & Bar @shareable {
            foo: String!
            bar: String!
            qux: String!
          }
        `),
      },
    ]);
    console.log(result.errors);
    assertCompositionSuccess(result);
  });

  test.todo("provides-on-union", () => {
    const result = api.composeServices([
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable", "@external"]
            )

          type Query {
            media: [Media] @shareable
          }

          union Media = Book | Movie

          type Book @key(fields: "id") {
            id: ID!
          }

          type Movie @key(fields: "id") {
            id: ID!
          }
        `),
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable", "@provides", "@external"]
            )

          type Query {
            media: [Media] @shareable @provides(fields: "... on Book { title }")
          }

          union Media = Book | Movie

          type Book @key(fields: "id") {
            id: ID!
            title: String @external
          }

          type Movie @key(fields: "id") {
            id: ID!
          }
        `),
      },
      {
        name: "c",
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@shareable"]
            )

          type Book @key(fields: "id") {
            id: ID!
            title: String @shareable
          }

          type Movie @key(fields: "id") {
            id: ID!
            title: String @shareable
          }
        `),
      },
    ]);
    console.log(result.errors);
    assertCompositionSuccess(result);
  });
});
