---
"@theguild/federation-composition": patch
---

Add support for `@provides` fragment selection sets on union type fields.

```graphql
type Query {
  media: [Media] @shareable @provides(fields: "... on Book { title }")
}
union Media = Book | Movie
```
