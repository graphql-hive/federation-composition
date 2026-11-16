---
"@theguild/federation-composition": patch
---

fix: preserve composed directives with executable locations in supergraph

`@composeDirective` was stripping directive definitions that only had executable locations (`QUERY`, `MUTATION`, `FIELD`, `VARIABLE_DEFINITION`) from the supergraph. Directives with schema-level locations (`OBJECT`, `FIELD_DEFINITION`) were unaffected. This fix skips the executable directive stripping logic for composed directives entirely, since they were explicitly requested via `@composeDirective`.
