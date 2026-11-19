---
"@theguild/federation-composition": patch
---

Accept two ways of writing directive argument values that were rejected before: an unquoted value where the argument is a `String` or `ID` (`@tag(name: Public)`), and a quoted value where the argument is an enum (`@example(level: "HIGH")`, if the enum has that value). Both are read as the value that was meant.
