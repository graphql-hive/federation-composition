---
"@theguild/federation-composition": patch
---

Validate directive argument values against the type they are declared with at every level, so a nested list such as `[[], ["ok"]]` for `[[String!]!]!` is accepted and a bad item anywhere in a list is rejected. Tag names written unquoted are now also recognised by schema contract filters, and `@link(url:)` and `@link(as:)` stay strict, since they are read before any of this runs.
