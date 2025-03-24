import { OperationTypeNode } from 'graphql';
import type { Logger } from '../../../../utils/logger.js';
import { isAbstractEdge, isFieldEdge, type Edge } from './edge.js';
import { SatisfiabilityError } from './errors.js';
import { PathFinder } from './finder.js';
import type { Graph } from './graph.js';
import { type Lazy } from './helpers.js';
import type { MoveValidator } from './move-validator.js';
import type { Node } from './node.js';
import { OperationPath, type Step } from './operation-path.js';

export class WalkTracker {
  private errors: Lazy<SatisfiabilityError>[] = [];

  constructor(
    public superPath: OperationPath,
    public paths: OperationPath[],
  ) {}

  move(edge: Edge) {
    if (isFieldEdge(edge) || isAbstractEdge(edge)) {
      return new WalkTracker(this.superPath.clone().move(edge), []);
    }

    throw new Error('Expected edge to be FieldMove or AbstractMove');
  }

  addPath(path: OperationPath) {
    this.paths.push(path);
    this.errors = [];
  }

  addError(error: Lazy<SatisfiabilityError>) {
    this.errors.push(error);
  }

  isPossible() {
    return this.paths.length > 0;
  }

  givesEmptyResult() {
    const lastEdge = this.superPath.edge();
    return (
      this.paths.length === 0 && this.errors.length === 0 && !!lastEdge && isAbstractEdge(lastEdge)
    );
  }

  isEdgeVisited(edge: Edge) {
    return this.superPath.isVisitedEdge(edge);
  }

  listErrors() {
    return this.errors
      .map(error => error.get())
      .filter((error, i, all) => all.findIndex(e => e.toString() === error.toString()) === i)
      .filter(error => {
        if (error.kind !== 'KEY') {
          return true;
        }

        // remove key resolution errors that does not lead to the field we are looking for
        const steps = this.superPath.steps();
        const lastStep = steps[steps.length - 1];

        if (!lastStep || lastStep.typeName !== error.typeName) {
          return true;
        }

        return true;
      });
  }
}

type IsEdgeIgnored = (edge: Edge) => boolean;
const defaultIsEdgeIgnored: IsEdgeIgnored = () => false;

export class Walker {
  private logger: Logger;
  private pathFinder: PathFinder;

  constructor(
    logger: Logger,
    private moveChecker: MoveValidator,
    private supergraph: Graph,
    private mergedGraph: Graph,
  ) {
    this.logger = logger.create('Walker');
    this.pathFinder = new PathFinder(this.logger, this.mergedGraph, this.moveChecker);
  }

  // Instead of walking the graph in all directions, this method will only walk the graph in the given steps.
  walkTrail(operationType: OperationTypeNode, steps: Step[]) {
    if (steps.length === 0) {
      throw new Error('Expected at least one step');
    }

    const rootNode = this.supergraph.nodeOf(
      operationType === OperationTypeNode.QUERY
        ? 'Query'
        : operationType === OperationTypeNode.MUTATION
          ? 'Mutation'
          : 'Subscription',
      false,
    );

    if (!rootNode) {
      throw new Error(`Expected root node for operation type ${operationType}`);
    }

    let state = new WalkTracker(
      new OperationPath(rootNode),
      this.mergedGraph.nodesOf(rootNode.typeName, false).map(n => new OperationPath(n)),
    );

    for (const step of steps) {
      const stepId =
        'fieldName' in step && step.fieldName
          ? `${step.typeName}.${step.fieldName}`
          : step.typeName;
      const isFieldStep = 'fieldName' in step;
      const isEdgeIgnored = (edge: Edge) => {
        if (isFieldStep) {
          return !isFieldEdge(edge) || edge.move.fieldName !== step.fieldName;
        }

        return true;
      };

      let called = 0;
      let unreachable = false;
      let emptyObjectResult = false;

      this.nextStep(
        state,
        state.superPath.tail() ?? state.superPath.rootNode(),
        (nextState, superEdge) => {
          if (called++ > 1) {
            throw new Error('Expected nextStep to be called only once');
          }

          state = nextState;

          if (nextState.isPossible()) {
            if (this.logger.isEnabled) {
              for (const path of nextState.paths) {
                this.logger.log(() => path.toString());
              }
            }
            this.logger.groupEnd(
              () => 'Advanced to ' + superEdge + ' with ' + nextState.paths.length + ' paths',
            );
          } else if (nextState.givesEmptyResult()) {
            emptyObjectResult = true;
            this.logger.groupEnd(() => 'Federation will resolve an empty object for ' + superEdge);
          } else {
            unreachable = true;
            this.logger.log(() => 'Dead end', '🚨 ');
            if (this.logger.isEnabled) {
              for (const path of state.paths) {
                this.logger.log(() => path.toString());
              }
            }
            this.logger.groupEnd(() => 'Unreachable path ' + nextState.superPath.toString());
          }
        },
        isEdgeIgnored,
      );

      if (unreachable) {
        break;
      }

      if (emptyObjectResult) {
        break;
      }
    }

    return state;
  }

