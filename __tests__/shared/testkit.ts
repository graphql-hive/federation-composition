import {
  assertValidSchema,
  buildASTSchema,
  buildSchema,
  DocumentNode,
  print,
} from "graphql";
import stripIndent from "strip-indent";
import { describe } from "vitest";
import {
  composeServices as apolloComposeServices,
  CompositionSuccess as ApolloCompositionSuccess,
} from "@apollo/composition";
import {
  assertCompositionFailure,
  compositionHasErrors,
  CompositionResult,
  CompositionSuccess,
  composeServices as guildComposeServices,
  assertCompositionSuccess as originalAssertCompositionSuccess,
} from "../../src/compose.js";
import { createStarsStuff } from "./../fixtures/stars-stuff.js";
import { graphql } from "./utils.js";

export function normalizeErrorMessage(literals: string | readonly string[]) {
  const message = typeof literals === "string" ? literals : literals.join("");
  return stripIndent(message).trim();
}

const missingErrorCodes = [
  "DISALLOWED_INACCESSIBLE",
  "EXTERNAL_ARGUMENT_DEFAULT_MISMATCH",
  "EXTERNAL_ARGUMENT_TYPE_MISMATCH",
  "EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE",

  "INVALID_FEDERATION_SUPERGRAPH",
  "SHAREABLE_HAS_MISMATCHED_RUNTIME_TYPES",
  "UNSUPPORTED_LINKED_FEATURE",
];

function composeServicesFactory(
  implementation: (
    services: Array<{
      name: string;
      typeDefs: DocumentNode;
      url?: string;
    }>,
  ) => CompositionResult,
) {
  return function composeServices(
    services: Array<{
      name: string;
      typeDefs: DocumentNode;
      url?: string;
    }>,
    __internal?: {
      disableValidationRules?: string[];
    },
    debug = false,
  ) {
    // @ts-expect-error - Expected 1 arguments, but got 2 as __internal is only available in our impl
    const result = implementation(services, __internal as any);

    // This will help us detect new validation errors
    if (compositionHasErrors(result)) {
      if (debug) {
        console.log(
          result.errors
            .map((e) => `[${e.extensions?.code ?? "UNKNOWN"}] ${e.message}`)
            .join("\n"),
        );
      }
      const codes = result.errors
        .map((e) => e.extensions?.code)
        .filter(Boolean);
      const uniqueCodes = new Set(codes);

      if (uniqueCodes.size > 0) {
        // find codes that are in todo list
        const todoCodes = Array.from(uniqueCodes).filter((c) =>
          missingErrorCodes.includes(c as any),
        );

        if (todoCodes.length) {
          console.warn(
            ["Detected", todoCodes.join(", "), "in a test"].join(" "),
          );
        }
      }
    } else if ("schema" in result && !!result.schema) {
      const apolloSchema = (result as unknown as ApolloCompositionSuccess)
        .schema;
      result.publicSdl = print(apolloSchema.toAPISchema().toAST());
    }

    return result;
  };
}

const both = [
  {
    library: "apollo" as const,
    composeServices: composeServicesFactory(apolloComposeServices),
    /** Adds strings to the  */
    interpolate(_str: string) {
      return "";
    },
    injectIf(library: "apollo" | "guild", str: string): string {
      if (library === "apollo") {
        return str;
      }

      return "";
    },
    runIf(library: "apollo" | "guild", fn: () => void) {
      if (library === "apollo") {
        fn();
        return;
      }
    },
  },
  {
    library: "guild" as const,
    composeServices: composeServicesFactory(guildComposeServices),
    injectIf(library: "apollo" | "guild", str: string): string {
      if (library === "guild") {
        return str;
      }

      return "";
    },
    runIf(library: "apollo" | "guild", fn: () => void) {
      if (library === "guild") {
        fn();
        return;
      }
    },
  },
];
export const versions = [
  "v2.0",
  "v2.1",
  "v2.2",
  "v2.3",
  "v2.4",
  "v2.5",
  "v2.6",
  "v2.7",
  "v2.8",
  "v2.9",
] as const;

export const federationVersionToJoinSpecVersion: Record<
  FederationVersion,
  string
> = {
  "v2.0": "v0.3",
  "v2.1": "v0.3",
  "v2.2": "v0.3",
  "v2.3": "v0.3",
  "v2.4": "v0.3",
  "v2.5": "v0.3",
  "v2.6": "v0.3",
  "v2.7": "v0.4",
  "v2.8": "v0.5",
  "v2.9": "v0.5",
};

type TestAPI = (typeof both)[number];

export function testVersions(
  runTests: (api: TestAPI, version: (typeof versions)[number]) => void,
) {
  describe.each(both)("$library", (api) => {
    describe.each(versions)("%s", (version) => {
      runTests(api, version);
    });
  });
}

export type FederationVersion = (typeof versions)[number];

export function satisfiesVersionRange(
  range: `${"<" | ">=" | ">"} ${FederationVersion}`,
  version: FederationVersion,
) {
  const [sign, ver] = range.split(" ") as ["<" | ">=" | ">", FederationVersion];
  const versionInRange = parseFloat(ver.replace("v", ""));
  const detectedVersion = parseFloat(version.replace("v", ""));

  if (sign === "<") {
    return detectedVersion < versionInRange;
  }

  if (sign === ">") {
    return detectedVersion > versionInRange;
  }

  return detectedVersion >= versionInRange;
}

export function testImplementations(runTests: (api: TestAPI) => void) {
  describe.each(both)("$library", (api) => {
    runTests(api);
  });
}

export function assertCompositionSuccess(
  result: CompositionResult,
  message?: string,
): asserts result is CompositionSuccess {
  originalAssertCompositionSuccess(result, message);

  const superSchema = buildSchema(result.supergraphSdl);
  assertValidSchema(superSchema);

  if ("publicSdl" in result) {
    const publicSchema = buildSchema(result.publicSdl);
    assertValidSchema(publicSchema);
  }

  if (!result.publicSdl && "schema" in result) {
    assertValidSchema(
      buildASTSchema(
        (result as unknown as ApolloCompositionSuccess).schema
          .toAPISchema()
          .toAST(),
      ),
    );
  }
}

export function ensureCompositionSuccess<T extends CompositionResult>(
  result: T,
) {
  assertCompositionSuccess(result);

  return result;
}

export { assertCompositionFailure, graphql };

export { createStarsStuff };
