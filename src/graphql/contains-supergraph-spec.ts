import { Kind } from 'graphql';
import {
  extraFederationDirectiveNames,
  extraFederationTypeNames,
  getSupergraphSpecNodes,
} from './supergraph-spec.js';

export function containsSupergraphSpec(sdl: string): boolean {
  const patterns: string[] = [];

  for (const { name, kind } of getSupergraphSpecNodes()) {
    if (kind === Kind.DIRECTIVE) {
      // "@NAME" for directives
      patterns.push(`@${name}`);
    } else {
      // "[NAME" or " NAME" for scalars, enums and inputs
      patterns.push(`\\[${name}`, `\\s${name}`);
    }
  }

  extraFederationTypeNames.forEach(name => {
    patterns.push(`\\[${name}`, `\\s${name}`);
  });

  extraFederationDirectiveNames.forEach(name => {
    patterns.push(`@${name}`);
  });

  return new RegExp(patterns.join('|')).test(sdl);
}
