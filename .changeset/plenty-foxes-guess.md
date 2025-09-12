---
"@theguild/federation-composition": minor
---

Add `composeSchemaContract` function for composing schema contracts.

Running the following script:

```ts
import { composeSchemaContract } from "@theguild/federation-composition";
import { parse } from "graphql";

const result = composeSchemaContract(
  [
    {
      name: "a",
      typeDefs: parse(/* GraphQL */ `
        type Query {
          a: String @tag(name: "public")
        }
      `),
      url: "a.localhost",
    },
    {
      name: "b",
      typeDefs: parse(/* GraphQL */ `
        type Query {
          b: String
        }
      `),
      url: "b.localhost",
    },
  ],
  /** Tags to include and exclude */
  {
    include: new Set(["public"]),
    exclude: new Set(),
  },
  /** Exclude unreachable types */
  true,
);

console.log(result.publicSdl);
```

Will result in the output containing only the fields tagged with `public`:

```graphql
type Query {
  a: String!
}
```