  walk(method: 'bfs' | 'dfs' = 'bfs') {
    if (method === 'dfs') {
      return this.dfs();
    }

    return this.bfs();
  }

  private nextStep(
    state: WalkTracker,
    superTail: Node,
    next: (nextState: WalkTracker, edge: Edge) => void,
    isEdgeIgnored: IsEdgeIgnored = defaultIsEdgeIgnored,
  ) {
    const graphsLeadingToNode = Array.from(
      new Set(
        state.paths.map(p => {
          const edge = p.edge();
          const tail = p.tail() ?? p.rootNode();
          const tailGraphName = tail.graphName;

          // To prevent a scenario where multiple paths converge on the same Node,
          // differing fundamentally – some with the "@provides" directive and others without – we must differentiate them
          // not solely by the graph names leading to the Node,
          // but also by the presence of provided fields.
          // Simply marking a Node as visited and successfully checked after traversing a path with a @provided field,
          // using only graph names, results in a flaw.
          // This is because other paths leading to the same Node, lacking a @provided field,
          // will also be incorrectly marked as resolvable.
          // This inaccuracy arises because the Node contains an @external field, making it non-resolvable (non-provided field).
          if (edge && isFieldEdge(edge) && edge.move.provides) {
            return `${tailGraphName}#provides`;
          }

          return tailGraphName;
        }),
      ),
    );

    if (superTail.isGraphComboVisited(graphsLeadingToNode)) {
      this.logger.log(() => 'Node already visited: ' + superTail);
      return;
    }

    superTail.setGraphComboAsVisited(graphsLeadingToNode);

    const superEdges = this.supergraph.edgesOfHead(superTail);

    for (const superEdge of superEdges) {
      if (isEdgeIgnored(superEdge)) {
        continue;
      }
      this.logger.group(
        () => 'Attempt to advance to ' + superEdge + ' (' + state.paths.length + ' paths)',
      );

      if (state.isEdgeVisited(superEdge)) {
        this.logger.groupEnd(() => 'Edge already visited: ' + superEdge);
        continue;
      }

      if (!(isFieldEdge(superEdge) || isAbstractEdge(superEdge))) {
        throw new Error('Expected edge to have a FieldMove or AbstractMove');
      }

      const nextState = state.move(superEdge);
      const shortestPathPerTail = new Map<Node, OperationPath>();
      const isFieldMove = isFieldEdge(superEdge);
      const id = isFieldMove
        ? `${superEdge.move.typeName}.${superEdge.move.fieldName}`
        : `... on ${superEdge.tail.typeName}`;

      for (const path of state.paths) {
        this.logger.group(() => 'Advance path: ' + path.toString());
        const directPathsResult = this.pathFinder.findDirectPaths(
          path,
          isFieldMove ? superEdge.move.typeName : superEdge.tail.typeName,
          isFieldMove ? superEdge.move.fieldName : null,
          [],
        );

        // Special case when it's an abstract type and there are no direct paths
        if (directPathsResult.success && directPathsResult.paths.length === 0) {
          this.logger.groupEnd(() => 'Abstract type');
          continue;
        }

        if (directPathsResult.success) {
          setShortestPath(shortestPathPerTail, directPathsResult.paths);
        } else {
          for (const error of directPathsResult.errors) {
            nextState.addError(error);
          }
        }

        if (directPathsResult.success && superEdge.tail.isLeaf) {
          this.logger.groupEnd(() => 'Reached leaf node, no need to find indirect paths');
          continue;
        }

        const indirectPathsResult = this.pathFinder.findIndirectPaths(
          path,
          isFieldMove ? superEdge.move.typeName : superEdge.tail.typeName,
          isFieldMove ? superEdge.move.fieldName : null,
          [],
          [],
          [],
        );

        if (indirectPathsResult.success) {
          setShortestPath(shortestPathPerTail, indirectPathsResult.paths);
        } else {
          for (const error of indirectPathsResult.errors) {
            nextState.addError(error);
          }
        }
        this.logger.groupEnd(() =>
          directPathsResult.success || indirectPathsResult.success
            ? 'Can advance to ' + id
            : 'Cannot advance to ' + id,
        );
      }

      for (const shortestPathByTail of shortestPathPerTail.values()) {
        nextState.addPath(shortestPathByTail);
      }
      next(nextState, superEdge);
    }
  }

