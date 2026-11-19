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
  options?: {
    /**
     * Skip the satisfiability check, the most expensive part of composition.
     *
     * Only set it when the same services already composed successfully without a contract.
     * A contract only adds `@inaccessible`, and satisfiability ignores inaccessible fields
     * in the paths it requires while still using them to resolve those paths,
     * so a contract of a satisfiable graph is satisfiable too.
     */
    skipSatisfiability?: boolean;
  },
) {
  const filteredSubgraphs = applyTagFilterOnSubgraphs(services, tagFilter);
  const compositionResult = composeServices(
    filteredSubgraphs,
    options?.skipSatisfiability
      ? { disableValidationRules: ["SatisfiabilityRule"] }
      : undefined,
  );

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
