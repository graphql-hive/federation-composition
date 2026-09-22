---
"@theguild/federation-composition": patch
---

Report composition errors instead of throwing when `@requires`, `@key`, `@provides`, or `@fromContext` selections cannot be resolved against the merged supergraph.

Selection-dependent validation now runs only after the other supergraph rules confirm the merged state is valid.
