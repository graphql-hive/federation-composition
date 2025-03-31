import {
  DirectiveDefinitionNode,
  EnumTypeDefinitionNode,
  ObjectTypeDefinitionNode,
  parse,
  ScalarTypeDefinitionNode,
  UnionTypeDefinitionNode,
} from "graphql";
import { describe, expect, test } from "vitest";
import { sortSDL } from "../../src";

describe("sort-sdl", () => {
  describe("object types", () => {
    test("should sort object type definitions", () => {
      const document = parse(`
              type C
              type B
              type A
            `);
      const result = sortSDL(document);
      expect(
        (result.definitions[0] as ObjectTypeDefinitionNode).name.value,
      ).toBe("A");
    });

    test("should sort fields for object types", () => {
      const document = parse(`
              type A {
                c: String
                b: String
                a: String
              }
            `);
      const result = sortSDL(document);
      const first = result.definitions[0] as ObjectTypeDefinitionNode;
      const firstField = first.fields ? first.fields[0] : null;
      expect(firstField?.name.value).toBe("a");
    });

    test("should sort directives for object types", () => {
      const document = parse(`
              type A @c @b @a
            `);
      const result = sortSDL(document);
      const first = result.definitions[0] as ObjectTypeDefinitionNode;
      const firstDirective = first.directives ? first.directives[0] : null;
      expect(firstDirective?.name.value).toBe("a");
    });

    test("should sort interfaces for object types", () => {
      const document = parse(`
                interface C
                interface B
                interface A
                type D implements C & B & A
                `);
      const result = sortSDL(document);
      const first = result.definitions.find(
        (d) => d.kind === "ObjectTypeDefinition",
      ) as ObjectTypeDefinitionNode;
      const firstInterface = first.interfaces ? first.interfaces[0] : null;
      expect(firstInterface?.name.value).toBe("A");
    });
  });
  describe("scalars", () => {
    test("should sort scalars", () => {
      const document = parse(`
          scalar C
          scalar B
          scalar A
        `);
      const result = sortSDL(document);
      expect(
        (result.definitions[0] as ScalarTypeDefinitionNode).name.value,
      ).toBe("A");
    });
  });

  describe("interface type definitions", () => {
    test("should sort directives for interface types", () => {
      const document = parse(`
                interface A @c @b @a
                `);
      const result = sortSDL(document);
      const first = result.definitions[0] as ObjectTypeDefinitionNode;
      const firstDirective = first.directives ? first.directives[0] : null;
      expect(firstDirective?.name.value).toBe("a");
    });

    test("should sort fields for interface types", () => {
      const document = parse(`
        interface A {
            c: String
            b: String
            a: String
        }
      `);
      const result = sortSDL(document);
      const first = result.definitions[0] as ObjectTypeDefinitionNode;
      const firstField = first.fields ? first.fields[0] : null;
      expect(firstField?.name.value).toBe("a");
    });
  });

  describe("enum type definitions", () => {
    test("should sort directives for enum types", () => {
      const document = parse(`
                enum A @c @b @a
                `);
      const result = sortSDL(document);
      const first = result.definitions[0] as ObjectTypeDefinitionNode;
      const firstDirective = first.directives ? first.directives[0] : null;
      expect(firstDirective?.name.value).toBe("a");
    });

    test("should sort values for enum types", () => {
      const document = parse(`
        enum A {
            c
            b
            a
        }
      `);
      const result = sortSDL(document);
      const first = result.definitions[0] as EnumTypeDefinitionNode;
      const firstValue = first.values ? first.values[0] : null;
      expect(firstValue?.name.value).toBe("a");
    });
  });

  describe("enum value definitions", () => {
    test("should sort directives for enum values", () => {
      const document = parse(`
                enum A {
                    a @c @b @a
                }
                `);
      const result = sortSDL(document);
      const first = result.definitions[0] as EnumTypeDefinitionNode;
      const firstValue = first.values ? first.values[0] : null;
      const firstDirective = firstValue?.directives
        ? firstValue.directives[0]
        : null;
      expect(firstDirective?.name.value).toBe("a");
    });
  });

  describe("union type definitions", () => {
    test("should sort directives for union types", () => {
      const document = parse(`
                union A @c @b @a
                `);
      const result = sortSDL(document);
      const first = result.definitions[0] as ObjectTypeDefinitionNode;
      const firstDirective = first.directives ? first.directives[0] : null;
      expect(firstDirective?.name.value).toBe("a");
    });

    test("should sort types for union types", () => {
      const document = parse(`
        union A = C | B | A
      `);
      const result = sortSDL(document);
      const first = result.definitions[0] as UnionTypeDefinitionNode;
      const firstValue = first.types ? first.types[0] : null;
      expect(firstValue?.name.value).toBe("A");
    });
  });

  describe("fields", () => {
    test("should sort directives for fields", () => {
      const document = parse(`
                type A {
                    a: String @c @b @a
                }
                `);
      const result = sortSDL(document);
      const first = result.definitions[0] as ObjectTypeDefinitionNode;
      const firstField = first.fields ? first.fields[0] : null;
      const firstDirective = firstField?.directives
        ? firstField.directives[0]
        : null;
      expect(firstDirective?.name.value).toBe("a");
    });
  });

  describe("directive definitions", () => {
    test("should sort locations for directive definitions", () => {
      const document = parse(`
                directive @directive on OBJECT | FIELD_DEFINITION | INTERFACE
                `);
      const result = sortSDL(document);
      const first = result.definitions[0] as DirectiveDefinitionNode;
      const firstLocation = first.locations ? first.locations[0] : null;
      expect(firstLocation?.value).toBe("FIELD_DEFINITION");
    });
  });

  describe("directives", () => {
    test("should sort arguments for directives", () => {
      const document = parse(`
                type A {
                    a: String @directive(c: 1 b: 2 a: 3)
                }
                `);
      const result = sortSDL(document);
      const first = result.definitions[0] as ObjectTypeDefinitionNode;
      const firstField = first.fields ? first.fields[0] : null;
      const firstDirective = firstField?.directives
        ? firstField.directives[0]
        : null;
      const firstArgument = firstDirective?.arguments
        ? firstDirective.arguments[0]
        : null;
      expect(firstArgument?.name.value).toBe("a");
    });
  });
});
