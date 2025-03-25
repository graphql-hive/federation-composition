import { constantCase } from 'constant-case';
import { DocumentNode, GraphQLError } from 'graphql';
import { moveSchemaAndDirectiveDefinitionsToTop } from './graphql/helpers.js';
import {
  detectFederationVersion,
  FederationVersion,
  isFederationVersion,
} from './specifications/federation.js';
import {
  cleanSubgraphStateFromFederationSpec,
  cleanSubgraphStateFromLinkSpec,
  createSubgraphStateBuilder,
  SubgraphStateBuilder,
} from './subgraph/state.js';
import {
  validateSubgraph as internal_validateSubgraph,
  validateSubgraphCore,
} from './subgraph/validation/validate-subgraph.js';
import { createSupergraphStateBuilder } from './supergraph/state.js';
import { validateSupergraph } from './supergraph/validation/validate-supergraph.js';

const numberAtStartRegex = /^\d/;
function startsWithNumber(value: string) {
  return numberAtStartRegex.test(value);
}

function buildGraphList(
  subgraphs: ReadonlyArray<{ name: string; typeDefs: DocumentNode; url?: string }>,
) {
  const errors: GraphQLError[] = [];

  const graphs: Array<{
    id: string;
    name: string;
    typeDefs: DocumentNode;
    url?: string;
  }> = [];

  // Set of visited names
  const names = new Set<string>();
  // A map of created IDs and their count
  const idCounter = new Map<string, number>();

  for (const subgraph of subgraphs) {
    const name = String(subgraph.name);
    const nameStartsWithNumber = startsWithNumber(name);

    if (names.has(name)) {
      throw new Error(`A subgraph named ${name} already exists`);
    }

    const { url, typeDefs } = subgraph;

    names.add(name);

    // We do kind of a workaround here to make sure constantCase does not ignore special characters
    // We replace all non-alphanumeric characters with `_` and then we strip everything that is not `_` or alphanumeric
    let proposedId = constantCase(name.replace(/[^A-Z0-9]/gi, '_'), {
      stripRegexp: /[^A-Z0-9_]+/gi,
    });

    if (nameStartsWithNumber) {
      proposedId = '_' + proposedId + '_';
    }

    // Check if ID was already created
    let count = idCounter.get(proposedId);
    if (typeof count === 'number') {
      // It was created only once so far
      if (count === 1) {
        // Let's add a `_1` suffix
        graphs.find(g => g.id === proposedId)!.id += '_1';
      }

      // Push a new graph with `_N` suffix
      graphs.push({
        name,
        id: proposedId + '_' + (count + 1),
        url,
        typeDefs: moveSchemaAndDirectiveDefinitionsToTop(typeDefs),
      });

      // Increase the counter
      idCounter.set(proposedId, count + 1);
    } else {
      // It's the first time the ID was used
      idCounter.set(proposedId, 1);
      graphs.push({
        name,
        id: proposedId,
        url,
        typeDefs: moveSchemaAndDirectiveDefinitionsToTop(typeDefs),
      });
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    } as const;
  }

  // @apollo/composition sorts services by name A->Z
  // We will sort them by ID to make sure the order is deterministic.
  // The sorting part is critical to some of the composition logic (e.g. descriptions on type definitions - first one wins)

  graphs.sort((a, b) => a.id.localeCompare(b.id));

  return {
    success: true,
    graphs,
  } as const;
}

export function validateSubgraph(subgraph: { name: string; url?: string; typeDefs: DocumentNode }) {
  const subgraphs = [subgraph];
  const graphList = buildGraphList(subgraphs);

  if (!graphList.success) {
    return graphList.errors;
  }

  const corePerSubgraph = graphList.graphs.map(subgraph => validateSubgraphCore(subgraph));
  // Validate the basics of basics before checking subgraphs.
  const coreErrors = corePerSubgraph.map(core => core.errors ?? []).flat(1);

  // If core-level errors are detected, we skip validation of subgraphs.
  // We do it because if a core is invalid the subgraph is going to be invalid anyway.
  // By core, we mean the validation of `@link` and other fundamental logic of Federation v2
  if (coreErrors.length > 0) {
    return coreErrors;
  }

  const detectedFederationSpec = new Map(
    graphList.graphs.map(graph => [graph.id, detectFederationVersion(graph.typeDefs)] as const),
  );

  const subgraphStateBuilders = new Map<string, SubgraphStateBuilder>(
    graphList.graphs.map((graph, i) => [
      graph.id,
      createSubgraphStateBuilder(
        graph,
        graph.typeDefs,
        detectedFederationSpec.get(graph.id)!.version,
        corePerSubgraph[i].links ?? [],
      ),
    ]),
  );
  // Validate each subgraph
  const subgraphErrors = graphList.graphs
    .map(graph =>
      internal_validateSubgraph(
        graph,
        subgraphStateBuilders.get(graph.id)!,
        detectedFederationSpec.get(graph.id)!,
      ),
    )
    .flat(1);

  return subgraphErrors;
}

