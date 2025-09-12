import { describe, test, expect } from "vitest";
import { composeSchemaContract } from "../../src/contracts/schema-contract.js";
import { parse } from "graphql";
import { CompositionSuccess } from "../../src/compose.js";

describe("composeSchemaContract", () => {
  test("can compose a schema contract", () => {
    const result = composeSchemaContract(
      [
        {
          name: "a",
          typeDefs: parse(/* GraphQL */ `
            type Query {
              a: String @tag(name: "a")
            }
          `),
        },
        {
          name: "b",
          typeDefs: parse(/* GraphQL */ `
            type Query {
              b: String @tag(name: "b")
            }
          `),
        },
      ],
      {
        include: new Set("a"),
        exclude: new Set(),
      },
      true,
    );

    expect(result.errors).toEqual(undefined);
    expect(result.supergraphSdl).toMatchInlineSnapshot(`
      "schema @link(url: "https://specs.apollo.dev/link/v1.0") @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) @link(url: "https://specs.apollo.dev/inaccessible/v0.2", for: SECURITY) {
        query: Query
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

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

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

      enum join__Graph {
        A @join__graph(name: "a", url: "")
        B @join__graph(name: "b", url: "")
      }

      type Query @join__type(graph: A) @join__type(graph: B) {
        a: String @join__field(graph: A)
        b: String @join__field(graph: B) @inaccessible
      }"
    `);
    expect((result as CompositionSuccess).publicSdl).toMatchInlineSnapshot(`
      "type Query {
        a: String
      }"
    `);
  });

  test("contract: mutation type is not part of the public schema if all fields are excluded", () => {
    const sdl = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
        mutation: Mutation
      }

      type Query {
        field1: String!
      }

      type Mutation {
        field1: ID! @tag(name: "exclude")
      }
    `;

    const sdl2 = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
        mutation: Mutation
      }

      type Query {
        field2: String!
      }

      type Mutation {
        field2: ID! @tag(name: "exclude")
      }
    `;

    const result = composeSchemaContract(
      [
        {
          url: "https://lol.de",
          typeDefs: parse(sdl),
          name: "FOO_GRAPHQL",
        },
        {
          typeDefs: parse(sdl2),
          name: "FOO2_GRAPHQL",
          url: "https://trolol.de",
        },
      ],
      {
        include: new Set(),
        exclude: new Set(["exclude"]),
      },
      true,
    );

    expect(result.errors).toEqual(undefined);
    expect((result as CompositionSuccess).publicSdl).toMatchInlineSnapshot(`
      "type Query {
        field1: String!
        field2: String!
      }"
    `);
    expect(result.supergraphSdl).toMatchInlineSnapshot(`
      "schema @link(url: "https://specs.apollo.dev/link/v1.0") @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) @link(url: "https://specs.apollo.dev/inaccessible/v0.2", for: SECURITY) {
        query: Query
        mutation: Mutation
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

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

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

      enum join__Graph {
        FOO_GRAPHQL @join__graph(name: "FOO_GRAPHQL", url: "https://lol.de")
        FOO2_GRAPHQL @join__graph(name: "FOO2_GRAPHQL", url: "https://trolol.de")
      }

      type Query @join__type(graph: FOO_GRAPHQL) @join__type(graph: FOO2_GRAPHQL) {
        field1: String! @join__field(graph: FOO_GRAPHQL)
        field2: String! @join__field(graph: FOO2_GRAPHQL)
      }

      type Mutation @join__type(graph: FOO_GRAPHQL) @join__type(graph: FOO2_GRAPHQL) @inaccessible {
        field1: ID! @join__field(graph: FOO_GRAPHQL) @inaccessible
        field2: ID! @join__field(graph: FOO2_GRAPHQL) @inaccessible
      }"
    `);
  });

  test("contract: mutation type is part of the public schema if not all fields are excluded", () => {
    const sdl = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
        mutation: Mutation
      }

      type Query {
        field1: String!
      }

      type Mutation {
        field1: ID! @tag(name: "exclude")
      }
    `;

    const sdl2 = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
        mutation: Mutation
      }

      type Query {
        field2: String!
      }

      type Mutation {
        field2: ID!
      }
    `;

    const result = composeSchemaContract(
      [
        {
          typeDefs: parse(sdl),
          name: "FOO_GRAPHQL",
          url: "https://lol.de",
        },
        {
          typeDefs: parse(sdl2),
          name: "FOO2_GRAPHQL",
          url: "https://trolol.de",
        },
      ],
      {
        include: new Set(),
        exclude: new Set(["exclude"]),
      },
      true,
    );

    expect(result.errors).toEqual(undefined);
    expect((result as CompositionSuccess).publicSdl).toMatchInlineSnapshot(`
      "type Query {
        field1: String!
        field2: String!
      }

      type Mutation {
        field2: ID!
      }"
    `);
    expect((result as CompositionSuccess).supergraphSdl).toMatchInlineSnapshot(`
      "schema @link(url: "https://specs.apollo.dev/link/v1.0") @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) @link(url: "https://specs.apollo.dev/inaccessible/v0.2", for: SECURITY) {
        query: Query
        mutation: Mutation
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

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

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

      enum join__Graph {
        FOO_GRAPHQL @join__graph(name: "FOO_GRAPHQL", url: "https://lol.de")
        FOO2_GRAPHQL @join__graph(name: "FOO2_GRAPHQL", url: "https://trolol.de")
      }

      type Query @join__type(graph: FOO_GRAPHQL) @join__type(graph: FOO2_GRAPHQL) {
        field1: String! @join__field(graph: FOO_GRAPHQL)
        field2: String! @join__field(graph: FOO2_GRAPHQL)
      }

      type Mutation @join__type(graph: FOO_GRAPHQL) @join__type(graph: FOO2_GRAPHQL) {
        field1: ID! @join__field(graph: FOO_GRAPHQL) @inaccessible
        field2: ID! @join__field(graph: FOO2_GRAPHQL)
      }"
    `);
  });

  test("contract: mutation type is not part of the public schema if no fields are included", () => {
    const sdl = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
        mutation: Mutation
      }

      type Query {
        field1: String! @tag(name: "include")
      }

      type Mutation {
        field1: ID!
      }
    `;

    const sdl2 = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
        mutation: Mutation
      }

      type Query {
        field2: String! @tag(name: "include")
      }

      type Mutation {
        field2: ID!
      }
    `;

    const result = composeSchemaContract(
      [
        {
          typeDefs: parse(sdl),
          name: "FOO_GRAPHQL",
          url: "https://lol.de",
        },
        {
          typeDefs: parse(sdl2),
          name: "FOO2_GRAPHQL",
          url: "https://trolol.de",
        },
      ],
      {
        include: new Set(["include"]),
        exclude: new Set([]),
      },
      true,
    );

    expect(result.errors).toEqual(undefined);
    expect((result as CompositionSuccess).publicSdl).toMatchInlineSnapshot(`
      "type Query {
        field1: String!
        field2: String!
      }"
    `);
    expect(result.supergraphSdl).toMatchInlineSnapshot(`
      "schema @link(url: "https://specs.apollo.dev/link/v1.0") @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) @link(url: "https://specs.apollo.dev/inaccessible/v0.2", for: SECURITY) {
        query: Query
        mutation: Mutation
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

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

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

      enum join__Graph {
        FOO_GRAPHQL @join__graph(name: "FOO_GRAPHQL", url: "https://lol.de")
        FOO2_GRAPHQL @join__graph(name: "FOO2_GRAPHQL", url: "https://trolol.de")
      }

      type Query @join__type(graph: FOO_GRAPHQL) @join__type(graph: FOO2_GRAPHQL) {
        field1: String! @join__field(graph: FOO_GRAPHQL)
        field2: String! @join__field(graph: FOO2_GRAPHQL)
      }

      type Mutation @join__type(graph: FOO_GRAPHQL) @join__type(graph: FOO2_GRAPHQL) @inaccessible {
        field1: ID! @join__field(graph: FOO_GRAPHQL) @inaccessible
        field2: ID! @join__field(graph: FOO2_GRAPHQL) @inaccessible
      }"
    `);
  });

  test("contract: mutation type is part of the public schema if at least one field is included", async () => {
    const sdl = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
        mutation: Mutation
      }

      type Query {
        field1: String! @tag(name: "include")
      }

      type Mutation {
        field1: ID!
      }
    `;

    const sdl2 = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
        mutation: Mutation
      }

      type Query {
        field2: String! @tag(name: "include")
      }

      type Mutation {
        field2: ID! @tag(name: "include")
      }
    `;

    const result = composeSchemaContract(
      [
        {
          typeDefs: parse(sdl),
          name: "FOO_GRAPHQL",
          url: "https://lol.de",
        },
        {
          typeDefs: parse(sdl2),
          name: "FOO2_GRAPHQL",
          url: "https://trolol.de",
        },
      ],
      {
        include: new Set(["include"]),
        exclude: new Set([]),
      },
      true,
    );

    expect(result.errors).toEqual(undefined);
    expect((result as CompositionSuccess).publicSdl).toMatchInlineSnapshot(`
      "type Query {
        field1: String!
        field2: String!
      }

      type Mutation {
        field2: ID!
      }"
    `);
    expect(result.supergraphSdl).toMatchInlineSnapshot(`
      "schema @link(url: "https://specs.apollo.dev/link/v1.0") @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) @link(url: "https://specs.apollo.dev/inaccessible/v0.2", for: SECURITY) {
        query: Query
        mutation: Mutation
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

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

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

      enum join__Graph {
        FOO_GRAPHQL @join__graph(name: "FOO_GRAPHQL", url: "https://lol.de")
        FOO2_GRAPHQL @join__graph(name: "FOO2_GRAPHQL", url: "https://trolol.de")
      }

      type Query @join__type(graph: FOO_GRAPHQL) @join__type(graph: FOO2_GRAPHQL) {
        field1: String! @join__field(graph: FOO_GRAPHQL)
        field2: String! @join__field(graph: FOO2_GRAPHQL)
      }

      type Mutation @join__type(graph: FOO_GRAPHQL) @join__type(graph: FOO2_GRAPHQL) {
        field1: ID! @join__field(graph: FOO_GRAPHQL) @inaccessible
        field2: ID! @join__field(graph: FOO2_GRAPHQL)
      }"
    `);
  });

  test("contract: scalar is inaccessible, despite being included in at least one subraph", async () => {
    const sdl2 = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
      }

      type Query {
        field1: Foo!
      }

      type Foo {
        field: Brr @tag(name: "include")
      }

      scalar Brr @tag(name: "include")
    `;

    const sdl = /* GraphQL */ `
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.3"
          import: ["@tag"]
        ) {
        query: Query
      }

      type Query {
        c: Int @tag(name: "include")
      }

      scalar Brr
    `;

    const result = composeSchemaContract(
      [
        {
          typeDefs: parse(sdl),
          name: "FOO_GRAPHQL",
          url: "https://lol.de",
        },
        {
          typeDefs: parse(sdl2),
          name: "FOO2_GRAPHQL",
          url: "https://trolol.de",
        },
      ],
      {
        include: new Set(["include"]),
        exclude: new Set([]),
      },
      false,
    );

    expect(result.errors).toEqual(undefined);
    expect((result as CompositionSuccess).publicSdl).toMatchInlineSnapshot(`
      "scalar Brr

      type Query {
        c: Int
      }

      type Foo {
        field: Brr
      }"
    `);
    expect(result.supergraphSdl).toMatchInlineSnapshot(`
      "

          schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
          
          
          @link(url: "https://specs.apollo.dev/inaccessible/v0.2", for: SECURITY)
          
          
          
          
        {
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

          scalar join__FieldSet
          
        
        
        directive @link(
          url: String
          as: String
          for: link__Purpose
          import: [link__Import]
        ) repeatable on SCHEMA

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

        
        
        
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

        
        
        
        
      enum join__Graph {
        FOO_GRAPHQL @join__graph(name: "FOO_GRAPHQL", url: "https://lol.de") 
        FOO2_GRAPHQL @join__graph(name: "FOO2_GRAPHQL", url: "https://trolol.de") 
      }

      scalar Brr @join__type(graph: FOO_GRAPHQL)  @join__type(graph: FOO2_GRAPHQL) 

      type Query @join__type(graph: FOO_GRAPHQL)  @join__type(graph: FOO2_GRAPHQL)  {
        c: Int @join__field(graph: FOO_GRAPHQL) 
        field1: Foo! @join__field(graph: FOO2_GRAPHQL)  @inaccessible
      }

      type Foo @join__type(graph: FOO2_GRAPHQL)  {
        field: Brr
      }
          "
    `);

    const line = result.supergraphSdl
      ?.split("\n")
      .find((line) => line.includes("scalar Brr"));
    expect(line).toEqual(
      `scalar Brr @join__type(graph: FOO_GRAPHQL)  @join__type(graph: FOO2_GRAPHQL) `,
    );
  });
});
