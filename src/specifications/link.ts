import {
  ConstArgumentNode,
  ConstDirectiveNode,
  ConstValueNode,
  Kind,
} from "graphql";
import JSON5 from "json5";
import { print } from "../graphql/printer.js";

export type Link = ReturnType<typeof parseLink>;
export type LinkImport = ReturnType<typeof parseLink>["imports"][number];

export function printLink(link: Link): string {
  return print({
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: "link",
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: "url",
        },
        value: {
          kind: Kind.STRING,
          value: [link.identity, link.version].filter(Boolean).join("/"),
        },
      },
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: "import",
        },
        value: {
          kind: Kind.LIST,
          values: link.imports.map((im) => {
            if (!im.alias) {
              return {
                kind: Kind.STRING,
                value: im.name,
              };
            }

            return {
              kind: Kind.OBJECT,
              fields: [
                {
                  kind: Kind.OBJECT_FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: "name",
                  },
                  value: {
                    kind: Kind.STRING,
                    value: im.name,
                  },
                },
                {
                  kind: Kind.OBJECT_FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: "as",
                  },
                  value: {
                    kind: Kind.STRING,
                    value: im.alias,
                  },
                },
              ],
            };
          }),
        },
      },
    ],
  });
}

/*

  https://example.com/exampleSchemaname/v1.0/?key=val&k2=v2#frag
                                            |------------------| ignored
                                       |----| version
                      |----------------| name
  |------------------------------------| identity

  All of these are valid arguments to url, and their interpretations:

  | url                                              | normalized url                              | name     | version |
  ----------------------------------------------------------------------------------------------------------------------|
  | https://spec.example.com/a/b/mySchema/v1.0/      | https://spec.example.com/a/b/mySchema/v1.0  | mySchema | v1.0    |
  | https://spec.example.com                         | https://spec.example.com                    | (null)   | (null)  |
  | https://spec.example.com/mySchema/v0.1?q=v#frag  | https://spec.example.com/mySchema/v0.1      | mySchema | v0.1    |
  | https://spec.example.com/mySchema/not-v          | https://spec.example.com/mySchema/not-v     | mySchema | not-v   |
  | https://spec.example.com/v1.0                    | https://spec.example.com/v1.0               | (null)   | v1.0    |
  | https://spec.example.com/vX                      | https://spec.example.com/vX                 | vX       | (null)  |

  If `name` is present, that `namespace` prefix will automatically be linked to the URL.
  If a `name` is not present, then elements of the foreign schema must be imported in order to be referenced.
*/
export function parseLinkUrl(urlString: string) {
  const url = new URL(urlString);
  const parts = url.pathname.split("/").filter(Boolean);
  const len = parts.length;

  if (!len) {
    return { name: null, version: null, identity: url.origin };
  }

  const last = parts[len - 1];
  const secondLast = parts[len - 2];

  // https://spec.example.com/mySchema/v0.1
  // https://spec.example.com/mySchema/not-a-version
  const potentiallyNameAndVersion = typeof secondLast === "string";

  if (potentiallyNameAndVersion) {
    return {
      name: secondLast,
      version: last,
      identity:
        url.origin +
        "/" +
        parts
          .slice(0, len - 2)
          .concat(secondLast)
          .join("/"),
    };
  }

  if (/^v\d+/i.test(last)) {
    // if (len >= 2) {
    //   const secondLast = parts[len - 2];

    //   return {
    //     name: secondLast,
    //     version: last,
    //     identity:
    //       url.origin +
    //       '/' +
    //       parts
    //         .slice(0, len - 2)
    //         .concat(secondLast)
    //         .join('/'),
    //   };
    // }
    return {
      name: null,
      version: last,
      identity: url.origin,
    };
  }

  return {
    name: last,
    version: null,
    identity:
      url.origin +
      "/" +
      parts
        .slice(0, len - 2)
        .concat(last)
        .join("/"),
  };
}

