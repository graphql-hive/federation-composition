import { lazy } from "./helpers.js";
import type { Selection } from "./selection.js";

export interface Move {
  toString(): string;
}

type FieldMoveOverride = {
  label: string | null;
  fromGraphId: string | null;
  value: boolean;
} | null;
export class FieldMove implements Move {
  private _toString = lazy(() => {
    let str = this.fieldName;

    if (this.requires) {
      str += ` @require(${this.requires})`;
    }

    if (this.provides) {
      str += ` @provides(${this.provides})`;
    }

    if (this.provided) {
      str += " @provided";
    }

    if (this.override) {
      str += ` @override(label: ${this.override.label}`;
      str += `, on: ${this.override.value})`;
    }

    if (this.requiredContexts !== 0n) {
      str += ` @fromContext(mask: ${this.requiredContexts})`;
    }

    return str;
  });

  constructor(
    public typeName: string,
    public fieldName: string,
    public requires: Selection | null = null,
    public provides: Selection | null = null,
    private _override: {
      label: string | null;
      fromGraphId: string | null;
      value: boolean;
    } | null = null,
    public provided: boolean = false,
    /**
     * Mask of contexts that have to be set by an ancestor,
     * for the field's `@fromContext` arguments to be resolvable.
     */
    public requiredContexts: bigint = 0n,
  ) {}

  get override(): FieldMoveOverride {
    return this._override;
  }

  set override(override: FieldMoveOverride) {
    this._override = override;
    this._toString.invalidate();
  }

  toString() {
    return this._toString.get();
  }
}

export class AbstractMove implements Move {
  private _toString = lazy(() =>
    this.keyFields ? `🔮 🔑 ${this.keyFields}` : `🔮`,
  );

  constructor(public keyFields?: Selection) {}

  toString() {
    return this._toString.get();
  }
}

export class EntityMove implements Move {
  private _toString = lazy(() => `🔑 ${this.keyFields}`);

  constructor(public keyFields: Selection) {}

  toString() {
    return this._toString.get();
  }
}
