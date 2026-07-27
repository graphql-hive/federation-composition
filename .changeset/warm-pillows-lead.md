---
"@theguild/federation-composition": patch
---

Composition keeps `@oneOf` in the public graph, if it's defined in the supergraph

This ensures older versions of codegen and other tools that rely on the public SDL are compatible with the output.