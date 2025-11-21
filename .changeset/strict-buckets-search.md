---
"@theguild/federation-composition": minor
---

**Enforce correct placement of auth directives.** A new validation rule (`AUTH_REQUIREMENTS_APPLIED_ON_INTERFACE`) rejects any attempt to put these directives on interfaces, interface fields or interface objects.

**Add transitive-auth requirements checking.** A new rule verifies that any field using `@requires` specifies at least the auth requirements of the fields it selects. If a field doesn't carry forward the `@authenticated`, `@requiresScopes` or `@policy` requirements of its dependencies, composition fails with a `MISSING_TRANSITIVE_AUTH_REQUIREMENTS` error.

**Propagate auth requirements through interface hierarchies.** Interface types and fields now inherit `@authenticated`, `@requiresScopes` and `@policy` from the object types that implement them.
