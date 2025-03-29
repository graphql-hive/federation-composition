import { OperationTypeNode } from 'graphql';
import { Logger, LoggerContext } from '../../../../utils/logger.js';
import type { SupergraphState } from '../../../state.js';
import { MERGEDGRAPH_ID, SUPERGRAPH_ID } from './constants.js';
import { Graph } from './graph.js';
import { MoveValidator } from './move-validator.js';
import type { Step } from './operation-path.js';
import { SelectionResolver } from './selection.js';
import { Walker } from './walker.js';

export class Supergraph {
  private supergraph: Graph;
  private mergedGraph: Graph;
  private selectionResolver: SelectionResolver;
  private moveRequirementChecker: MoveValidator;
  private logger = new Logger('Supergraph', new LoggerContext());

  constructor(supergraphState: SupergraphState) {
    this.selectionResolver = new SelectionResolver(supergraphState);
    this.supergraph = new Graph(
      this.logger,
      SUPERGRAPH_ID,
      'supergraph',
      supergraphState,
      this.selectionResolver,
      true,
    );
    this.mergedGraph = new Graph(
      this.logger,
      MERGEDGRAPH_ID,
      'merged',
      supergraphState,
      this.selectionResolver,
    );
    for (const [id, subgraphState] of supergraphState.subgraphs) {
      this.mergedGraph.addSubgraph(
        new Graph(
          this.logger,
          id,
          subgraphState.graph.name,
          supergraphState,
          this.selectionResolver,
          false,
        )
          .addFromRoots()
          .addFromEntities()
          .addUnreachableTypes(),
      );
    }

    this.mergedGraph.joinSubgraphs();
    this.mergedGraph.addOverriddenFields();

    this.supergraph.addFromRoots().addOverriddenFields().addInterfaceObjectFields();

    this.moveRequirementChecker = new MoveValidator(this.logger, this.mergedGraph);
  }

  validate() {
    return new Walker(
      this.logger,
      this.moveRequirementChecker,
      this.supergraph,
      this.mergedGraph,
    ).walk('dfs');
  }

  validateOperation(operation: OperationTypeNode, steps: Step[]) {
    return new Walker(
      this.logger,
      this.moveRequirementChecker,
      this.supergraph,
      this.mergedGraph,
    ).walkTrail(operation, steps);
  }
}
