---
"@theguild/federation-composition": minor
---

Experimental support for `@context` and `@fromContext` (contextual arguments).

The support is off by default. To enable it, set `enableContextDirectives`:

```ts
composeServices(services, { enableContextDirectives: true });
```

While the flag is off, a subgraph that imports either directive is rejected with
`UNSUPPORTED_FEATURE`, as before.

`@context(name:)` makes a type a context provider. `@fromContext(field:)` gets the value of an
argument from a selection on the nearest provider. The composition validates each contextual
argument, removes the argument from the public API schema, and writes it to
`@join__field(contextArguments:)` in the supergraph.

New validation rules: `CONTEXT_NAME_INVALID`, `CONTEXT_NOT_SET`, `CONTEXT_NO_RESOLVABLE_KEY`,
`CONTEXT_INVALID_SELECTION`, `NO_CONTEXT_IN_SELECTION`,
`CONTEXTUAL_ARGUMENT_NOT_CONTEXTUAL_IN_ALL_SUBGRAPHS` and
`MISSING_TRANSITIVE_AUTH_REQUIREMENTS` for data that a field reads through a context.