  private dfs() {
    const unreachable: WalkTracker[] = [];

    const rootNodes = ['Query', 'Mutation', 'Subscription']
      .map(name => this.supergraph.nodeOf(name, false))
      .filter((node): node is Node => !!node);

    for (const rootNode of rootNodes) {
      this._dfs(
        rootNode,
        new WalkTracker(
          new OperationPath(rootNode),
          this.mergedGraph.nodesOf(rootNode.typeName, false).map(n => new OperationPath(n)),
        ),
        unreachable,
      );
    }

    return unreachable;
  }

  private _dfs(superTail: Node, state: WalkTracker, unreachable: WalkTracker[]) {
    if (superTail.isLeaf) {
      return;
    }

    this.nextStep(state, superTail, (nextState, superEdge) => {
      if (nextState.isPossible()) {
        if (this.logger.isEnabled) {
          for (const path of nextState.paths) {
            this.logger.log(() => path.toString());
          }
        }
        this.logger.groupEnd(
          () => 'Advanced to ' + superEdge + ' with ' + nextState.paths.length + ' paths',
        );
        this._dfs(superEdge.tail, nextState, unreachable);
      } else if (nextState.givesEmptyResult()) {
        this.logger.groupEnd(() => 'Federation will resolve an empty object for ' + superEdge);
      } else {
        unreachable.push(nextState);
        this.logger.log(() => 'Dead end', '🚨 ');
        if (this.logger.isEnabled) {
          for (const path of state.paths) {
            this.logger.log(() => path.toString());
          }
        }
        this.logger.groupEnd(() => 'Unreachable path ' + nextState.superPath.toString());
      }
    });
  }

  private bfs() {
    const unreachable: WalkTracker[] = [];
    const queue: WalkTracker[] = [];

    for (const name of ['Query', 'Mutation', 'Subscription']) {
      const rootNode = this.supergraph.nodeOf(name, false);

      if (!rootNode) {
        continue;
      }

      queue.push(
        new WalkTracker(
          new OperationPath(rootNode),
          this.mergedGraph.nodesOf(rootNode.typeName, false).map(n => new OperationPath(n)),
        ),
      );
    }

    while (queue.length > 0) {
      const state = queue.pop();

      if (!state) {
        throw new Error('Unexpected end of queue');
      }

      const superTail = state.superPath.tail() ?? state.superPath.rootNode();

      if (superTail.isLeaf) {
        continue;
      }

      this.nextStep(state, superTail, (nextState, superEdge) => {
        if (nextState.isPossible()) {
          if (this.logger.isEnabled) {
            for (const path of nextState.paths) {
              this.logger.log(() => path.toString());
            }
          }
          this.logger.groupEnd(
            () => 'Advanced to ' + superEdge + ' with ' + nextState.paths.length + ' paths',
          );
          queue.push(nextState);
        } else if (nextState.givesEmptyResult()) {
          this.logger.groupEnd(() => 'Federation will resolve an empty object for ' + superEdge);
        } else {
          unreachable.push(nextState);
          this.logger.log(() => 'Dead end', '🚨 ');
          if (this.logger.isEnabled) {
            for (const path of state.paths) {
              this.logger.log(() => path.toString());
            }
          }
          this.logger.groupEnd(() => 'Unreachable path ' + nextState.superPath.toString());
        }
      });
    }

    return unreachable;
  }
}

function setShortestPath(shortestPathPerTail: Map<Node, OperationPath>, paths: OperationPath[]) {
  for (const path of paths) {
    const tail = path.tail() ?? path.rootNode();
    const shortestByTail = shortestPathPerTail.get(tail);

    if (!shortestByTail || shortestByTail.depth() > path.depth()) {
      shortestPathPerTail.set(tail, path);
    }
  }
}
