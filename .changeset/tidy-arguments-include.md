---
"@theguild/federation-composition": patch
---

Keep untagged arguments of included fields in schema contracts.

Previously, when a contract used an include filter, arguments of an included field were marked `@inaccessible` unless they were tagged themselves. Optional arguments silently disappeared from the contract schema, and required arguments failed composition with `REQUIRED_INACCESSIBLE`.

An argument without its own `@tag` now inherits the tags of its field, matching the behavior of Apollo contracts. Arguments with their own `@tag` are still filtered by their own tags.

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
  users(first: Int): [User]
}
```
