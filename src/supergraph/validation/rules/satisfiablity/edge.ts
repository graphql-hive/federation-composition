import { SatisfiabilityError } from './errors.js';
import { lazy, type Lazy } from './helpers.js';
import { AbstractMove, EntityMove, FieldMove, Move } from './moves.js';
import { Node } from './node.js';

type EdgeResolvabilityResult =
  | {
      success: true;
      error: undefined;
    }
  | {
      success: false;
      error: Lazy<SatisfiabilityError>;
    };

export function isEntityEdge(edge: Edge): edge is Edge<EntityMove> {
  return edge.move instanceof EntityMove;
}

export function assertEntityEdge(edge: Edge): asserts edge is Edge<EntityMove> {
  if (!isEntityEdge(edge)) {
    throw new Error(`Expected edge to be Edge<EntityMove>, but got ${edge}`);
  }
}

export function isAbstractEdge(edge: Edge): edge is Edge<AbstractMove> {
  return edge.move instanceof AbstractMove;
}

export function assertAbstractEdge(edge: Edge): asserts edge is Edge<AbstractMove> {
  if (!isAbstractEdge(edge)) {
    throw new Error(`Expected edge to be Edge<AbstractMove>, but got ${edge}`);
  }
}

export function isFieldEdge(edge: Edge): edge is Edge<FieldMove> {
  return edge.move instanceof FieldMove;
}

export function assertFieldEdge(edge: Edge): asserts edge is Edge<FieldMove> {
  if (!isFieldEdge(edge)) {
    throw new Error(`Expected edge to be Edge<FieldMove>, but got ${edge}`);
  }
}

export class Edge<T = Move> {
  private resolvable: Array<[string[], EdgeResolvabilityResult]> = [];
  private _toString = lazy(() => `${this.head} -(${this.move})-> ${this.tail}`);

  constructor(
    public head: Node,
    public move: T,
    public tail: Node,
  ) {}

  isCrossGraphEdge(): boolean {
    return this.head.graphId !== this.tail.graphId;
  }

  toString() {
    return this._toString.get();
  }

  getResolvability(graphNames: string[]) {
    return this.resolvable.find(([checkedGraphNames]) => {
      return checkedGraphNames.every(name => {
        return graphNames.includes(name);
      });
    })?.[1];
  }

  setResolvable(success: true, graphNames: string[]): EdgeResolvabilityResult;
  setResolvable(
    success: false,
    graphNames: string[],
    error: Lazy<SatisfiabilityError>,
  ): EdgeResolvabilityResult;
  setResolvable(
    success: boolean,
    graphNames: string[],
    error?: Lazy<SatisfiabilityError>,
  ): EdgeResolvabilityResult {
    const result = success ? { success, error: undefined } : { success, error: error! };
    this.resolvable.push([graphNames, result]);
    return result;
  }
}
