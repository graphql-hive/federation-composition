import type { DocumentNode, TypeSystemDefinitionNode } from "graphql";
import { Kind, parse, print } from "graphql";
import { expect } from "vitest";
import { sortSDL } from "../../src/graphql/sort-sdl.js";

function isStringOrNode(
  value: unknown,
): value is string | DocumentNode | TypeSystemDefinitionNode {
  return (
    typeof value === "string" ||
    (!!value && typeof value === "object" && "kind" in value)
  );
}

function ensureDocumentNode(
  value: string | DocumentNode | TypeSystemDefinitionNode,
): DocumentNode {
  if (typeof value === "string") {
    return parse(value);
  }

  if (value.kind === Kind.DOCUMENT) {
    return value;
  }

  return {
    kind: Kind.DOCUMENT,
    definitions: [value],
  };
}

expect.extend({
  toEqualGraphQL: (received, expected) => {
    if (!isStringOrNode(received)) {
      return {
        message: () => `received value is not a string or AST node`,
        pass: false,
      };
    }

    if (!isStringOrNode(expected)) {
      return {
        message: () => `expected value is not a string or AST node`,
        pass: false,
      };
    }

    const printed = {
      received: print(sortSDL(ensureDocumentNode(received))),
      expected: print(sortSDL(ensureDocumentNode(expected))),
    };

    if (printed.received !== printed.expected) {
      return {
        message: () => "expected to be equal",
        pass: false,
        actual: printed.received,
        expected: printed.expected,
      };
    }

    return {
      message: () => `expected not to be equal ${printed.expected}`,
      pass: true,
      actual: printed.received,
      expected: printed.expected,
    };
  },
  toContainGraphQL: (received, expected) => {
    if (!isStringOrNode(received)) {
      return {
        message: () => `received value is not a string or AST node`,
        pass: false,
      };
    }

    if (!isStringOrNode(expected)) {
      return {
        message: () => `expected value is not a string or AST node`,
        pass: false,
      };
    }

    const printed = {
      received: print(sortSDL(ensureDocumentNode(received))),
      expected: print(sortSDL(ensureDocumentNode(expected))),
    };

    if (!printed.received.includes(printed.expected)) {
      return {
        message: () => `expected to find`,
        pass: false,
        actual: printed.received,
        expected: printed.expected,
      };
    }

    return {
      message: () => `expected to not find ${printed.expected}`,
      pass: true,
      actual: printed.received,
      expected: printed.expected,
    };
  },
});
