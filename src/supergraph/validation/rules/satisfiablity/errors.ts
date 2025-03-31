import type { Lazy } from "./helpers.js";
import { isDefined } from "../../../../utils/helpers.js";

type SatisfiabilityErrorKind =
  | "KEY" // cannot move to subgraph "X" using @key(fields: "a b c") of "User", the key field(s) cannot be resolved from subgraph "Y".
  | "REQUIRE" // cannot satisfy @require conditions on field "User.name".
  | "EXTERNAL" // field "User.name" is not resolvable because marked @external
  | "MISSING_FIELD" // cannot find field "User.name".
  | "NO_KEY" // cannot move to subgraph "X", which has field "User.name", because type "User" has no @key defined in subgraph "Y".
  | "NO_IMPLEMENTATION"; // no subgraph can be reached to resolve the implementation type of @interfaceObject type "X".

export class SatisfiabilityError extends Error {
  static forKey(
    sourceGraphName: string,
    targetGraphName: string,
    typeName: string,
    keyFields: string,
  ): SatisfiabilityError {
    return new SatisfiabilityError(
      "KEY",
      sourceGraphName,
      typeName,
      null,
      `cannot move to subgraph "${targetGraphName}" using @key(fields: "${keyFields}") of "${typeName}", the key field(s) cannot be resolved from subgraph "${sourceGraphName}".`,
    );
  }

  static forRequire(
    sourceGraphName: string,
    typeName: string,
    fieldName: string,
  ): SatisfiabilityError {
    return new SatisfiabilityError(
      "REQUIRE",
      sourceGraphName,
      typeName,
      fieldName,
      `cannot satisfy @require conditions on field "${typeName}.${fieldName}".`,
    );
  }

  static forExternal(
    sourceGraphName: string,
    typeName: string,
    fieldName: string,
  ): SatisfiabilityError {
    return new SatisfiabilityError(
      "EXTERNAL",
      sourceGraphName,
      typeName,
      fieldName,
      `field "${typeName}.${fieldName}" is not resolvable because marked @external.`,
    );
  }

  static forMissingField(
    sourceGraphName: string,
    typeName: string,
    fieldName: string,
  ): SatisfiabilityError {
    return new SatisfiabilityError(
      "MISSING_FIELD",
      sourceGraphName,
      typeName,
      fieldName,
      `cannot find field "${typeName}.${fieldName}".`,
    );
  }

  static forNoKey(
    sourceGraphName: string,
    targetGraphName: string,
    typeName: string,
    fieldName: string,
  ): SatisfiabilityError {
    return new SatisfiabilityError(
      "NO_KEY",
      sourceGraphName,
      typeName,
      fieldName,
      `cannot move to subgraph "${targetGraphName}", which has field "${typeName}.${fieldName}", because type "${typeName}" has no @key defined in subgraph "${targetGraphName}".`,
    );
  }

  static forNoImplementation(
    sourceGraphName: string,
    typeName: string,
  ): SatisfiabilityError {
    return new SatisfiabilityError(
      "NO_IMPLEMENTATION",
      sourceGraphName,
      typeName,
      null,
      `no subgraph can be reached to resolve the implementation type of @interfaceObject type "${typeName}".`,
    );
  }

  private constructor(
    public kind: SatisfiabilityErrorKind,
    public sourceGraphName: string,
    public typeName: string,
    public fieldName: string | null,
    message: string,
  ) {
    super(message);
  }

  isMatchingField(typeName: string, fieldName: string) {
    if (this.typeName !== typeName) {
      return false;
    }

    if (this.fieldName) {
      return this.fieldName === fieldName;
    }

    return true;
  }

  toString() {
    return this.message;
  }
}

/**
 * The main job of this class is to collect errors in a lazy fashion.
 * This is useful because we can collect errors in different parts of the code
 * and only evaluate them when we need to report them.
 * A lot of times we don't even need those errors.
 *
 * Everything being lazy means we do not compute anything until we need to.
 * Thanks to this change,
 * I was able to go from 2s to 600ms at quite a large scale supergraph.
 */
export class LazyErrors<T> {
  private lazyError: Lazy<T | T[]>[] = [];

  add(lazyError: Lazy<T | T[]> | LazyErrors<T>) {
    if (lazyError instanceof LazyErrors) {
      this.lazyError.push(...lazyError.getLazyErrors());
      return this;
    }

    this.lazyError.push(lazyError);
    return this;
  }

  getLazyErrors() {
    return this.lazyError;
  }

  toArray(): T[] {
    return this.lazyError.flatMap((error) => error.get()).filter(isDefined);
  }

  isEmpty() {
    return this.lazyError.length === 0;
  }
}
