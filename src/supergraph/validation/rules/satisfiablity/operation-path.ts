import { isFieldEdge, type Edge } from "./edge.js";
import { lazy } from "./helpers.js";
import type { Node } from "./node.js";

export type Step = FieldStep | AbstractStep;

/**
 * `@override(label:)` cannot start with a space,
 * that's why we use a space to indicate that the label is empty
 */
export const emptyOverrideLabel = " ";

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
  private previousEdges: Edge[] = [];
  /**
   * Contexts set by the types we moved out of (the ancestors of the path's tail).
   * A `@fromContext` argument can only read a context set by an ancestor,
   * never one set by the field's own parent type.
   */
  private contextsInScope = 0n;
  /**
   * For each context in scope, the path to the nearest ancestor that sets it.
   * The ancestor is the tail of that path (or its root).
   * A nearer ancestor replaces a farther one, even if the farther one could resolve the selection.
   */
  private nearestAncestors: ReadonlyMap<bigint, OperationPath> | null = null;
  private _contextsKey = lazy(() => {
    if (!this.nearestAncestors) {
      return "";
    }

    let key = "#contexts:";
    for (const [context, ancestor] of this.nearestAncestors) {
      key += `${context}@${(ancestor.tail() ?? ancestor.rootNode()).index},`;
    }

    return key;
  });

  get contexts() {
    return this.contextsInScope;
  }

  /**
   * Identifies the contexts in scope and the ancestors that set them.
   * Empty when no context is in scope.
   */
  get contextsKey() {
    return this._contextsKey.get();
  }

  constructor(private _rootNode: Node) {}

  move(edge: Edge): OperationPath {
    this._toString.invalidate();

    // Only field moves turn the head into an ancestor.
    // Key and abstract moves stay at the same level and preserve the context scope.
    if (isFieldEdge(edge) && edge.head.contexts !== 0n) {
      // the path so far ends at the head, the new ancestor
      const ancestor = this.clone();
      const nearestAncestors = new Map(this.nearestAncestors);

      for (const context of contextBits(edge.head.contexts)) {
        nearestAncestors.set(context, ancestor);
      }

      this.nearestAncestors = nearestAncestors;
      this.contextsInScope |= edge.head.contexts;
      this._contextsKey.invalidate();
    }

    this.previousEdges.push(edge);
    return this;
  }

  clone() {
    const newPath = new OperationPath(this._rootNode);

    newPath.previousEdges = this.previousEdges.slice();
    newPath.contextsInScope = this.contextsInScope;
    newPath.nearestAncestors = this.nearestAncestors;

    return newPath;
  }

  /**
   * A `@requires` selection is resolved as its own fetch
   * starting from the requiring type, so it starts with no contexts in scope.
   */
  withoutContexts() {
    const newPath = this.clone();

    newPath.contextsInScope = 0n;
    newPath.nearestAncestors = null;

    return newPath;
  }

  hasContexts(required: bigint) {
    return (this.contextsInScope & required) === required;
  }

  /**
   * The path to the nearest ancestor that sets the context.
   * Check `hasContexts` first.
   */
  nearestAncestor(context: bigint): OperationPath {
    const ancestor = this.nearestAncestors?.get(context);

    if (!ancestor) {
      throw new Error(`Expected context ${context} to be in scope`);
    }

    return ancestor;
  }

  depth() {
    return this.previousEdges.length;
  }

  edge(): Edge | undefined {
    return this.previousEdges[this.previousEdges.length - 1];
  }

  steps(): Step[] {
    return this.previousEdges.map((edge) =>
      isFieldEdge(edge)
        ? { typeName: edge.move.typeName, fieldName: edge.move.fieldName }
        : { typeName: edge.tail.typeName },
    );
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
}

/**
 * Splits a mask into its single bits.
 */
function* contextBits(mask: bigint) {
  for (let rest = mask; rest !== 0n; rest &= rest - 1n) {
    yield rest & -rest;
  }
}
