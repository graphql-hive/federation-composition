---
"@theguild/federation-composition": patch
---

Fix public schema SDL in case a object type implements an inaccessible interface.


Composing the following subgraph:

```graphql
schema
  @link(
    url: "https://specs.apollo.dev/federation/v2.3"
    import: ["@inaccessible"]
  ) {
  query: Query
}

type Query {
  user: User!
}

type Node @inaccessible {
  id: ID!
}

type User implements Node {
  id: ID!
}
```

now result in the following valid public SDL:

```diff
  type Query {
    user: User!
  }

- type User implements Node {
+ type User {
    id: ID!
  }
```
