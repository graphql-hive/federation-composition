import { DocumentNode } from 'graphql';
import stripIndent from 'strip-indent';
import { describe } from 'vitest';
import { composeServices as apolloComposeServices } from '@apollo/composition';
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  compositionHasErrors,
  CompositionResult,
  composeServices as guildComposeServices,
} from '../../src/compose.js';
import { createStarsStuff } from './../fixtures/stars-stuff.js';
import { graphql } from './utils.js';

export function normalizeErrorMessage(literals: string | readonly string[]) {
  const message = typeof literals === 'string' ? literals : literals.join('');
  return stripIndent(message).trim();
}

const missingErrorCodes = [
  'DISALLOWED_INACCESSIBLE',
  'EXTERNAL_ARGUMENT_DEFAULT_MISMATCH',
  'EXTERNAL_ARGUMENT_TYPE_MISMATCH',
  'EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE',
  'IMPLEMENTED_BY_INACCESSIBLE',
  'INVALID_FEDERATION_SUPERGRAPH',
  'SHAREABLE_HAS_MISMATCHED_RUNTIME_TYPES',
  'UNSUPPORTED_LINKED_FEATURE',
];

function composeServicesFactory(
  implementation: (
    services: Array<{
      name: string;
      typeDefs: DocumentNode;
      url?: string;
    }>,
  ) => CompositionResult,
) {
  return function composeServices(
    services: Array<{
      name: string;
      typeDefs: DocumentNode;
      url?: string;
    }>,
    __internal?: {
      disableValidationRules?: string[];
    },
    debug = false,
  ) {
    // @ts-expect-error - Expected 1 arguments, but got 2 as __internal is only available in our impl
    const result = implementation(services, __internal as any);

    // This will help us detect new validation errors
    if (compositionHasErrors(result)) {
      if (debug) {
        console.log(
          result.errors.map(e => `[${e.extensions?.code ?? 'UNKNOWN'}] ${e.message}`).join('\n'),
        );
      }
      const codes = result.errors.map(e => e.extensions?.code).filter(Boolean);
      const uniqueCodes = new Set(codes);

      if (uniqueCodes.size > 0) {
        // find codes that are in todo list
        const todoCodes = Array.from(uniqueCodes).filter(c => missingErrorCodes.includes(c as any));

        if (todoCodes.length) {
          console.warn(['Detected', todoCodes.join(', '), 'in a test'].join(' '));
        }
      }
    }

    return result;
  };
}

const both = [
  {
    library: 'apollo' as const,
    composeServices: composeServicesFactory(apolloComposeServices),
  },
  {
    library: 'guild' as const,
    composeServices: composeServicesFactory(guildComposeServices),
  },
];
export const versions = [
  'v2.0',
  'v2.1',
  'v2.2',
  'v2.3',
  'v2.4',
  'v2.5',
  'v2.6',
  'v2.7',
  'v2.8',
  'v2.9',
] as const;

export const federationVersionToJoinSpecVersion: Record<FederationVersion, string> = {
  'v2.0': 'v0.3',
  'v2.1': 'v0.3',
  'v2.2': 'v0.3',
  'v2.3': 'v0.3',
  'v2.4': 'v0.3',
  'v2.5': 'v0.3',
  'v2.6': 'v0.3',
  'v2.7': 'v0.4',
  'v2.8': 'v0.5',
  'v2.9': 'v0.5',
};

type TestAPI = (typeof both)[number];

export function testVersions(runTests: (api: TestAPI, version: (typeof versions)[number]) => void) {
  describe.each(both)('$library', api => {
    describe.each(versions)('%s', version => {
      runTests(api, version);
    });
  });
}

export type FederationVersion = (typeof versions)[number];

export function satisfiesVersionRange(
  range: `${'<' | '>=' | '>'} ${FederationVersion}`,
  version: FederationVersion,
) {
  const [sign, ver] = range.split(' ') as ['<' | '>=' | '>', FederationVersion];
  const versionInRange = parseFloat(ver.replace('v', ''));
  const detectedVersion = parseFloat(version.replace('v', ''));

  if (sign === '<') {
    return detectedVersion < versionInRange;
  }

  if (sign === '>') {
    return detectedVersion > versionInRange;
  }

  return detectedVersion >= versionInRange;
}

export function testImplementations(runTests: (api: TestAPI) => void) {
  describe.each(both)('$library', api => {
    runTests(api);
  });
}

export function ensureCompositionSuccess<T extends CompositionResult>(result: T) {
  assertCompositionSuccess(result);

  return result;
}

export { assertCompositionFailure, assertCompositionSuccess, graphql };

export { createStarsStuff };
