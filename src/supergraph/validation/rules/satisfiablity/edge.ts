import { SatisfiabilityError } from './errors.js';
import { lazy, OverrideLabels, type Lazy } from './helpers.js';
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
  private resolvable: Array<[string[], OverrideLabels, EdgeResolvabilityResult]> = [];
  private ignored = false;
  private _toString = lazy(() => `${this.head} -(${this.move})-> ${this.tail}`);

  constructor(
    public head: Node,
    public move: T,
    public tail: Node,
  ) {}

  setIgnored(ignored: boolean) {
    this.ignored = ignored;
  }

  isIgnored(): boolean {
    return this.ignored;
  }

  isCrossGraphEdge(): boolean {
    return this.head.graphId !== this.tail.graphId;
  }

  toString() {
    return this._toString.get();
  }

  updateOverride(override: { label: string | null; fromGraphId: string | null; value: boolean }) {
    if (!(this.move instanceof FieldMove)) {
      throw new Error(`Expected move to be FieldMove, but got ${this.move}`);
    }

    this.move.override = override;
    this._toString.invalidate();
  }

  getResolvability(graphNames: string[], labelValues: OverrideLabels) {
    return this.resolvable.find(([checkedGraphNames, checkedLabelValues]) => {
      return checkedGraphNames.every(name => {
        return graphNames.includes(name);
      }) && checkedLabelValues.matches(labelValues);
    })?.[2];
  }

  setResolvable(success: true, graphNames: string[], labelValues: OverrideLabels): EdgeResolvabilityResult;
  setResolvable(
    success: false,
    graphNames: string[],
    labelValues: OverrideLabels,
    error: Lazy<SatisfiabilityError>,
  ): EdgeResolvabilityResult;
  setResolvable(
    success: boolean,
    graphNames: string[],
    labelValues: OverrideLabels,
    error?: Lazy<SatisfiabilityError>,
  ): EdgeResolvabilityResult {
    const result = success ? { success, error: undefined } : { success, error: error! };
    this.resolvable.push([graphNames, labelValues, result]);
    return result;
  }
}
