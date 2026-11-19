import {
  applyTagFilterOnSubgraphs,
  type SchemaContractFilter,
} from "./tag-extraction.js";
import { type ServiceDefinition } from "../types.js";
import {
  type CompositionResult,
  composeServices,
  createCompositionSuccessReadCacheContainer,
  createSupergraphDocumentNode,
} from "../compose.js";
import { validateAndKeepState } from "../validate.js";
import { validateInaccessibleUsage } from "../supergraph/validation/validate-supergraph.js";
import { createSupergraphStateContractFilter } from "./supergraph-state-contract.js";
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

export type SchemaContract = {
  /** The filter of tag names to include and/or exclude. */
  filter: SchemaContractFilter;
  /** Whether types that are not referenced by the schema contracts public schema should be annotated with `@inaccessible`. Defaults to `true`. */
  removeUnreachableTypes?: boolean;
};

/**
 * Compose a federation schema and its schema contracts.
 *
 * The result is the same as `composeServices` followed by `composeSchemaContract` for each contract,
 * but a contract is derived from the composed supergraph instead of composing all the subgraphs again.
 * A contract only adds `@inaccessible`, so the only checks it needs are the ones about `@inaccessible`.
 */
export function composeServicesWithContracts(
  /** The services that are composed */
  services: ServiceDefinition[],
  /** The schema contracts to compose, the results are in the same order */
  contracts: SchemaContract[],
): {
  supergraph: CompositionResult;
  contracts: CompositionResult[];
} {
  const result = validateAndKeepState(services);

  if (!result.success) {
    // There is no composed supergraph to derive the contracts from, so compose each of them in full.
    return {
      supergraph: { errors: result.errors },
      contracts: contracts.map((contract) =>
        composeSchemaContract(
          services,
          contract.filter,
          contract.removeUnreachableTypes ?? true,
        ),
      ),
    };
  }

  const supergraph = createCompositionSuccessReadCacheContainer(
    createSupergraphDocumentNode(result),
  );
  const supergraphState = result.supergraphStateBuilder.getSupergraphState();
  const applyTagFilter = createSupergraphStateContractFilter(
    services,
    supergraphState,
  );

  return {
    supergraph,
    contracts: contracts.map((contract): CompositionResult => {
      const filtered = applyTagFilter(contract.filter);

      try {
        // A subgraph that fails validation stops the composition before the supergraph is validated.
        if (filtered.errors.length > 0) {
          return { errors: filtered.errors };
        }

        const errors = validateInaccessibleUsage(
          result.subgraphStates,
          supergraphState,
        );

        if (errors.length > 0) {
          return { errors };
        }

        const compositionResult = createCompositionSuccessReadCacheContainer(
          createSupergraphDocumentNode({
            ...result,
            supergraph: result.supergraphStateBuilder.build(),
            specs: supergraphState.specs,
          }),
        );

        if (contract.removeUnreachableTypes === false) {
          return compositionResult;
        }

        const { resolveImportName } = extractLinkImplementations(
          compositionResult.supergraphDocumentNode,
        );

        return addInaccessibleToUnreachableTypes(
          resolveImportName,
          compositionResult,
        );
      } finally {
        filtered.restore();
      }
    }),
  };
}
