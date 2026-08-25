const notAReference = {
  context: undefined,
  selection: undefined,
};

/**
 * This function divides the value of `@fromContext(field:)` into the context
 * name and the selection.
 *
 * Input: `$userCtx { id }`
 * Output: `{ context: "userCtx", selection: " { id }" }`
 */
export function parseContextReference(input: string) {
  let pos = skipIgnoredTokens(input, 0);

  if (input[pos] !== "$") {
    return notAReference;
  }

  pos = skipIgnoredTokens(input, pos + 1);

  if (!isNameStart(input[pos])) {
    return notAReference;
  }

  const contextStart = pos++;

  while (isNameContinue(input[pos])) {
    pos++;
  }

  return {
    context: input.slice(contextStart, pos),
    selection: input.slice(pos),
  };
}

export function isValidContextName(name: string) {
  if (!isAsciiLetter(name[0])) {
    return false;
  }

  for (let pos = 1; pos < name.length; pos++) {
    if (!isAsciiLetter(name[pos]) && !isDigit(name[pos])) {
      return false;
    }
  }

  return true;
}

/**
 * The GraphQL ignored tokens are whitespace, a comma and a comment.
 */
function skipIgnoredTokens(input: string, start: number) {
  let pos = start;

  while (pos < input.length) {
    const char = input[pos];

    if (
      char === " " ||
      char === "\t" ||
      char === "\n" ||
      char === "\r" ||
      char === "," ||
      char === "\ufeff" // the byte order mark
    ) {
      pos++;
      continue;
    }

    if (char === "#") {
      pos++;

      while (pos < input.length && input[pos] !== "\n" && input[pos] !== "\r") {
        pos++;
      }

      continue;
    }

    break;
  }

  return pos;
}

function isNameStart(char: string | undefined) {
  return char === "_" || isAsciiLetter(char);
}

function isNameContinue(char: string | undefined) {
  return isNameStart(char) || isDigit(char);
}

function isAsciiLetter(char: string | undefined) {
  if (!char) {
    return false;
  }

  const code = char.charCodeAt(0);

  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  );
}

function isDigit(char: string | undefined) {
  if (!char) {
    return false;
  }

  const code = char.charCodeAt(0);

  return code >= 48 && code <= 57;
}
