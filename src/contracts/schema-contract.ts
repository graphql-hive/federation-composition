import {
  applyTagFilterOnSubgraphs,
  type SchemaContractFilter,
} from "./tag-extraction.js";
import { type ServiceDefinition } from "../types.js";
import { composeServices } from "../compose.js";
import { extractLinkImplementations } from "../utils/link/index.js";
import { addInaccessibleToUnreachableTypes } from "./add-inaccessible-to-unreachable-types.js";

/** Compose a federation schema contract using a filter. */
export function composeSchemaContract(
  /** The services that are composed */
  services: ServiceDefinition[],
  /** The filter of tag names to include and/or exclude. */
  tagFilter: SchemaContractFilter,
  /** Whether types that are not referenced by the schema contracts public schema should be annotated with `@inaccessible`. */
  removeUnreachableTypes = true,
) {
  const filteredSubgraphs = applyTagFilterOnSubgraphs(services, tagFilter);
  const compositionResult = composeServices(filteredSubgraphs);

  if (
    !compositionResult.errors &&
    compositionResult.supergraphDocumentNode &&
    removeUnreachableTypes
  ) {
    const { resolveImportName } = extractLinkImplementations(
      compositionResult.supergraphDocumentNode,
    );
    return addInaccessibleToUnreachableTypes(
      resolveImportName,
      compositionResult,
    );
  }

  return compositionResult;
}
