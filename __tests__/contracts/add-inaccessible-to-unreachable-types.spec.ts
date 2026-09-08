import { parse } from "graphql";
import { CompositionSuccess, extractLinkImplementations } from "../../src";
import { addInaccessibleToUnreachableTypes } from "../../src/contracts/add-inaccessible-to-unreachable-types";
import { composeServices } from "../../src";
import { expect, test } from "vitest";

test("Filters based on tags", async () => {
  let compositionResult = composeServices([
    {
      name: "user",
      url: "https://user-example.graphql-hive.com",
      typeDefs: parse(`
        type Query {
          user: User
        }
        type User {
          id: ID!
          name: String
        }

        type Unused {
          foo: String
        }
      `),
    },
  ]);

  expect(compositionResult.errors).toBe(undefined);
  expect(compositionResult.supergraphSdl).not.toBe(undefined);
  const { resolveImportName } = extractLinkImplementations(
    parse(compositionResult.supergraphSdl!),
  );

  compositionResult = addInaccessibleToUnreachableTypes(
    resolveImportName,
    compositionResult as CompositionSuccess,
  );

  expect(compositionResult.supergraphSdl).toMatchInlineSnapshot(`
    "schema @link(url: "https://specs.apollo.dev/link/v1.0") @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) {
      query: Query
    }

    directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    directive @join__field(
      graph: join__Graph
      requires: join__FieldSet
      provides: join__FieldSet
      type: String
      external: Boolean
      override: String
      usedOverridden: Boolean
    ) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

    directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

    directive @join__type(
      graph: join__Graph!
      key: join__FieldSet
      extension: Boolean! = false
      resolvable: Boolean! = true
      isInterfaceObject: Boolean! = false
    ) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

    directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

    scalar join__FieldSet

    directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

    scalar link__Import

    enum link__Purpose {
      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY
      """
      \`EXECUTION\` features provide metadata necessary for operation execution.
      """
      EXECUTION
    }

    enum join__Graph {
      USER @join__graph(name: "user", url: "https://user-example.graphql-hive.com")
    }

    type Query @join__type(graph: USER) {
      user: User
    }

    type User @join__type(graph: USER) {
      id: ID!
      name: String
    }

    type Unused @join__type(graph: USER) @inaccessible {
      foo: String
    }"
  `);
  expect(compositionResult.publicSdl).toMatchInlineSnapshot(`
    "type Query {
      user: User
    }

    type User {
      id: ID!
      name: String
    }"
  `);
});

test("Inaccessible is not added to a custom directive (or its custom scalar argument) included via @composeDirective", async () => {
  let compositionResult = composeServices([
    {
      name: "user",
      url: "https://user-example.graphql-hive.com",
      typeDefs: parse(`
        extend schema
          @link(url: "https://specs.apollo.dev/federation/v2.9", import: ["@composeDirective"])
          @link(url: "https://myspecs.dev/custom/v1.0", import: ["@custom"])
          @composeDirective(name: "@custom")

        scalar CustomScalar

        directive @custom(arg: CustomScalar) on FIELD_DEFINITION

        type Query {
          user: User
        }
        type User {
          id: ID!
          name: String @custom(arg: "foo")
        }
      `),
    },
  ]);

  expect(compositionResult.errors).toBe(undefined);
  expect(compositionResult.supergraphSdl).not.toBe(undefined);
  const { resolveImportName } = extractLinkImplementations(
    parse(compositionResult.supergraphSdl!),
  );

  compositionResult = addInaccessibleToUnreachableTypes(
    resolveImportName,
    compositionResult as CompositionSuccess,
  );
  expect(compositionResult.supergraphSdl).to.include(
    "directive @custom(arg: CustomScalar) on FIELD_DEFINITION",
  );
  expect(compositionResult.supergraphSdl).to.include(
    "scalar CustomScalar @join__type(graph: USER)",
  );
  expect(compositionResult.supergraphSdl).to.not.include(
    "scalar CustomScalar @join__type(graph: USER) @inaccessible",
  );
});

test("Inaccessible is not added on built-in Federation types ContextArgument and FieldValue", async () => {
  const sdl = /* GraphQL */ `
    extend schema
      @link(url: "https://specs.apollo.dev/federation/v2.9", import: ["@key"])

    type Query {
      me: Me
    }

    type Me @key(fields: "id") {
      id: ID!
    }
  `;

  let compositionResult = composeServices([
    {
      name: "user",
      url: "https://noop.graphql-hive.com",
      typeDefs: parse(sdl),
    },
  ]);

  expect(compositionResult.errors).toBe(undefined);
  expect(compositionResult.supergraphSdl).not.toBe(undefined);
  const { resolveImportName } = extractLinkImplementations(
    parse(compositionResult.supergraphSdl!),
  );

  compositionResult = addInaccessibleToUnreachableTypes(
    resolveImportName,
    compositionResult as CompositionSuccess,
  );

  expect(compositionResult.supergraphSdl).to.include(
    "scalar join__FieldValue\n",
  );
  expect(compositionResult.supergraphSdl).to.not.include(
    "scalar join__FieldValue @inaccessible",
  );
  expect(compositionResult.supergraphSdl).to.not.include(
    "input join__ContextArgument @inaccessible {",
  );
  expect(compositionResult.supergraphSdl).to.include(
    "input join__ContextArgument {\n",
  );
});
