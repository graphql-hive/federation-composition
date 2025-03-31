/**
 * Given [ A, B, C ] return
 * commaBeforeConjunction: true -> 'A, B, and C'.
 * commaBeforeConjunction: false -> 'A, B and C'.
 */
export function andList(
  items: readonly string[],
  commaBeforeConjunction = true,
  wrapper?: string,
): string {
  return formatList("and", items, commaBeforeConjunction, wrapper);
}

function formatList(
  conjunction: string,
  items: readonly string[],
  commaBeforeConjunction = true,
  wrapper?: string,
): string {
  if (items.length === 0) {
    return "";
  }

  switch (items.length) {
    case 1:
      return withWrapper(items[0], wrapper);
    case 2:
      return (
        withWrapper(items[0], wrapper) +
        " " +
        conjunction +
        " " +
        withWrapper(items[1], wrapper)
      );
  }

  const allButLast = items
    .slice(0, -1)
    .map((item) => withWrapper(item, wrapper));
  const lastItem = withWrapper(items.at(-1)!, wrapper);
  return (
    allButLast.join(", ") +
    (commaBeforeConjunction ? ", " : " ") +
    conjunction +
    " " +
    lastItem
  );
}

function withWrapper(text: string, wrapper?: string): string {
  if (!wrapper) {
    return text;
  }

  return wrapper + text + wrapper;
}
