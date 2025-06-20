---
"@theguild/federation-composition": patch
---

Fix issue where scalar type marked with `@inaccessible` does not fail the composition if all usages are not marked with `@inaccessible`.

Composing the following subgraphs resulted in an invalid supergraph instead of failing the composition.

```graphql
# Subgraph A
extend schema
  @link(
    url: "https://specs.apollo.dev/federation/v2.9"
    import: [ "@inaccessible"]
  )

type Query {
  a: Foo
}

scalar Foo
```

```graphql
# Subgraph B
extend schema
  @link(
    url: "https://specs.apollo.dev/federation/v2.9"
    import: [ "@inaccessible"]
  )

type Query {
  b: String
}

scalar Foo @inaccessible
```

Now it correctly raises a composition error with the message `Type "Foo" is @inaccessible but is referenced by "Query.a", which is in the API schema.`.
