import { parse, print } from "graphql";
import { CompositionSuccess } from "../compose.js";
import {
  addDirectiveOnTypes,
  getReachableTypes,
} from "./reachable-type-filter.js";
import { transformSupergraphToPublicSchema } from "../graphql/transform-supergraph-to-public-schema.js";

/**
 * Adds inaccessible directive to unreachable types within the supergraph and removes them from the
 * public GraphQL schema.
 */
export const addInaccessibleToUnreachableTypes = (
  /** Implementation for resolvinf the federation type names. */
  resolveName: (identity: string, name: string) => string,
  /** The successful composition result to process. */
  compositionResult: CompositionSuccess,
): CompositionSuccess => {
  const inaccessibleDirectiveName = resolveName(
    "https://specs.apollo.dev/inaccessible",
    "@inaccessible",
  );
  const federationTypes = new Set([
    resolveName("https://specs.apollo.dev/join", "FieldSet"),
    resolveName("https://specs.apollo.dev/join", "Graph"),
    resolveName("https://specs.apollo.dev/link", "Import"),
    resolveName("https://specs.apollo.dev/link", "Purpose"),
    resolveName("https://specs.apollo.dev/federation", "Policy"),
    resolveName("https://specs.apollo.dev/federation", "Scope"),
    resolveName("https://specs.apollo.dev/join", "DirectiveArguments"),
  ]);

  // we retrieve the list of reachable types from the public api sdl
  const reachableTypeNames = getReachableTypes(
    parse(compositionResult.publicSdl),
  );

  // apollo router does not like @inaccessible on federation types...
  for (const federationType of federationTypes) {
    reachableTypeNames.add(federationType);
  }

  // then we apply the filter to the supergraph SDL (which is the source for the public api sdl)
  const supergraphSDL = addDirectiveOnTypes({
    documentNode: parse(compositionResult.supergraphSdl),
    excludedTypeNames: reachableTypeNames,
    directiveName: inaccessibleDirectiveName,
  });
  return {
    supergraphSdl: print(supergraphSDL),
    publicSdl: print(transformSupergraphToPublicSchema(supergraphSDL)),
  };
};
