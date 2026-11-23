---
"@theguild/federation-composition": patch
---

Fail composition when a field is `@deprecated` but the interface field it implements is not.

The GraphQL specification does not allow this, and graphql-js 17 rejects such a schema. Composition used to succeed and produce a supergraph and public schema that fail schema validation.

This can happen within one subgraph, and also across subgraphs that are each valid on their own. For example, the `catalog` subgraph defines the interface and the `inventory` subgraph deprecates the field on the shared entity:

```graphql
# catalog
interface Product {
  sku: String!
  title: String
}

type Book implements Product @key(fields: "sku") {
  sku: String!
  title: String
}
```

```graphql
# inventory
type Book @key(fields: "sku") {
  sku: String! @deprecated(reason: "Use upc")
  upc: String!
  inStock: Boolean!
}
```

After merging, `Book.sku` is deprecated and `Product.sku` is not. Composition now fails with an `INVALID_GRAPHQL` error:

```
Interface field Product.sku is not deprecated, so implementation field Book.sku must not be deprecated.
```

To fix it, deprecate the interface field as well, or remove the deprecation from the implementing field.
