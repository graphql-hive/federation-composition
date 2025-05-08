---
"@theguild/federation-composition": patch
---

Fixes the issue where the composition gives errors in case of the following:

```graphql
extend schema
  @link(
    url: "https://specs.apollo.dev/federation/v2.7"
    import: ["@key", "@composeDirective"]
  )
  @link(url: "https://myspecs.dev/myDirective/v1.0", import: ["@myDirective"])
  @composeDirective(name: "@myDirective")

directive @myDirective(myarg: [MyEnum!]!) on OBJECT # A directive with a non-nullable list argument of non-nullable enums
enum MyEnum {
  MY_ENUM_VALUE
}
type Query {
  myRootField: MyObject
}

type MyObject @myDirective(myarg: []) {
  myField: String
}
```
