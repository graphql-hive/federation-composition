---
"@theguild/federation-composition": patch
---

Fix a crash when a directive shares its name with a type. Directives and types live in separate namespaces in GraphQL, but subgraph state kept both in a single map, so `directive @TaskStatus` next to `enum TaskStatus` threw `Expected TaskStatus to be an enum type` instead of composing.
