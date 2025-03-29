import { isFieldEdge, type Edge } from './edge.js';
import { lazy } from './helpers.js';
import type { Node } from './node.js';

export type Step = FieldStep | AbstractStep;

/**
 * `@override(label:)` cannot start with a space,
 * that's why we use a space to indicate that the label is empty
*/
export const emptyOverrideLabel = ' ';

export type FieldStep = {
  fieldName: string;
  typeName: string;
};

export type AbstractStep = {
  typeName: string;
};

export class OperationPath {
  private _toString = lazy(() => {
    let str = this._rootNode.toString();
    for (let i = 0; i < this.previousEdges.length; i++) {
      const edge = this.previousEdges[i];
      if (edge) {
        str += ` -(${edge.move})-> ${edge.tail}`;
      }
    }

    return str;
  });
  private previousNodes: Node[] = [];
  private previousEdges: Edge[] = [];
  private previousSteps: Step[] = [];

  constructor(private _rootNode: Node) {}

  move(edge: Edge): OperationPath {
    this._toString.invalidate();
    this.advance(edge);
    return this;
  }

  clone() {
    const newPath = new OperationPath(this._rootNode);

    newPath.previousNodes = this.previousNodes.slice();
    newPath.previousEdges = this.previousEdges.slice();
    newPath.previousSteps = this.previousSteps.slice();

    return newPath;
  }

  depth() {
    return this.previousEdges.length;
  }

  edge(): Edge | undefined {
    return this.previousEdges[this.previousEdges.length - 1];
  }

  steps(): Step[] {
    return this.previousSteps;
  }

  tail(): Node | undefined {
    return this.edge()?.tail;
  }

  rootNode() {
    return this._rootNode;
  }

  isVisitedEdge(edge: Edge) {
    return this.previousEdges.includes(edge);
  }

  toString() {
    return this._toString.get();
  }

  private advance(edge: Edge) {
    this.previousEdges.push(edge);
    this.previousNodes.push(edge.head);

    if(isFieldEdge(edge)) {
      this.previousSteps.push({
        typeName: edge.move.typeName,
        fieldName: edge.move.fieldName,
      });
    } else {
      this.previousSteps.push({
        typeName: edge.tail.typeName,
      });
    }
  }
}
