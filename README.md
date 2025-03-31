# Federation Composition

Supports all Federation versions. Drop-in replacement for `@apollo/composition`.

🚧 Work in progress, so please check [TODOs](#todos).

## Comparison with `@apollo/composition`

- Open Source (MIT License)
- identical API
- same set of validation rules and exact same error messages
- produces Supergraph SDL (can be used with Apollo Router and every tool that supports Supergraph
  SDL)
- does not support Hints
- 3-4x faster
- up to 2x less memory usage

## Installation

```bash
# NPM
npm install @theguild/federation-composition
# PNPM
pnpm add @theguild/federation-composition
# Yarn
yarn add @theguild/federation-composition
```

## Usage

```ts
import { parse } from "graphql";
import {
  composeServices,
  compositionHasErrors,
} from "@theguild/federation-composition";

const result = composeServices([
  {
    name: "users",
    typeDefs: parse(/* GraphQL */ `
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

      type User @key(fields: "id") {
        id: ID!
        name: String!
      }

      type Query {
        users: [User]
      }
    `),
  },
  {
    name: "comments",
    typeDefs: parse(/* GraphQL */ `
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@key", "@external"]
        )

      extend type User @key(fields: "id") {
        id: ID! @external
        comments: [Comment]
      }

      type Comment {
        id: ID!
        text: String!
        author: User!
      }
    `),
  },
]);

if (compositionHasErrors(result)) {
  console.error(result.errors);
} else {
  console.log(result.supergraphSdl);
}
```

## Contributing

Install the dependencies:

```bash
pnpm install
```

Run the tests:

```bash
pnpm test
```

### How to help?

- Grab one of the failing tests and fix it.
- Add new tests to cover more cases.
- Add missing rules.
- Look for `// TODO:` comments in the code and fix/implement them.
- Todos with `// TODO: T[NUMBER]` are on Notion.
- Look for `skipIf` or `skip` in the tests.
- Refactor code (piece by piece) if you feel like it.

### Compatibility

The lack of a publicly available specification for Apollo Federation, coupled with the non
open-source license of the Apollo Composition library, makes it difficult or even impossible to
assure complete compatibility of our open-source composition library.

Given that Apollo tools utilize their composition library, there is a potential for conflicting
results between our composition library and Apollo's. This may lead to variations in the supergraph,
differing composition errors, or, in some cases, conflicting composition outcomes.

We are working to ensure that our composition library is as compatible as possible with Apollo's and
will continue to do so as we learn more about the Federation specification.

Your feedback and bug reports are welcome and appreciated.

## Supergraph SDL Composition

✅ Done

## Validation

🚧 Work in progress

### Validation rules

- ✅ `NO_QUERIES`
- ✅ `TYPE_KIND_MISMATCH`
- ✅ `EXTENSION_WITH_NO_BASE`
- ✅ `FIELD_TYPE_MISMATCH`
- ✅ `FIELD_ARGUMENT_TYPE_MISMATCH`
- ✅ `EXTERNAL_TYPE_MISMATCH`
- ✅ `ENUM_VALUE_MISMATCH`
- ✅ `EMPTY_MERGED_ENUM_TYPE`
- ✅ `EMPTY_MERGED_INPUT_TYPE`
- ✅ `OVERRIDE_SOURCE_HAS_OVERRIDE`
- ✅ `EXTERNAL_MISSING_ON_BASE`
- ✅ `REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH`
- ✅ `REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH`
- ✅ `EXTERNAL_ARGUMENT_MISSING`
- ✅ `INPUT_FIELD_DEFAULT_MISMATCH`
- ✅ `FIELD_ARGUMENT_DEFAULT_MISMATCH`
- ✅ `DEFAULT_VALUE_USES_INACCESSIBLE`
- ✅ `ONLY_INACCESSIBLE_CHILDREN`
- ✅ `REFERENCED_INACCESSIBLE`
- ✅ `INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE`
- ✅ `INVALID_FIELD_SHARING`
- ✅ `PROVIDES_INVALID_FIELDS_TYPE`
- ✅ `INVALID_GRAPHQL`
- ✅ `OVERRIDE_ON_INTERFACE`
- ✅ `OVERRIDE_FROM_SELF_ERROR`
- ✅ `QUERY_ROOT_TYPE_INACCESSIBLE`
- ✅ `PROVIDES_UNSUPPORTED_ON_INTERFACE`
- ✅ `REQUIRES_UNSUPPORTED_ON_INTERFACE`
- ✅ `KEY_UNSUPPORTED_ON_INTERFACE`
- ✅ `KEY_INVALID_FIELDS_TYPE`
- ✅ `KEY_FIELDS_HAS_ARGS`
- ✅ `KEY_FIELDS_SELECT_INVALID_TYPE`
- ✅ `KEY_INVALID_FIELDS`
- ✅ `REQUIRES_INVALID_FIELDS`
- ✅ `REQUIRES_INVALID_FIELDS_TYPE`
- ✅ `MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL`
- ✅ `INTERFACE_KEY_NOT_ON_IMPLEMENTATION`
- ✅ `PROVIDES_FIELDS_MISSING_EXTERNAL`
- ✅ `REQUIRES_FIELDS_MISSING_EXTERNAL`
- ✅ `PROVIDES_ON_NON_OBJECT_FIELD`
- ✅ `INVALID_SUBGRAPH_NAME`
- ✅ `PROVIDES_FIELDS_HAS_ARGS`
- ✅ `PROVIDES_INVALID_FIELDS`
- ✅ `EXTERNAL_UNUSED`
- ✅ `DIRECTIVE_COMPOSITION_ERROR`
- ✅ `ROOT_QUERY_USED`
- ✅ `ROOT_MUTATION_USED`
- ✅ `ROOT_SUBSCRIPTION_USED`
- ✅ `INVALID_SHAREABLE_USAGE`
- ✅ `DIRECTIVE_DEFINITION_INVALID`
- ✅ `KEY_DIRECTIVE_IN_FIELDS_ARG`
- ✅ `PROVIDES_DIRECTIVE_IN_FIELDS_ARG`
- ✅ `REQUIRES_DIRECTIVE_IN_FIELDS_ARG`
- ✅ `TYPE_DEFINITION_INVALID`
- ✅ `OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE`
- ✅ `INTERFACE_OBJECT_USAGE_ERROR`
- ✅ `REQUIRED_INACCESSIBLE`
- ✅ `SATISFIABILITY_ERROR`
- ✅ `INTERFACE_FIELD_NO_IMPLEM`
- ✅ `LINK_IMPORT_NAME_MISMATCH`
- ✅ `IMPLEMENTED_BY_INACCESSIBLE`

### TODOs

- [ ] `DISALLOWED_INACCESSIBLE`
- [ ] `EXTERNAL_ARGUMENT_DEFAULT_MISMATCH`
- [ ] `EXTERNAL_ARGUMENT_TYPE_MISMATCH`
- [ ] `EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE`
- [ ] `UNSUPPORTED_LINKED_FEATURE`
- [ ] `TYPE_WITH_ONLY_UNUSED_EXTERNAL`
