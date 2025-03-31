import { parse } from "graphql";

export function graphql(literals: string | readonly string[], ...args: any[]) {
  if (typeof literals === "string") {
    literals = [literals];
  }

  let result = literals[0];

  args.forEach((arg, i) => {
    result += arg;
    result += literals[i + 1];
  });

  return parse(result, {
    noLocation: true,
  });
}

export function inspect<T>(value: T): T {
  console.dir(value, {
    depth: 5,
  });
  return value;
}
