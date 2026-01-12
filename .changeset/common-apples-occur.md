---
"@theguild/federation-composition": patch
---

Fixes a bug in `@key` directive validation where an error was incorrectly reported for interfaces implementing another interface with a `@key`. The validation now correctly applies only to object types implementing the interface.
