---
"@theguild/federation-composition": patch
---

The `EXTERNAL_MISSING_ON_BASE` rule has been updated to handle `@interfaceObject` corner‑cases, like `@external` fields on object types, but provided by interface objects, were triggering false positives.