export function parseLinkImport(importString: string) {
  try {
    const bindings = JSON5.parse(importString);

    if (!Array.isArray(bindings)) {
      throw new Error(`Expected an array`);
    }

    // TODO: validate the name of the "name" and "alias" properties (if it's correct name for a type or directive)

    return bindings.map((binding) => {
      if (typeof binding === "string") {
        return {
          kind: binding.startsWith("@") ? "directive" : "type",
          name: binding,
        } as const;
      }

      if (typeof binding === "object" && binding.name) {
        const nameKind = binding.name.startsWith("@") ? "directive" : "type";

        if (!binding.as) {
          return {
            kind: nameKind,
            name: binding.name as string,
          } as const;
        }

        const aliasKind = binding.as.startsWith("@") ? "directive" : "type";

        if (nameKind !== aliasKind) {
          throw new Error(
            `${binding.name} and ${binding.as} must be of the same kind`,
          );
        }

        return {
          kind: nameKind,
          name: binding.name as string,
          alias: binding.as as string,
        } as const;
      }

      throw new Error(`Syntax`);
    });
  } catch (error) {
    throw new Error(
      `Invalid import binding: ${importString}: ${String(error)}`,
    );
  }
}

export function mergeLinks(links: readonly Link[]): readonly Link[] {
  // group by identity
  const groupByIdentity = new Map<
    string,
    {
      name: string | null;
      highestVersion: string;
      imports: Array<Link["imports"][number]>;
    }
  >();

  for (const link of links) {
    const existing = groupByIdentity.get(link.identity);

    if (!existing) {
      const importedDirectives = link.imports.filter(
        (im) => im.kind === "directive",
      );

      if (importedDirectives.length === 0) {
        continue;
      }

      groupByIdentity.set(link.identity, {
        name: link.name,
        highestVersion: link.version ?? "",
        imports: link.imports.filter((im) => im.kind === "directive"),
      });
    } else {
      // select highest version
      if (
        link.version &&
        parseFloat(link.version.replace("v", "")) >
          parseFloat(existing.highestVersion.replace("v", ""))
      ) {
        existing.highestVersion = link.version;
      }

      // merge imports
      for (const im of link.imports) {
        // Federation v2 ignores type imports in Supergraph SDL
        if (im.kind === "type") {
          continue;
        }

        const hasImport = existing.imports.some(
          (existingIm) =>
            existingIm.kind === im.kind && existingIm.name === im.name,
        );

        if (!hasImport) {
          existing.imports.push(im);
        }
      }

      if (link.name) {
        existing.name = link.name;
      }
    }
  }

  return Array.from(groupByIdentity.entries()).map(([identity, link]) => ({
    identity,
    version: link.highestVersion,
    imports: Array.from(link.imports).map((link) => ({
      kind: link.kind,
      name: link.name,
      alias: link.alias,
    })),
    name: link.name,
  }));
}

export function parseLink(urlString: string, importString: string) {
  const spec = parseLinkUrl(urlString);

  return {
    name: spec.name,
    version: spec.version,
    identity: spec.identity,
    imports: parseLinkImport(importString),
  };
}

export function parseLinkDirective(directive: ConstDirectiveNode) {
  const urlArg = directive.arguments?.find(isUrlArgument);

  if (!urlArg) {
    return null;
  }

  const importArg = directive.arguments?.find(isImportArgument);

  const spec = parseLinkUrl(urlArg?.value.value);

  return {
    name: spec.name,
    version: spec.version,
    identity: spec.identity,
    imports: parseLinkImport(importArg ? print(importArg.value) : "[]"),
  };
}

function isUrlArgument(arg: ConstArgumentNode): arg is {
  name: {
    kind: Kind.NAME;
    value: "url";
  };
  kind: Kind.ARGUMENT;
  value: {
    kind: Kind.STRING;
    value: string;
  };
} {
  return arg.name.value === "url" && arg.value.kind === Kind.STRING;
}

function isImportArgument(arg: ConstArgumentNode): arg is {
  name: {
    kind: Kind.NAME;
    value: "import";
  };
  kind: Kind.ARGUMENT;
  value: {
    kind: Kind.LIST;
    values: readonly ConstValueNode[];
  };
} {
  return arg.name.value === "import" && arg.value.kind === Kind.LIST;
}

export const sdl = /* GraphQL */ `
  directive @link(
    url: String
    as: String
    for: link__Purpose
    import: [link__Import]
  ) repeatable on SCHEMA

  scalar link__Import

  enum link__Purpose {
    """
    \`SECURITY\` features provide metadata necessary to securely resolve fields.
    """
    SECURITY

    """
    \`EXECUTION\` features provide metadata necessary for operation execution.
    """
    EXECUTION
  }
`;
