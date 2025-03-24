export function occurrences(str: string, subString: string) {
  if (subString.length <= 0) {
    return str.length + 1;
  }

  let n = 0,
    pos = 0,
    step = subString.length;

  while (true) {
    pos = str.indexOf(subString, pos);
    if (pos >= 0) {
      ++n;
      pos += step;
    } else break;
  }
  return n;
}

export function scoreKeyFields(keyFields: string) {
  const fields = occurrences(keyFields, ' ') + 1;
  const innerSelectionSets = occurrences(keyFields, '{') * 3;

  return fields + innerSelectionSets;
}

export type Lazy<T> = {
  get(): T;
  invalidate(): void;
};

export function lazy<T>(factory: () => T) {
  let value: T | undefined;

  return {
    get() {
      if (value === undefined) {
        value = factory();
      }

      return value;
    },
    invalidate() {
      value = undefined;
    },
  };
}