export function validate(
  subgraphs: ReadonlyArray<{ name: string; url?: string; typeDefs: DocumentNode }>,
  __internal?: {
    disableValidationRules?: string[];
  },
) {
  const graphList = buildGraphList(subgraphs);

  if (!graphList.success) {
    return {
      success: false,
      errors: graphList.errors,
    } as const;
  }

  const corePerSubgraph = graphList.graphs.map(subgraph => validateSubgraphCore(subgraph));
  // Validate the basics of basics before checking subgraphs.
  const coreErrors = corePerSubgraph.map(core => core.errors ?? []).flat(1);

  // If core-level errors are detected, we skip validation of subgraphs.
  // We do it because if a core is invalid the subgraph is going to be invalid anyway.
  // By core, we mean the validation of `@link` and other fundamental logic of Federation v2
  if (coreErrors.length > 0) {
    return {
      success: false,
      errors: coreErrors,
    } as const;
  }

  const detectedFederationSpec = new Map(
    graphList.graphs.map(graph => [graph.id, detectFederationVersion(graph.typeDefs)] as const),
  );

  const subgraphStateBuilders = new Map<string, SubgraphStateBuilder>(
    graphList.graphs.map((graph, i) => [
      graph.id,
      createSubgraphStateBuilder(
        graph,
        graph.typeDefs,
        detectedFederationSpec.get(graph.id)!.version,
        corePerSubgraph[i].links ?? [],
      ),
    ]),
  );
  // Validate each subgraph
  const subgraphErrors = graphList.graphs
    .map(graph =>
      internal_validateSubgraph(
        graph,
        subgraphStateBuilders.get(graph.id)!,
        detectedFederationSpec.get(graph.id)!,
        __internal,
      ),
    )
    .flat(1);

  // If subgraph-level errors are detected, we skip validation of a supergraph.
  // We do it because if a subgraph is invalid the supergraph is going to be invalid anyway.
  if (subgraphErrors.length > 0) {
    return {
      success: false,
      errors: subgraphErrors,
    } as const;
  }

  // We build the state of the supergraph as we validate the supergraph.
  // We do it for better performance (less iterations and shit like that).
  const state = createSupergraphStateBuilder();
  const supergraphErrors = validateSupergraph(
    new Map(
      Array.from(subgraphStateBuilders.entries()).map(([id, builder]) => [
        id,
        cleanSubgraphStateFromFederationSpec(cleanSubgraphStateFromLinkSpec(builder.state)),
      ]),
    ),
    state,
    __internal,
  );

  // If supergraph-level errors are detected, we skip the generation of a supergraph.
  // It's corrupted anyway...
  if (supergraphErrors.length > 0) {
    return {
      success: false,
      errors: supergraphErrors,
    } as const;
  }

  const nodes = state.build();

  let maxFederationVersion: FederationVersion = 'v1.0';

  for (let [_, { version }] of detectedFederationSpec) {
    if (isVersionHigher(version, maxFederationVersion)) {
      maxFederationVersion = version;
    }
  }

  return {
    success: true,
    supergraph: nodes,
    links: state.links(),
    specs: state.getSupergraphState().specs,
    federationVersion: maxFederationVersion,
  } as const;
}

function isVersionHigher<
  $Ver1 extends `v${number}.${number}`,
  $Ver2 extends `v${number}.${number}`,
>(sourceVersion: $Ver1, targetVersion: $Ver2): boolean {
  const sourceVersionParts = Number(sourceVersion.replace('v', ''));
  const targetVersionParts = Number(targetVersion.replace('v', ''));

  return sourceVersionParts > targetVersionParts;
}
