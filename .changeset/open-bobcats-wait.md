---
"@theguild/federation-composition": patch
---

Fix incorrectly raised `IMPLEMENTED_BY_INACCESSIBLE` error for inaccessible object fields where the object type is inaccessible.

For example the following subgraph, will no longer result in the error `Field B.id is @inaccessible but implements the interface field Node.id, which is in the API schema.`.

```graphql
schema
  @link(
    url: "https://specs.apollo.dev/federation/v2.9"
    import: ["@tag"]
) {
  query: Query
}

type Query {
  b(id: ID! @federation__inaccessible): B @federation__inaccessible
  a(id: ID!): A
}

type B implements Node @federation__inaccessible {
  id: ID! @federation__inaccessible
}

type A implements Node {
  id: ID!
}

interface Node {
  id: ID!
}
```
