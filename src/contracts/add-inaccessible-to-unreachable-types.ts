import { DocumentNode } from "graphql";
import {
  CompositionSuccess,
  createCompositionSuccessReadCacheContainer,
} from "../compose.js";
import {
  addDirectiveOnTypes,
  getReachableTypes,
} from "./reachable-type-filter.js";

type AddInaccessibleToUnreachableTypesInput = Pick<
  CompositionSuccess,
  "supergraphDocumentNode" | "publicDocumentNode"
>;

/**
 * Adds inaccessible directive to unreachable types within the supergraph and removes them from the
 * public GraphQL schema.
 */
export const addInaccessibleToUnreachableTypes = (
  /** Implementation for resolvinf the federation type names. */
  resolveName: (identity: string, name: string) => string,
  /** The successful composition result to process. */
  compositionResult: AddInaccessibleToUnreachableTypesInput,
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
    resolveName("https://specs.apollo.dev/join", "ContextArgument"),
    resolveName("https://specs.apollo.dev/join", "FieldValue"),
  ]);

  // we retrieve the list of reachable types from the public api sdl
  const reachableTypeNames = getReachableTypes(
    compositionResult.publicDocumentNode,
  );

  // apollo router does not like @inaccessible on federation types...
  for (const federationType of federationTypes) {
    reachableTypeNames.add(federationType);
  }

  // then we apply the filter to the supergraph SDL (which is the source for the public api sdl)
  const supergraphNode = addDirectiveOnTypes({
    documentNode: compositionResult.supergraphDocumentNode,
    excludedTypeNames: reachableTypeNames,
    directiveName: inaccessibleDirectiveName,
  });

  return createCompositionSuccessReadCacheContainer(supergraphNode);
};
