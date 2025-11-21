---
"@theguild/federation-composition": patch
---

The `EXTERNAL_MISSING_ON_BASE` rule has been updated to handle `@interfaceObject` corner‑cases, where fields defined on interface objects were incorrectly reported as missing `@external` in the base type.
