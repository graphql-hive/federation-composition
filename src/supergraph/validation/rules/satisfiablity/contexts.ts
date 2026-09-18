import type { SupergraphState } from "../../../state.js";

type ContextAwareType = {
  name: string;
  contexts: Set<string>;
  interfaces: Set<string>;
};

/**
 * Stores the contexts available on each type as a bigint bitmask.
 *
 * Each distinct context is assigned one bit:
 *
 *   "auth"   -> 0001
 *   "tenant" -> 0010
 *   "locale" -> 0100
 *
 * A type with multiple contexts has those bits combined:
 *
 *   "auth" + "locale" -> 0101
 *
 * This makes context operations cheap:
 *
 *   combine:  have | other
 *   contains: (have & required) === required
 *
 */
export class Contexts {
  private readonly bitByContext = new Map<string, bigint>();
  readonly byTypeName = new Map<string, bigint>();

  constructor(supergraphState: SupergraphState) {
    // Union contexts are processed first because union members
    // inherit the contexts declared on their unions.
    this.addUnionContexts(supergraphState);

    for (const type of supergraphState.objectTypes.values()) {
      this.addTypeContexts(supergraphState, type);
    }

    for (const type of supergraphState.interfaceTypes.values()) {
      this.addTypeContexts(supergraphState, type);
    }
  }

  /**
   * Returns the bit assigned to a single context.
   *
   * A bit is assigned lazily the first time the context is encountered.
   */
  maskOf(context: string): bigint {
    return this.bitFor(context);
  }

  maskFor(contexts: Iterable<string>): bigint {
    // no contexts by default
    let mask = 0n;

    for (const context of contexts) {
      mask |= this.bitFor(context);
    }

    return mask;
  }

  /**
   * Returns the bit assigned to a context.
   *
   * New contexts receive the next unused bit:
   *
   *   first  -> 0001
   *   second -> 0010
   *   third  -> 0100
   */
  private bitFor(context: string): bigint {
    let bit = this.bitByContext.get(context);

    if (bit === undefined) {
      bit = 1n << BigInt(this.bitByContext.size);
      this.bitByContext.set(context, bit);
    }

    return bit;
  }

  private addMask(typeName: string, mask: bigint) {
    if (mask === 0n) {
      return;
    }

    const existing = this.byTypeName.get(typeName) ?? 0n;
    this.byTypeName.set(typeName, existing | mask);
  }

  private addUnionContexts(supergraphState: SupergraphState) {
    for (const union of supergraphState.unionTypes.values()) {
      const mask = this.maskFor(union.contexts);

      for (const member of union.members) {
        this.addMask(member, mask);
      }
    }
  }

  /**
   * Adds the contexts available directly through a type.
   *
   * - contexts declared on the type itself
   * - contexts declared on interfaces it implements
   */
  private addTypeContexts(
    supergraphState: SupergraphState,
    type: ContextAwareType,
  ) {
    let mask = this.maskFor(type.contexts);

    // The list already has all parents, so one look is enough.
    for (const interfaceName of type.interfaces) {
      const interfaceType = supergraphState.interfaceTypes.get(interfaceName);

      if (interfaceType) {
        mask |= this.maskFor(interfaceType.contexts);
      }
    }

    this.addMask(type.name, mask);
  }
}
