import { GraphQLError, Kind } from 'graphql';
import { print } from './graphql/printer.js';
import { sdl as authenticatedSDL } from './specifications/authenticated.js';
import { sdl as inaccessibleSDL } from './specifications/inaccessible.js';
import { sdl as joinSDL } from './specifications/join.js';
import { sdl as linkSDL, printLink } from './specifications/link.js';
import { sdl as policySDL } from './specifications/policy.js';
import { sdl as requiresScopesSDL } from './specifications/requires-scopes.js';
import { sdl as tagSDL } from './specifications/tag.js';
import { ServiceDefinition } from './types.js';
import { validate } from './validate.js';

export function composeServices(
  services: ServiceDefinition[],
  __internal?: {
    /**
     * For benchmarking purposes we allow to ignore validation errors.
     * Once we have all validation errors covered (no false positives and false negatives)
     * we can remove this thing from the code.
     */
    disableValidationRules?: string[];
  },
): CompositionResult {
  const validationResult = validate(services, __internal);

  if (!validationResult.success) {
    return {
      errors: validationResult.errors,
    };
  }

  const rootTypes = {
    query: false,
    mutation: false,
    subscription: false,
  };

  for (const def of validationResult.supergraph) {
    if (def.name.value === 'Query') {
      rootTypes.query = true;
    } else if (def.name.value === 'Mutation') {
      rootTypes.mutation = true;
    } else if (def.name.value === 'Subscription') {
      rootTypes.subscription = true;
    }

    if (
      rootTypes.query === true &&
      rootTypes.mutation === true &&
      rootTypes.subscription === true
    ) {
      break;
    }
  }

  const usedTagSpec = validationResult.specs.tag;
  const usedInaccessibleSpec = validationResult.specs.inaccessible;
  const usedPolicySpec = validationResult.specs.policy;
  const usedRequiresScopesSpec = validationResult.specs.requiresScopes;
  const usedAuthenticatedSpec = validationResult.specs.authenticated;

  return {
    supergraphSdl: `
schema
  @link(url: "https://specs.apollo.dev/link/v1.0")
  @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
  ${usedTagSpec ? '@link(url: "https://specs.apollo.dev/tag/v0.3")' : ''}
  ${
    usedInaccessibleSpec
      ? '@link(url: "https://specs.apollo.dev/inaccessible/v0.2", for: SECURITY)'
      : ''
  }
  ${usedPolicySpec ? '@link(url: "https://specs.apollo.dev/policy/v0.1", for: SECURITY)' : ''}
  ${
    usedRequiresScopesSpec
      ? '@link(url: "https://specs.apollo.dev/requiresScopes/v0.1", for: SECURITY)'
      : ''
  }
  ${
    usedAuthenticatedSpec
      ? '@link(url: "https://specs.apollo.dev/authenticated/v0.1", for: SECURITY)'
      : ''
  }
  ${validationResult.links.map(printLink).join('\n  ')}
{
  ${rootTypes.query ? 'query: Query' : ''}
  ${rootTypes.mutation ? 'mutation: Mutation' : ''}
  ${rootTypes.subscription ? 'subscription: Subscription' : ''}
}

${joinSDL}
${linkSDL}
${usedTagSpec ? tagSDL : ''}
${usedInaccessibleSpec ? inaccessibleSDL : ''}
${usedPolicySpec ? policySDL : ''}
${usedRequiresScopesSpec ? requiresScopesSDL : ''}
${usedAuthenticatedSpec ? authenticatedSDL : ''}

${print({
  kind: Kind.DOCUMENT,
  definitions: validationResult.supergraph,
})}
    `,
  };
}

export type CompositionResult = CompositionFailure | CompositionSuccess;

export interface CompositionFailure {
  errors: GraphQLError[];
}

export interface CompositionSuccess {
  supergraphSdl: string;
}

export function assertCompositionSuccess(
  compositionResult: CompositionResult,
  message?: string,
): asserts compositionResult is CompositionSuccess {
  if (compositionHasErrors(compositionResult)) {
    throw new Error(message || 'Unexpected test failure');
  }
}

export function assertCompositionFailure(
  compositionResult: CompositionResult,
  message?: string,
): asserts compositionResult is CompositionFailure {
  if (!compositionHasErrors(compositionResult)) {
    throw new Error(message || 'Unexpected test failure');
  }
}

export function compositionHasErrors(
  compositionResult: CompositionResult,
): compositionResult is CompositionFailure {
  return 'errors' in compositionResult && !!compositionResult.errors;
}
