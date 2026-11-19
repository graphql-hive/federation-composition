---
"@theguild/federation-composition": patch
---

Keep required arguments of included fields in schema contracts.

Previously, when a contract used an include filter, arguments of an included field were marked `@inaccessible` unless they were tagged themselves. For required arguments this failed composition with `REQUIRED_INACCESSIBLE`.

A required argument without its own `@tag` now inherits the inclusion of its field. Optional arguments and arguments with their own `@tag` are still filtered by their own tags.

```graphql
type Query {
  user(id: ID!): User @tag(name: "public")
  users(first: Int): [User] @tag(name: "public")
}
```

With `include: ["public"]`, the contract schema now composes and contains:

```graphql
type Query {
  user(id: ID!): User
  users: [User]
}
```
