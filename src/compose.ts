import { GraphQLError, Kind } from 'graphql';
import { print } from './graphql/printer.js';
import { transformSupergraphToPublicSchema } from './graphql/transform-supergraph-to-public-schema.js';
import { sdl as authenticatedSDL } from './specifications/authenticated.js';
import { sdl as costSDL } from './specifications/cost.js';
import { FederationVersion } from './specifications/federation.js';
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
  const usedCostSpec = validationResult.specs.cost;
  const usedInaccessibleSpec = validationResult.specs.inaccessible;
  const usedPolicySpec = validationResult.specs.policy;
  const usedRequiresScopesSpec = validationResult.specs.requiresScopes;
  const usedAuthenticatedSpec = validationResult.specs.authenticated;

  let _publicSdl: string;

  let costLinkImports = '';

  if (usedCostSpec.used) {
    const imports: string[] = [];
    if (usedCostSpec.names.cost && usedCostSpec.names.cost !== 'cost') {
      imports.push(createLinkImportValue('@cost', `@${usedCostSpec.names.cost}`));
    }

    if (usedCostSpec.names.listSize) {
      imports.push(
        createLinkImportValue(
          '@listSize',
          usedCostSpec.names.listSize !== 'listSize' ? `@${usedCostSpec.names.listSize}` : null,
        ),
      );
    }

    if (imports.length) {
      costLinkImports = `, import: [${imports.join(', ')}]`;
    }
  }

  const federationVersionToJoinVersion: Record<FederationVersion, string> = {
    'v1.0': 'v0.3',
    'v2.0': 'v0.3',
    'v2.1': 'v0.3',
    'v2.2': 'v0.3',
    'v2.3': 'v0.3',
    'v2.4': 'v0.3',
    'v2.5': 'v0.3',
    'v2.6': 'v0.3',
    // 'v2.7': 'v0.4',
    // 'v2.8': 'v0.5',
    'v2.9': 'v0.5',
  };

  return {
    supergraphSdl: `
schema
  @link(url: "https://specs.apollo.dev/link/v1.0")
  @link(url: "https://specs.apollo.dev/join/${federationVersionToJoinVersion[validationResult.federationVersion]}", for: EXECUTION)
  ${usedTagSpec ? '@link(url: "https://specs.apollo.dev/tag/v0.3")' : ''}
  ${usedCostSpec.used ? `@link(url: "https://specs.apollo.dev/cost/v0.1"${costLinkImports})` : ''}
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

${joinSDL(validationResult.federationVersion)}
${linkSDL}
${usedTagSpec ? tagSDL : ''}
${
  usedCostSpec
    ? costSDL({
        cost: usedCostSpec.names.cost ?? 'cost',
        listSize: usedCostSpec.names.listSize ?? 'listSize',
      })
    : ''
}
${usedInaccessibleSpec ? inaccessibleSDL : ''}
${usedPolicySpec ? policySDL : ''}
${usedRequiresScopesSpec ? requiresScopesSDL : ''}
${usedAuthenticatedSpec ? authenticatedSDL : ''}

${print({
  kind: Kind.DOCUMENT,
  definitions: validationResult.supergraph,
})}
    `,
    /**
     *
     */
    get publicSdl() {
      if (_publicSdl) {
        return _publicSdl;
      }

      _publicSdl = print(
        transformSupergraphToPublicSchema({
          kind: Kind.DOCUMENT,
          definitions: validationResult.supergraph,
        }),
      );

      return _publicSdl;
    },
  };
}

function createLinkImportValue(name: string, alias: string | null) {
  if (alias) {
    return `{ name: "${name}", as: "${alias}" }`;
  }

  return `"${name}"`;
}

export type CompositionResult = CompositionFailure | CompositionSuccess;

export interface CompositionFailure {
  supergraphSdl?: undefined;
  errors: GraphQLError[];
}

export interface CompositionSuccess {
  supergraphSdl: string;
  publicSdl: string;
  errors?: undefined;
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
