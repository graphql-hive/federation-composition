---
"@theguild/federation-composition": minor
---

Add a `skipSatisfiability` option to `composeSchemaContract`. A contract only adds `@inaccessible` to an already composed graph, so when the same services composed successfully without the contract, the satisfiability check cannot find anything new. Skipping it cuts roughly 45% of the time spent composing each contract.

```ts
const base = composeServices(services);

if (!base.errors) {
  const contract = composeSchemaContract(services, filter, true, {
    skipSatisfiability: true,
  });
}
```

The `@inaccessible` rules that contracts can trigger (for example `REFERENCED_INACCESSIBLE`, `REQUIRED_INACCESSIBLE` and `ONLY_INACCESSIBLE_CHILDREN`) keep running.
