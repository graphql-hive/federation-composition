---
"@theguild/federation-composition": patch
---

A `@fromContext` argument now reads from the nearest ancestor that sets the context. 
Composition fails when that ancestor can't resolve the context selection, even if a farther ancestor could.
