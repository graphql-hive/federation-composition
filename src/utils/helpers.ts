export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

export function ensureValue<T>(value: T | undefined | null, message: string): T {
  if (isDefined(value)) {
    return value;
  }

  throw new Error(message);
}

export function mathMax(firstValue: number, secondValue: null | number) {
  if (secondValue === null) {
    return firstValue;
  }

  return Math.max(firstValue, secondValue);
}
