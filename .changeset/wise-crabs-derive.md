---
"@theguild/federation-composition": minor
---

Add `composeServicesWithContracts` to compose a supergraph together with its schema contracts.

Instead of composing all the subgraphs again for every contract, each contract is derived from the composed supergraph: the tag filter is applied to it, and only the rules about `@inaccessible` run, since those are the only ones a contract can fail. The results are the same as `composeServices` followed by `composeSchemaContract` for each contract, at a fraction of the time and memory.

```ts
const { supergraph, contracts } = composeServicesWithContracts(services, [
  { filter: { include: new Set(["public"]), exclude: new Set() } },
  {
    filter: { include: new Set(), exclude: new Set(["internal"]) },
    removeUnreachableTypes: false,
  },
]);
```

When the subgraphs fail to compose, each contract is composed from the subgraphs, as before.
