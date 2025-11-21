---
"@theguild/federation-composition": minor
---

Disallowed using `@cost` on interfaces - you can no longer place `@cost` on an interface type, its fields, or field arguments. Composition now fails with a clear error instead of accepting it silently.

The `@listSize` directive now validates that `sizedFields` point to list fields, not integer counters (e.g., use `edges` instead of `count`).

Added validation for `slicingArguments` in `@listSize`. Only arguments that exist in all subgraphs are kept, invalid ones trigger an error.
