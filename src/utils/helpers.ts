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

export function mathMaxNullable(left: number | null | undefined, right: number | null | undefined) {
  if (typeof left === 'number') {
    return mathMax(left, right ?? null);
  }

  if (typeof right === 'number') {
    return mathMax(right, left ?? null);
  }

  return null;
}

export function nullableArrayUnion<T>(left: T[] | null | undefined, right: T[] | null | undefined) {
  if (!Array.isArray(left) && !Array.isArray(right)) {
    return null;
  }

  const uniqueSet = new Set<T>();

  if (Array.isArray(left)) {
    left.forEach(v => uniqueSet.add(v));
  }

  if (Array.isArray(right)) {
    right.forEach(v => uniqueSet.add(v));
  }

  return Array.from(uniqueSet);
}
