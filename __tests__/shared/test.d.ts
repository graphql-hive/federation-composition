import type { DocumentNode, TypeSystemDefinitionNode } from "graphql";

interface CustomMatchers<R = unknown> {
  toContainGraphQL(
    expected: string | DocumentNode | TypeSystemDefinitionNode,
  ): R;
  toEqualGraphQL(expected: string | DocumentNode | TypeSystemDefinitionNode): R;
}

declare module "vitest" {
  interface Matchers<T = any> extends CustomMatchers<T> {}
}
