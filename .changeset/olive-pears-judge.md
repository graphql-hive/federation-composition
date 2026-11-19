---
"@theguild/federation-composition": patch
---

Fix directive argument values that were wrongly rejected: an `ID` argument now accepts string and int literals, an explicit `null` is accepted for any nullable argument, and `null` is accepted as an item of a nullable list item type. A list value is no longer accepted for a non-list argument, and every item of a list is now checked instead of only the first one.
