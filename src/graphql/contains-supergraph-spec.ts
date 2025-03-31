import { Kind } from "graphql";
import {
  extraFederationDirectiveNames,
  extraFederationTypeNames,
  getSupergraphSpecNodes,
} from "./supergraph-spec.js";

let containsSupergraphSpecRegex: RegExp | null = null;

export function containsSupergraphSpec(sdl: string): boolean {
  if (containsSupergraphSpecRegex !== null) {
    return containsSupergraphSpecRegex.test(sdl);
  }

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

  extraFederationTypeNames.forEach((name) => {
    patterns.push(`\\[${name}`, `\\s${name}`);
  });

  extraFederationDirectiveNames.forEach((name) => {
    patterns.push(`@${name}`);
  });

  containsSupergraphSpecRegex = new RegExp(patterns.join("|"));

  return containsSupergraphSpecRegex.test(sdl);
}
