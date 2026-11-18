---
"@theguild/federation-composition": patch
---

Be lenient about the shape of directive argument values: accept an unquoted, enum-like value where the argument is declared as `String` (`@tag(name: Public)`), and a quoted string where the argument is declared as an enum (`@example(level: "HIGH")`, when the enum has that value). Both are treated as the expected value.
