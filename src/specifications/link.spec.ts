import { describe, expect, test } from "vitest";
import { parseLinkImport, parseLinkUrl } from "./link.js";

describe("parseLinkUrl", () => {
  test.each`
    url                                                  | name          | version            | identity
    ${"https://spec.example.com/a/b/mySchema/v1.0/"}     | ${"mySchema"} | ${"v1.0"}          | ${"https://spec.example.com/a/b/mySchema"}
    ${"https://spec.example.com/a/b/mySchema/v1.0"}      | ${"mySchema"} | ${"v1.0"}          | ${"https://spec.example.com/a/b/mySchema"}
    ${"https://spec.example.com"}                        | ${null}       | ${null}            | ${"https://spec.example.com"}
    ${"https://spec.example.com/mySchema/v0.1?q=v#frag"} | ${"mySchema"} | ${"v0.1"}          | ${"https://spec.example.com/mySchema"}
    ${"https://spec.example.com/mySchema/not-a-version"} | ${"mySchema"} | ${"not-a-version"} | ${"https://spec.example.com/mySchema"}
    ${"https://spec.example.com/v1.0"}                   | ${null}       | ${"v1.0"}          | ${"https://spec.example.com"}
    ${"https://spec.example.com/vX"}                     | ${"vX"}       | ${null}            | ${"https://spec.example.com/vX"}
  `("$url", ({ url, name, version, identity }) => {
    expect(parseLinkUrl(url)).toEqual({ name, version, identity });
  });
});

describe("parseLinkImport", () => {
  test('["Type"]', () => {
    expect(parseLinkImport('["Type"]')).toEqual([
      { kind: "type", name: "Type" },
    ]);
  });

  test('["Foo", "Bar"]', () => {
    expect(parseLinkImport('["Foo", "Bar"]')).toEqual([
      { kind: "type", name: "Foo" },
      { kind: "type", name: "Bar" },
    ]);
  });

  test('["@foo", "@bar"]', () => {
    expect(parseLinkImport('["@foo", "@bar"]')).toEqual([
      { kind: "directive", name: "@foo" },
      { kind: "directive", name: "@bar" },
    ]);
  });

  test('[{ name: "@foo", as: "@bar" }]', () => {
    expect(parseLinkImport('[{ name: "@foo", as: "@bar" }]')).toEqual([
      { kind: "directive", name: "@foo", alias: "@bar" },
    ]);
  });

  test('[{ name: "@foo"]', () => {
    expect(parseLinkImport('[{ name: "@foo" }]')).toEqual([
      { kind: "directive", name: "@foo" },
    ]);
  });

  test("[]", () => {
    expect(parseLinkImport("[]")).toEqual([]);
  });
});
