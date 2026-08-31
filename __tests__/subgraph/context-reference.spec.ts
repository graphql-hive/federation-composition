import { describe, expect, test } from "vitest";
import { parseContextReference } from "../../src/subgraph/context.js";

describe("parseContextReference", () => {
  test.each([
    ["$reviewCtx { sentiment }", "reviewCtx", " { sentiment }"],
    ["$reviewCtx", "reviewCtx", ""],
    // GraphQL ignored tokens may surround the `$`
    ["\n  , $ , reviewCtx { id }", "reviewCtx", " { id }"],
    ["# pick the review\n$reviewCtx { id }", "reviewCtx", " { id }"],
    ["\ufeff$reviewCtx { id }", "reviewCtx", " { id }"],
    ["$_private { id }", "_private", " { id }"],
    ["$ctx2 { id }", "ctx2", " { id }"],
  ])("parses %j", (input, context, selection) => {
    expect(parseContextReference(input)).toEqual({ context, selection });
  });

  test.each([
    "{ sentiment }",
    "reviewCtx { id }",
    "$ { id }",
    "$2ctx { id }",
    "",
  ])("rejects %j", (input) => {
    expect(parseContextReference(input)).toEqual({
      context: undefined,
      selection: undefined,
    });
  });
});
