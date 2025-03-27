import {
  isTypeDefinitionNode,
  Kind,
  parse,
  type ASTNode,
  type DirectiveDefinitionNode,
  type TypeDefinitionNode,
} from 'graphql';
import { sdl as authenticatedSdl } from '../specifications/authenticated.js';
import { sdl as costSdl } from '../specifications/cost.js';
import { getLatestFederationVersion } from '../specifications/federation.js';
import { sdl as inaccessibleSdl } from '../specifications/inaccessible.js';
import { sdl as joinSdl } from '../specifications/join.js';
import { sdl as linkSdl } from '../specifications/link.js';
import { sdl as policySdl } from '../specifications/policy.js';
import { sdl as requiresSdl } from '../specifications/requires-scopes.js';
import { sdl as tagSdl } from '../specifications/tag.js';

// For the sake of optimization, we cache the supergraph spec nodes and only compute them when needed.
let supergraphSpecNodes: readonly { name: string; kind: Kind }[] | null = null;

/**
 * Names of inputs, enums and scalars that are part of the supergraph spec,
 * but are not part of this composition library.
 */
export const extraFederationTypeNames = new Set([
  '_FieldSet',
  'join__DirectiveArguments', // from Federation v2 - connectors
]);
/**
 * Names of directives that are part of the supergraph spec,
 * but are not part of this composition library. Mostly from Federation v1 era.
 */
export const extraFederationDirectiveNames = new Set([
  'core', // from Federation v1 supergraph
  'join__owner', // from Federation v1 supergraph
  'join__directive', // from Federation v2 - connectors
  'context', // from Federation v2.8 - we don't support it yet
]);

export function getSupergraphSpecNodes(): readonly { name: string; kind: Kind }[] {
  if (supergraphSpecNodes !== null) {
    return supergraphSpecNodes;
  }

  const latestVersion = getLatestFederationVersion();

  supergraphSpecNodes = [
    authenticatedSdl,
    costSdl({
      cost: 'cost',
      listSize: 'listSize',
    }),
    inaccessibleSdl,
    joinSdl(latestVersion),
    linkSdl,
    policySdl,
    requiresSdl,
    tagSdl,
  ]
    .map(sdl =>
      parse(sdl, { noLocation: true })
        .definitions.filter(isDefinitionNode)
        .map(d => ({
          name: d.name.value,
          kind: d.kind,
        })),
    )
    .flat();

  return supergraphSpecNodes;
}

function isDirectiveDefinitionNode(node: ASTNode): node is DirectiveDefinitionNode {
  return node.kind === Kind.DIRECTIVE_DEFINITION;
}

function isDefinitionNode(node: ASTNode): node is DirectiveDefinitionNode | TypeDefinitionNode {
  return isDirectiveDefinitionNode(node) || isTypeDefinitionNode(node);
}
