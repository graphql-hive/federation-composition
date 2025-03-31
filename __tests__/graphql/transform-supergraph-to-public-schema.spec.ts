import { parse, print } from "graphql";
import { describe, expect, test } from "vitest";
import { transformSupergraphToPublicSchema } from "../../src/graphql/transform-supergraph-to-public-schema";

describe("transformSupergraphToPublicSchema", () => {
  describe("@inaccessible", () => {
    test("scalar removal", () => {
      const sdl = parse(/* GraphQL */ `
        scalar Scalar1 @inaccessible
        scalar Scalar2
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot('"scalar Scalar2"');
    });
    test("enum removal", () => {
      const sdl = parse(/* GraphQL */ `
        enum Enum1 @inaccessible {
          VALUE1
          VALUE2
        }
        enum Enum2 {
          VALUE1
          VALUE2
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "enum Enum2 {
          VALUE1
          VALUE2
        }"
      `);
    });
    test("enum value removal", () => {
      const sdl = parse(/* GraphQL */ `
        enum Enum {
          VALUE1 @inaccessible
          VALUE2
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "enum Enum {
          VALUE2
        }"
      `);
    });
    test("object type removal", () => {
      const sdl = parse(/* GraphQL */ `
        type Object1 @inaccessible {
          field1: String
        }
        type Object2 {
          field1: String
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "type Object2 {
          field1: String
        }"
      `);
    });
    test("object field removal", () => {
      const sdl = parse(/* GraphQL */ `
        type Object {
          field1: String @inaccessible
          field2: String
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "type Object {
          field2: String
        }"
      `);
    });
    test("interface type removal", () => {
      const sdl = parse(/* GraphQL */ `
        interface Interface1 @inaccessible {
          field1: String
        }
        interface Interface2 {
          field1: String
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "interface Interface2 {
          field1: String
        }"
      `);
    });
    test("interface field removal", () => {
      const sdl = parse(/* GraphQL */ `
        interface Interface {
          field1: String @inaccessible
          field2: String
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "interface Interface {
          field2: String
        }"
      `);
    });
    test("union type removal", () => {
      const sdl = parse(/* GraphQL */ `
        union Union1 @inaccessible = Type1 | Type2
        union Union2 = Type1 | Type2
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(
        '"union Union2 = Type1 | Type2"',
      );
    });
    test("object field argument removal", () => {
      const sdl = parse(/* GraphQL */ `
        type Object {
          field1(arg1: String @inaccessible): String
          field2(arg1: String): String
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "type Object {
          field1: String
          field2(arg1: String): String
        }"
      `);
    });
    test("interface field argument removal", () => {
      const sdl = parse(/* GraphQL */ `
        interface Object {
          field1(arg1: String @inaccessible): String
          field2(arg1: String): String
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "interface Object {
          field1: String
          field2(arg1: String): String
        }"
      `);
    });
    test("input object type removal", () => {
      const sdl = parse(/* GraphQL */ `
        input Input1 @inaccessible {
          field1: String
        }
        input Input2 {
          field1: String
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "input Input2 {
          field1: String
        }"
      `);
    });
    test("input object field removal", () => {
      const sdl = parse(/* GraphQL */ `
        input Input {
          field1: String @inaccessible
          field2: String
        }
      `);
      const resultSdl = transformSupergraphToPublicSchema(sdl);
      expect(print(resultSdl)).toMatchInlineSnapshot(`
        "input Input {
          field2: String
        }"
      `);
    });
  });
  test("strips out all federation directives and types", () => {
    const sdl = parse(/* GraphQL */ `
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
        @link(
          url: "https://specs.apollo.dev/inaccessible/v0.2"
          as: "federation__inaccessible"
          for: SECURITY
        ) {
        query: Query
      }

      directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__field(
        graph: join__Graph
        requires: join__FieldSet
        provides: join__FieldSet
        type: String
        external: Boolean
        override: String
        usedOverridden: Boolean
      ) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(
        graph: join__Graph!
        interface: String!
      ) repeatable on OBJECT | INTERFACE

      directive @join__type(
        graph: join__Graph!
        key: join__FieldSet
        extension: Boolean! = false
        resolvable: Boolean! = true
        isInterfaceObject: Boolean! = false
      ) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__unionMember(
        graph: join__Graph!
        member: String!
      ) repeatable on UNION

      directive @link(
        url: String
        as: String
        for: link__Purpose
        import: [link__Import]
      ) repeatable on SCHEMA

      scalar join__FieldSet

      enum join__Graph {
        BRRT @join__graph(name: "brrt", url: "http://localhost/graphql")
        BUBUBU @join__graph(name: "bububu", url: "http://localhost:1/graphql")
      }

      scalar link__Import

      enum link__Purpose {
        SECURITY

        EXECUTION
      }

      type Query @join__type(graph: BRRT) @join__type(graph: BUBUBU) {
        foo: Int! @join__field(graph: BRRT)
        ok1: Int! @join__field(graph: BRRT)
        a: String! @join__field(graph: BUBUBU)
        oi: Type2 @federation__inaccessible @join__field(graph: BUBUBU)
      }

      type Type2
        @join__type(graph: BRRT, key: "id", extension: true)
        @join__type(graph: BUBUBU, key: "id") {
        id: ID! @federation__inaccessible
        inStock: Boolean! @join__field(graph: BRRT)
        field1: String! @federation__inaccessible @join__field(graph: BUBUBU)
      }
    `);

    const resultSdl = transformSupergraphToPublicSchema(sdl);
    expect(print(resultSdl)).toMatchInlineSnapshot(`
      "type Query {
        foo: Int!
        ok1: Int!
        a: String!
      }

      type Type2 {
        inStock: Boolean!
      }"
    `);
  });
  test("graphql specification directives are omitted from the SDL", () => {
    const sdl = parse(/* GraphQL */ `
      directive @skip(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
      directive @include(
        if: Boolean!
      ) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
      directive @deprecated(
        reason: String = "No longer supported"
      ) on FIELD_DEFINITION | ENUM_VALUE
    `);
    const resultSdl = transformSupergraphToPublicSchema(sdl);
    expect(print(resultSdl)).toMatchInlineSnapshot('""');
  });
  test("does not omit @deprecated directive", () => {
    const sdl = parse(/* GraphQL */ `
      type Query {
        foo: String @deprecated(reason: "jooo")
      }
    `);
    const resultSdl = transformSupergraphToPublicSchema(sdl);
    expect(print(resultSdl)).toMatchInlineSnapshot(`
      "type Query {
        foo: String @deprecated(reason: "jooo")
      }"
    `);
  });
});
