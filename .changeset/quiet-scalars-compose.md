---
"@theguild/federation-composition": patch
---

Compose `_service.sdl` of subgraphs built with `@apollo/subgraph` on federation v2.8+: the `federation__ContextFieldValue` scalar declared by such a subgraph is no longer leaked into the supergraph (Apollo Gateway/Router failed to extract subgraphs from it with `Type federation__ContextFieldValue already exists in this schema`). Adds regression tests for the `There can be only one directive named "@federation__context"` composition error.
