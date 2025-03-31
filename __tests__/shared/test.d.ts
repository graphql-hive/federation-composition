import type { DocumentNode, TypeSystemDefinitionNode } from "graphql";

interface CustomMatchers<R = unknown> {
  toContainGraphQL(
    expected: string | DocumentNode | TypeSystemDefinitionNode,
  ): R;
  toEqualGraphQL(expected: string | DocumentNode | TypeSystemDefinitionNode): R;
}

declare global {
  namespace Vi {
    interface Assertion extends CustomMatchers {}
    interface AsymmetricMatchersContaining extends CustomMatchers {}
  }
}
