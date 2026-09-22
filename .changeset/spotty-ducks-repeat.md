---
"@theguild/federation-composition": patch
---

Stop reporting a duplicate `FIELD_TYPE_MISMATCH` next to `EXTERNAL_TYPE_MISMATCH`. An `@external`
declaration mirrors a field it does not own, so it no longer takes part in the field type merge
check - `ExternalTypeMismatchRule` already compares it against the merged type. Key fields are
excepted, since that rule skips them.
