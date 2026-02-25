# @theguild/federation-composition

## 0.22.0

### Minor Changes

- [#267](https://github.com/graphql-hive/federation-composition/pull/267) [`3e232fa`](https://github.com/graphql-hive/federation-composition/commit/3e232fa3faf4263ec8c4daa730d8cfe5f5f78e46) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix supergraph `@join__field` generation for `@override` + `@requires` migrations and add a progressive override restriction.

  When a field with `@requires` is overridden, composition now ignores `@requires` usage coming only from the overridden source field when deciding whether to keep `@join__field(..., external: true)`. This prevents stale external annotations in the supergraph.

  Also, progressive override (`@override(..., label: ...)`) is now rejected when the overridden source field uses `@requires` (error code: `OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE`). Non-progressive override behavior is unchanged.

## 0.21.3

### Patch Changes

- [#248](https://github.com/graphql-hive/federation-composition/pull/248) [`9535d50`](https://github.com/graphql-hive/federation-composition/commit/9535d5091af7e1b1f56078c6a529c636f514e3af) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix access validation on union members when selecting `__typename` in `@requires` directives.

  The `@requires` directive validation rule (`AuthOnRequiresRule`) was not checking authorization requirements for `__typename` selections on and types. When `__typename` on a union type was selected, code would throw an unexpected error.

## 0.21.2

### Patch Changes

- [#241](https://github.com/graphql-hive/federation-composition/pull/241) [`c6e26ed`](https://github.com/graphql-hive/federation-composition/commit/c6e26ed001fb5116cabac08a55e5ed97654e129f) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fixes a bug in `@key` directive validation where an error was incorrectly reported for interfaces implementing another interface with a `@key`. The validation now correctly applies only to object types implementing the interface.

## 0.21.1

### Patch Changes

- [#230](https://github.com/graphql-hive/federation-composition/pull/230) [`2b34f17`](https://github.com/graphql-hive/federation-composition/commit/2b34f1779895590f298dbfc3d745feef24a5dc28) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Prevent subgraph-specific federation types and scalars being re-declared within the subgraph leaking into the supergraph.

## 0.21.0

### Minor Changes

- [#215](https://github.com/graphql-hive/federation-composition/pull/215) [`5edf421`](https://github.com/graphql-hive/federation-composition/commit/5edf421e0a249653ac47c801b4873dc4ba08a673) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - **Enforce correct placement of auth directives.** A new validation rule (`AUTH_REQUIREMENTS_APPLIED_ON_INTERFACE`) rejects any attempt to put these directives on interfaces, interface fields or interface objects.

  **Add transitive-auth requirements checking.** A new rule verifies that any field using `@requires` specifies at least the auth requirements of the fields it selects. If a field doesn't carry forward the `@authenticated`, `@requiresScopes` or `@policy` requirements of its dependencies, composition fails with a `MISSING_TRANSITIVE_AUTH_REQUIREMENTS` error.

  **Propagate auth requirements through interface hierarchies.** Interface types and fields now inherit `@authenticated`, `@requiresScopes` and `@policy` from the object types that implement them.

- [#215](https://github.com/graphql-hive/federation-composition/pull/215) [`5edf421`](https://github.com/graphql-hive/federation-composition/commit/5edf421e0a249653ac47c801b4873dc4ba08a673) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Disallowed using `@cost` on interfaces - you can no longer place `@cost` on an interface type, its fields, or field arguments. Composition now fails with a clear error instead of accepting it silently.

  The `@listSize` directive now validates that `sizedFields` point to list fields, not integer counters (e.g., use `edges` instead of `count`).

  Added validation for `slicingArguments` in `@listSize`. Only arguments that exist in all subgraphs are kept, invalid ones trigger an error.

### Patch Changes

- [#215](https://github.com/graphql-hive/federation-composition/pull/215) [`5edf421`](https://github.com/graphql-hive/federation-composition/commit/5edf421e0a249653ac47c801b4873dc4ba08a673) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - The `EXTERNAL_MISSING_ON_BASE` rule has been updated to handle `@interfaceObject` corner‑cases, like `@external` fields on object types, but provided by interface objects, were triggering false positives.

## 0.20.2

### Patch Changes

- [#198](https://github.com/graphql-hive/federation-composition/pull/198) [`1b98c17`](https://github.com/graphql-hive/federation-composition/commit/1b98c17d0e572fbcccbc150eeca8c4fe66f4d719) Thanks [@User!](https://github.com/User!), [@User!](https://github.com/User!)! - Fix public schema SDL in case a object type implements an inaccessible interface.

  Composing the following subgraph:

  ```graphql
  schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.3"
      import: ["@inaccessible"]
    ) {
    query: Query
  }

  type Query {

  }

  interface Node @inaccessible {
    id: ID!
  }

  type User implements Node {
    id: ID!
  }
  ```

  now result in the following valid public SDL:

  ```diff
    type Query {

    }

  - type User implements Node {
  + type User {
      id: ID!
    }
  ```

## 0.20.1

### Patch Changes

- [#185](https://github.com/graphql-hive/federation-composition/pull/185) [`5e3cb1a`](https://github.com/graphql-hive/federation-composition/commit/5e3cb1aa96f42bb6719c31e2dc8205afcdaba389) Thanks [@jdolle](https://github.com/jdolle)! - tag extraction respects @external on parent

- [#186](https://github.com/graphql-hive/federation-composition/pull/186) [`2a1475f`](https://github.com/graphql-hive/federation-composition/commit/2a1475f8bb1c0711108965b6173212ca288e9229) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Fix failing satisfiability check for interface types.

- [#167](https://github.com/graphql-hive/federation-composition/pull/167) [`3e224c8`](https://github.com/graphql-hive/federation-composition/commit/3e224c860e5edc6ef0fe73449f10895972472a18) Thanks [@jdolle](https://github.com/jdolle)! - Respect @external on parent type

## 0.20.0

### Minor Changes

- [#180](https://github.com/graphql-hive/federation-composition/pull/180) [`a208f1c`](https://github.com/graphql-hive/federation-composition/commit/a208f1cd72bb8bff2a350d0e14284c1a00644225) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Add `composeSchemaContract` function for composing schema contracts.

  Running the following script:

  ```ts
  import { composeSchemaContract } from "@theguild/federation-composition";
  import { parse } from "graphql";

  const result = composeSchemaContract(
    [
      {
        name: "a",
        typeDefs: parse(/* GraphQL */ `
          type Query {
            a: String @tag(name: "public")
          }
        `),
        url: "a.localhost",
      },
      {
        name: "b",
        typeDefs: parse(/* GraphQL */ `
          type Query {
            b: String
          }
        `),
        url: "b.localhost",
      },
    ],
    /** Tags to include and exclude */
    {
      include: new Set(["public"]),
      exclude: new Set(),
    },
    /** Exclude unreachable types */
    true,
  );

  console.log(result.publicSdl);
  ```

  Will result in the output containing only the fields tagged with `public`:

  ```graphql
  type Query {
    a: String!
  }
  ```

## 0.19.1

### Patch Changes

- [#149](https://github.com/graphql-hive/federation-composition/pull/149) [`9ae49e3`](https://github.com/graphql-hive/federation-composition/commit/9ae49e336eed84c32a810311dd05ab6abe5e7e33) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Fix external key fields on extended object types raising composition errors.

## 0.19.0

### Minor Changes

- [#156](https://github.com/graphql-hive/federation-composition/pull/156) [`46cb6bc`](https://github.com/graphql-hive/federation-composition/commit/46cb6bc1d45c6927e33d012a20c379992e53fdd2) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Support composing executable directive definitions within subgraphs into the supergraph.

## 0.18.5

### Patch Changes

- [#151](https://github.com/graphql-hive/federation-composition/pull/151) [`f9b9908`](https://github.com/graphql-hive/federation-composition/commit/f9b9908fcbfff601c53c8310bbd427c594919202) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Fix issue where the satisfiability check raised an exception for fields that share different object type and interface definitions across subgraphs.

- [#152](https://github.com/graphql-hive/federation-composition/pull/152) [`e4440a1`](https://github.com/graphql-hive/federation-composition/commit/e4440a1f3c4d33de478b67cd5ea2c3e806620f3c) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Fix issue where scalar type marked with `@inaccessible` does not fail the composition if all usages are not marked with `@inaccessible`.

  Composing the following subgraphs resulted in an invalid supergraph instead of failing the composition.

  ```graphql
  # Subgraph A
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.9"
      import: ["@inaccessible"]
    )

  type Query {
    a: Foo
  }

  scalar Foo
  ```

  ```graphql
  # Subgraph B
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.9"
      import: ["@inaccessible"]
    )

  type Query {
    b: String
  }

  scalar Foo @inaccessible
  ```

  Now it correctly raises a composition error with the message `Type "Foo" is @inaccessible but is referenced by "Query.a", which is in the API schema.`.

## 0.18.4

### Patch Changes

- [#146](https://github.com/graphql-hive/federation-composition/pull/146) [`55b48e9`](https://github.com/graphql-hive/federation-composition/commit/55b48e942ed58084fe56e33f15e3454b43c2ec24) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Resolve usage of `@requires` `FieldSet` with a union field selection to raise an `EXTERNAL_UNUSED` error.

- [#150](https://github.com/graphql-hive/federation-composition/pull/150) [`9bd8016`](https://github.com/graphql-hive/federation-composition/commit/9bd80160ab12d0ae9bbcc283c0bacc02a8830d8b) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Fix incorrectly raised `IMPLEMENTED_BY_INACCESSIBLE` error for inaccessible object fields where the object type is inaccessible.

  For example the following subgraph, will no longer result in the error `Field B.id is @inaccessible but implements the interface field Node.id, which is in the API schema.`.

  ```graphql
  schema
    @link(url: "https://specs.apollo.dev/federation/v2.9", import: ["@tag"]) {
    query: Query
  }

  type Query {
    b(id: ID! @federation__inaccessible): B @federation__inaccessible
    a(id: ID!): A
  }

  type B implements Node @federation__inaccessible {
    id: ID! @federation__inaccessible
  }

  type A implements Node {
    id: ID!
  }

  interface Node {
    id: ID!
  }
  ```

- [#147](https://github.com/graphql-hive/federation-composition/pull/147) [`8c5bc0c`](https://github.com/graphql-hive/federation-composition/commit/8c5bc0cf5744c0ee54ca71a30e19ef07baad742d) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Add support for `@provides` fragment selection sets on union type fields.

  ```graphql
  type Query {
    media: [Media] @shareable @provides(fields: "... on Book { title }")
  }
  union Media = Book | Movie
  ```

## 0.18.3

### Patch Changes

- [#143](https://github.com/graphql-hive/federation-composition/pull/143) [`bcea968`](https://github.com/graphql-hive/federation-composition/commit/bcea96897579bd92944a0b64608102f56548bacc) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Do not throw an error when encountering invalid usage of `@tag` directive within subgraphs.

## 0.18.2

### Patch Changes

- [#141](https://github.com/graphql-hive/federation-composition/pull/141) [`fdb491f`](https://github.com/graphql-hive/federation-composition/commit/fdb491ffb483119dda33791f37ec20d4cb01153e) Thanks [@ardatan](https://github.com/ardatan)! - Fixes the issue where the composition gives errors in case of the following:

  ```graphql
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.7"
      import: ["@key", "@composeDirective"]
    )
    @link(url: "https://myspecs.dev/myDirective/v1.0", import: ["@myDirective"])
    @composeDirective(name: "@myDirective")

  directive @myDirective(myarg: [MyEnum!]!) on OBJECT # A directive with a non-nullable list argument of non-nullable enums
  enum MyEnum {
    MY_ENUM_VALUE
  }
  type Query {
    myRootField: MyObject
  }

  type MyObject @myDirective(myarg: []) {
    myField: String
  }
  ```

## 0.18.1

### Patch Changes

- [#129](https://github.com/graphql-hive/federation-composition/pull/129) [`9382277`](https://github.com/graphql-hive/federation-composition/commit/9382277ae4077c6f3d9783df2664e68481618d65) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Ensure nested key fields are marked as `@shareable`

- [#132](https://github.com/graphql-hive/federation-composition/pull/132) [`ae3152c`](https://github.com/graphql-hive/federation-composition/commit/ae3152c5e829a1278de9839f8bef3bbeb0472947) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Stop collecting paths when a leaf field was reached

- [#132](https://github.com/graphql-hive/federation-composition/pull/132) [`ae3152c`](https://github.com/graphql-hive/federation-composition/commit/ae3152c5e829a1278de9839f8bef3bbeb0472947) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Avoid infinite loop when entity field returns itself

## 0.18.0

### Minor Changes

- Support progressive overrides (`@override(label: "<value>")`)

## Patch Changes

- Performance improvements (lazy compute of errors), especially noticeable in large schemas (2s -> 600ms)

## 0.17.0

### Minor Changes

- Allow to use `@composeDirective` on a built-in scalar (like `@oneOf`)

## 0.16.0

### Minor Changes

- Allow to use v2.7, but not progressive `@override` labels
- Allow to use v2.8, but not `@context` and `@fromContext` directives
- Support `@cost` and `@listSize` directives
- Add `extractLinkImplementations` function to extract information about applied specs (`@link`)

### Patch Changes

- Reuse type and direcive definitions from the composition logic to detect a supergraph spec in an SDL or transform a supergraph to a public schema

## 0.15.0

### Minor Changes

- Implement rule for `IMPLEMENTED_BY_INACCESSIBLE` error code.

## 0.14.5

### Patch Changes

- [#87](https://github.com/the-guild-org/federation/pull/87) [`9c26af9`](https://github.com/the-guild-org/federation/commit/9c26af9ff1181bf566ea45fd9b74023a16ddf410) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Do not raise `DEFAULT_VALUE_USES_INACCESSIBLE` for inaccessible default value on inaccessible field.

## 0.14.4

### Patch Changes

- [#82](https://github.com/the-guild-org/federation/pull/82) [`7d640bf`](https://github.com/the-guild-org/federation/commit/7d640bf468b17d97179cf6c76362cbf0f7b4587f) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix a child data type field not being accessible via interfaceObject

- [#81](https://github.com/the-guild-org/federation/pull/81) [`ded4b47`](https://github.com/the-guild-org/federation/commit/ded4b4786c74e1172a2aa3ace781303b08618536) Thanks [@ardatan](https://github.com/ardatan)! - Respect inaccessible enum values while creating the public schema from the supergraph AST

## 0.14.3

### Patch Changes

- [#78](https://github.com/the-guild-org/federation/pull/78) [`4e25e6d`](https://github.com/the-guild-org/federation/commit/4e25e6d4f3a3aac9a1cfaae78d2775e9d050ce7a) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - `transformSupergraphToPublicSchema` removes now `@policy`, `@requiresScopes` and `@authenticated`

## 0.14.2

### Patch Changes

- [#76](https://github.com/the-guild-org/federation/pull/76) [`a3cb724`](https://github.com/the-guild-org/federation/commit/a3cb7241dc1e07e8f8c0f2e0c2908a68c55f66d9) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix a missing `@join__field` on a query field where `@override` is used, but not in all subgraphs.

## 0.14.1

### Patch Changes

- [#74](https://github.com/the-guild-org/federation/pull/74) [`7456d14`](https://github.com/the-guild-org/federation/commit/7456d146720f22b48ea883c4b9790ff222efe9e1) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Show TYPE_KIND_MISMATCH and ignore INTERFACE_FIELD_NO_IMPLEM when there is a type kind mismatch

## 0.14.0

### Minor Changes

- [#72](https://github.com/the-guild-org/federation/pull/72) [`780892d`](https://github.com/the-guild-org/federation/commit/780892d4a00a296daab5bee895c39cc031cf2061) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support directives on enum values and unions

## 0.13.0

### Minor Changes

- [#70](https://github.com/the-guild-org/federation/pull/70) [`627dea9`](https://github.com/the-guild-org/federation/commit/627dea925bfb6826c485c0b5c8053cb0faffa43c) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support directives on enum type definitions and extensions

## 0.12.1

### Patch Changes

- [#68](https://github.com/the-guild-org/federation/pull/68) [`51dd57a`](https://github.com/the-guild-org/federation/commit/51dd57a1710564f436a346b3bada7b921fc73f05) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Unknown types are now always reported as GraphQLError (previously in some logic paths, it was an
  exception).

## 0.12.0

### Minor Changes

- [#66](https://github.com/the-guild-org/federation/pull/66) [`7603a4e`](https://github.com/the-guild-org/federation/commit/7603a4e1d439038816b43773617d756f1cb8a0f9) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support INTERFACE_FIELD_NO_IMPLEM

## 0.11.4

### Patch Changes

- [#64](https://github.com/the-guild-org/federation/pull/64)
  [`9ec8078`](https://github.com/the-guild-org/federation/commit/9ec80789a8e4926c04dc77d5f5b85347d5934c76)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - fix: detect incorrect subtypes of
  interface fields across subgraphs

## 0.11.3

### Patch Changes

- [#62](https://github.com/the-guild-org/federation/pull/62)
  [`e50bc90`](https://github.com/the-guild-org/federation/commit/e50bc90d4dc65769dbe44fa01994148d968755dc)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix: do not expose `federation__Scope`
  and `federation__Policy` scalar definitions to a supergraph

## 0.11.2

### Patch Changes

- [#60](https://github.com/the-guild-org/federation/pull/60)
  [`2f7fef1`](https://github.com/the-guild-org/federation/commit/2f7fef10409a25f8366182448a48e72d5451abf9)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Normalize enum values to be printed as
  enum values in Supergraph SDL, even if the user's subgraph schema has them as strings

## 0.11.1

### Patch Changes

- [#58](https://github.com/the-guild-org/federation/pull/58)
  [`ab707b9`](https://github.com/the-guild-org/federation/commit/ab707b9517c141377ab10d46ec6ce2efa1401450)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support directives on Input Object
  types

## 0.11.0

### Minor Changes

- [#52](https://github.com/the-guild-org/federation/pull/52)
  [`589effd`](https://github.com/the-guild-org/federation/commit/589effd5b82286704db2a4678bf47ffe33e01c0d)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support @interfaceObject directive

### Patch Changes

- [#52](https://github.com/the-guild-org/federation/pull/52)
  [`589effd`](https://github.com/the-guild-org/federation/commit/589effd5b82286704db2a4678bf47ffe33e01c0d)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Improve
  INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE

## 0.10.1

### Patch Changes

- [#55](https://github.com/the-guild-org/federation/pull/55)
  [`5c4431d`](https://github.com/the-guild-org/federation/commit/5c4431da9ce343d3bb7bf9db30b6e2ceb026e2e3)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - fix esm support

## 0.10.0

### Minor Changes

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Proper implementation of
  SATISFIABILITY_ERROR

### Patch Changes

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix REQUIRES_FIELDS_MISSING_EXTERNAL in
  Fed v1

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix FIELD_TYPE_MISMATCH for unions and
  union members

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix PROVIDES_FIELDS_MISSING_EXTERNAL in
  Fed v1

- [#51](https://github.com/the-guild-org/federation/pull/51)
  [`8cd5287`](https://github.com/the-guild-org/federation/commit/8cd52870faa34ca174bc31a79c41d11b66197464)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix REQUIRES_INVALID_FIELDS_TYPE for
  enum value

## 0.9.0

### Minor Changes

- [#49](https://github.com/the-guild-org/federation/pull/49)
  [`d6da339`](https://github.com/the-guild-org/federation/commit/d6da339adf8e1e8b71a06a60e0defb3b12ff0df8)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Adds CompositionSuccess.publicSdl - SDL
  with only the queryable fields

## 0.8.2

### Patch Changes

- [#46](https://github.com/the-guild-org/federation/pull/46)
  [`cfa9950`](https://github.com/the-guild-org/federation/commit/cfa9950c513747b26e4fd67412a9e0d5b931c6c0)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add `requiresScopes__Scope` and
  `policy__Policy` to `transformSupergraphToPublicSchema`

- [#44](https://github.com/the-guild-org/federation/pull/44)
  [`de983b0`](https://github.com/the-guild-org/federation/commit/de983b02479bdb4aee80bd42f6faece62586a45f)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add containsSupergraphSpec to detect if
  Supergraph related scalars, enums or directives are used

## 0.8.1

### Patch Changes

- [#42](https://github.com/the-guild-org/federation/pull/42)
  [`f858c3f`](https://github.com/the-guild-org/federation/commit/f858c3fd1fac62915cf2d354f5bf001a369104b9)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - Fix REQUIRED_INACCESSIBLE occurring on inaccessible
  fields/input types

## 0.8.0

### Minor Changes

- [#40](https://github.com/the-guild-org/federation/pull/40)
  [`4cba351`](https://github.com/the-guild-org/federation/commit/4cba35100e751fee5a9e531931b85d586f35a01c)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - Implement validation rules for
  `REQUIRED_INACCESSIBLE` for input types and field arguments.

## 0.7.1

### Patch Changes

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Visit every field in provides and
  requires directives

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix unnecessary
  join\_\_field(override:) on Query fields when it points to non-existing subgraph

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Deduplicate composed directives

- [#39](https://github.com/the-guild-org/federation/pull/39)
  [`e77eb2c`](https://github.com/the-guild-org/federation/commit/e77eb2c4e7d4ab09aeb08946d9c241e4d5b7757b)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - Ignore inaccessible field arguments within the
  `DEFAULT_VALUE_USES_INACCESSIBLE` rule.

  Fixes an issue where an inaccessible field argument uses a default value that is inaccessible
  would cause a false error.

  ```graphql
  type User @key(fields: "id") {
    id: ID
    friends(type: FriendType = FAMILY @inaccessible): [User!]!
  }

  enum FriendType {
    FAMILY @inaccessible
    FRIEND
  }
  ```

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Remove duplicated link spec definitions

- [#36](https://github.com/the-guild-org/federation/pull/36)
  [`fdba937`](https://github.com/the-guild-org/federation/commit/fdba937f5a3fd6317d08a496129d4242f2c38df4)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Drop unused fields marked with
  @external only in a single type in Fed v1

- [`220dfc0`](https://github.com/the-guild-org/federation/commit/220dfc0a760da4cb94c811a113641c16212868a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix missing usedOverridden on
  non-external key field

## 0.7.0

### Minor Changes

- [`88a3fd0`](https://github.com/the-guild-org/federation/commit/88a3fd0bcda6f8f8fbd90c8829be6809c60d368e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Validate directive definitions

### Patch Changes

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix missing @join\_\_field on
  non-external, but shareable fields, with @override in some graphs

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix FIELD_TYPE_MISMATCH - support
  [User!] vs [User] in output types

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support @join\_\_field(usedOverridden:)

- [`ee34815`](https://github.com/the-guild-org/federation/commit/ee348151caf0d7fe0a3099c8765d2f89f714f584)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix ProvidedArgumentsOnDirectivesRule
  and allow to use "[]" when "[String]" is expected

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - delete subgraph spec according to
  schema definition/extension object

- [`88a3fd0`](https://github.com/the-guild-org/federation/commit/88a3fd0bcda6f8f8fbd90c8829be6809c60d368e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - fix: allow to overwrite specified
  directives

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Ignore inaccessible enum values in
  ENUM_VALUE_MISMATCH rule

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Improve SATISFIABILITY_ERROR - resolve
  query path step by step

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix description of fields with
  @override

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Allow @key(fields: ["a", "b"]) in
  Federation v1

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix unnecessary join\_\_field(external)
  for extension type where field is not needed by the query planner

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix unnecessary join\_\_field(external:
  true) on key fields

- [`a8a253d`](https://github.com/the-guild-org/federation/commit/a8a253d9a7181f12583699652b3ecd4cfb2ed302)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - SATISFIABILITY_ERROR improvements

- [`a578a92`](https://github.com/the-guild-org/federation/commit/a578a9298a71c532a3f81234d182656e2a327091)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix @join\_\_field(external: true)
  missing when field is overridden

- [`56b6c95`](https://github.com/the-guild-org/federation/commit/56b6c9526a071dd0676024c88a273f04e58968a7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Improve SATISFIABILITY_ERROR - check
  satisfiability of non-entity types

## 0.6.2

### Patch Changes

- [`1ddf34e`](https://github.com/the-guild-org/federation/commit/1ddf34e0d3e55815cf2d9393a4ea58547cf2157e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix EXTERNAL_ARGUMENT_MISSING - include
  nullable arguments as well

- [`1ddf34e`](https://github.com/the-guild-org/federation/commit/1ddf34e0d3e55815cf2d9393a4ea58547cf2157e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Merge type definitions and type
  extensions when validating fields used in @requires, @provides and @key

- [`2525a24`](https://github.com/the-guild-org/federation/commit/2525a24e07f758d9b6898aa11f885bafd90e504e)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support [T!]! type in @key(fields),
  @provides(fields) and @requires(fields)

## 0.6.1

### Patch Changes

- [`55343ba`](https://github.com/the-guild-org/federation/commit/55343baf4a71984bc938c0f89d49a86bb8407a26)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix missing join\_\_field

- [`55343ba`](https://github.com/the-guild-org/federation/commit/55343baf4a71984bc938c0f89d49a86bb8407a26)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix default values

- [`55343ba`](https://github.com/the-guild-org/federation/commit/55343baf4a71984bc938c0f89d49a86bb8407a26)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - fix: cannot move subgraphs without @key
  and common query path

- [`55343ba`](https://github.com/the-guild-org/federation/commit/55343baf4a71984bc938c0f89d49a86bb8407a26)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Ignore specified directives and scalars
  when printing supergraph

## 0.6.0

### Minor Changes

- [`9195942`](https://github.com/the-guild-org/federation/commit/9195942c97646d5bcd326632358713a8676115b3)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Detect composed directives without spec

### Patch Changes

- [`3196317`](https://github.com/the-guild-org/federation/commit/3196317a479d289d52f051255c5d24db1c673936)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix field sharing logic for Federation
  v1

- [`af15843`](https://github.com/the-guild-org/federation/commit/af15843269c919ead82cec7d8c37d61c9bcde9ec)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix OVERRIDE_SOURCE_HAS_OVERRIDE rule
  to find circular refs

- [`c182a8a`](https://github.com/the-guild-org/federation/commit/c182a8a581fcc1cff2e08253b70f39592ed796b7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix discoverability of directive
  definitions

- [`c182a8a`](https://github.com/the-guild-org/federation/commit/c182a8a581fcc1cff2e08253b70f39592ed796b7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix descriptions on arguments of object
  type fields

- [`cab3b49`](https://github.com/the-guild-org/federation/commit/cab3b49195a8a2e920c4d1d08ddb4bd030e8b3b8)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix adding unnecessary
  `@join__type(extension:true)`

- [`af15843`](https://github.com/the-guild-org/federation/commit/af15843269c919ead82cec7d8c37d61c9bcde9ec)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Prevent shareable fields on root level
  subscription object

## 0.5.0

### Minor Changes

- [#28](https://github.com/the-guild-org/federation/pull/28)
  [`21fa482`](https://github.com/the-guild-org/federation/commit/21fa482171d286f94cecd57b10461a30d0044b64)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support v2.4, v2.5 and v2.6

## 0.4.0

### Minor Changes

- [#25](https://github.com/the-guild-org/federation/pull/25)
  [`c17a037`](https://github.com/the-guild-org/federation/commit/c17a037f8ed1ce151bac275a3a31f3d4cd2d0728)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - PROVIDES_INVALID_FIELDS: empty
  selection set

### Patch Changes

- [#26](https://github.com/the-guild-org/federation/pull/26)
  [`3c45c20`](https://github.com/the-guild-org/federation/commit/3c45c20e7356d5a133dd8c0fa0dcc549538f7718)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - INVALID_FIELD_SHARING: adjust the check
  to detect valid override directive

## 0.3.0

### Minor Changes

- [#23](https://github.com/the-guild-org/federation/pull/23)
  [`2d72e03`](https://github.com/the-guild-org/federation/commit/2d72e039929022d3eefedacdc6e5a7a1d85f7650)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add sortSDL function to sort
  DocumentNode (type system definitions and extensions)

## 0.2.0

### Minor Changes

- [#21](https://github.com/the-guild-org/federation/pull/21)
  [`443283e`](https://github.com/the-guild-org/federation/commit/443283e22e89934a268b7a6318c02ffc3bfbf464)
  Thanks [@n1ru4l](https://github.com/n1ru4l)! - Remove `stripFederationFromSupergraph` in favor of
  `transformSupergraphToPublicSchema`.

  Instead of stripping only federation specific types, `transformSupergraphToPublicSchema` yields
  the public api schema as served by the gateway.

## 0.1.4

### Patch Changes

- [#19](https://github.com/the-guild-org/federation/pull/19)
  [`e0ef0bb`](https://github.com/the-guild-org/federation/commit/e0ef0bb1201225aa2f1e5b400803c07eeed6b29a)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Make `stripFederationFromSupergraph`
  less strict and remove only Federation directives

## 0.1.3

### Patch Changes

- [#17](https://github.com/the-guild-org/federation/pull/17)
  [`a508ad2`](https://github.com/the-guild-org/federation/commit/a508ad247773e0bacca1773cafd2b7a39d93b4e7)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - SATISFIABILITY_ERROR - allow to resolve
  a field via entity type's child

## 0.1.2

### Patch Changes

- [#15](https://github.com/the-guild-org/federation/pull/15)
  [`37e164c`](https://github.com/the-guild-org/federation/commit/37e164c66c0c3219791e4c074a602774accd08b2)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add join**FieldSet, link**Import,
  link\_\_Purpose to stripFederationFromSupergraph

## 0.1.1

### Patch Changes

- [#12](https://github.com/the-guild-org/federation/pull/12)
  [`75d2117`](https://github.com/the-guild-org/federation/commit/75d2117dd6e5864888ed6c336aec1a334902c845)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add repository to package.json

## 0.1.0

### Minor Changes

- [`8574d45`](https://github.com/the-guild-org/federation/commit/8574d455c9a5cc03190d12191c1b0a7ae29f85be)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Release v0.1.0

## 0.0.0

### Minor Changes

- [#9](https://github.com/the-guild-org/federation/pull/9)
  [`b37a82d`](https://github.com/the-guild-org/federation/commit/b37a82de85347866bf027f825c17be9f122d6ff9)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Initial version

### Patch Changes

- [`1196bde`](https://github.com/the-guild-org/federation/commit/1196bde67a6db8fe4eb32d2c1ad9dcd2a0793912)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Report error when interfaceObject
  directive is detected

- [`1196bde`](https://github.com/the-guild-org/federation/commit/1196bde67a6db8fe4eb32d2c1ad9dcd2a0793912)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Fix a case when all fields are marked
  as external and are only used by key directive

- [`1196bde`](https://github.com/the-guild-org/federation/commit/1196bde67a6db8fe4eb32d2c1ad9dcd2a0793912)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Init

- [`1196bde`](https://github.com/the-guild-org/federation/commit/1196bde67a6db8fe4eb32d2c1ad9dcd2a0793912)
  Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Add validateSubgraph function
