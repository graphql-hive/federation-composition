---
"@theguild/federation-composition": patch
---

Report the composition error instead of throwing when a `@requires`, `@key`, `@provides` or
`@fromContext` selection set points at a field the merged type does not have. Those selection sets
are written against a single subgraph, so when subgraphs disagree on a field's type they can no
longer be resolved against the merged supergraph state. Satisfiability and the
`@authenticated`/`@requiresScopes`/`@policy` rules now run only once the other supergraph rules
confirmed the merged state is coherent.
