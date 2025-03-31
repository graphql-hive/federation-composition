import { DirectiveNode } from "graphql";
import { FederationVersion } from "../../specifications/federation.js";
import type { ArgumentKind, Directive } from "../../subgraph/state.js";
import { createDirectiveNode } from "./ast.js";
import { convertToConst, MapByGraph, TypeBuilder } from "./common.js";

export function directiveBuilder(): TypeBuilder<Directive, DirectiveState> {
  return {
    visitSubgraphState(graph, state, directiveName, directive) {
      // Because the visitor is called from leaf to root (it's using "leave"),
      // we can assume that @composeDirective was already visited and set the composed flag.
      // If it's not set, we can skip this directive as it shouldn't be included in the supergraph anyway.
      if (!directive.composed) {
        return;
      }

      const directiveState = getOrCreateDirective(state, directiveName);

      for (const location of directive.locations) {
        directiveState.locations.add(location);
      }

      if (directive.repeatable) {
        directiveState.repeatable = true;
      }

      for (const arg of directive.args.values()) {
        const argState = getOrCreateArg(
          directiveState,
          arg.name,
          arg.type,
          arg.kind,
        );

        arg.tags.forEach((tag) => argState.tags.add(tag));

        if (arg.type.endsWith("!")) {
          argState.type = arg.type;
        }

        arg.ast.directives.forEach((directive) => {
          argState.ast.directives.push(directive);
        });

        if (arg.inaccessible) {
          argState.inaccessible = true;
        }

        argState.kind = arg.kind;

        argState.byGraph.set(graph.id, {
          type: arg.type,
          kind: arg.kind,
          defaultValue: arg.defaultValue,
          version: graph.version,
        });
      }

      directiveState.byGraph.set(graph.id, {
        locations: directive.locations,
        repeatable: directive.repeatable,
        version: graph.version,
      });
    },
    composeSupergraphNode(directive) {
      return createDirectiveNode({
        name: directive.name,
        locations: Array.from(directive.locations),
        repeatable: directive.repeatable,
        arguments: Array.from(directive.args.values()).map((arg) => ({
          name: arg.name,
          type: arg.type,
          kind: arg.kind,
          cost: null,
          tags: Array.from(arg.tags),
          inaccessible: arg.inaccessible,
          defaultValue: arg.defaultValue,
          ast: {
            directives: convertToConst(arg.ast.directives),
          },
        })),
      });
    },
  };
}

export type DirectiveState = {
  kind: "directive";
  name: string;
  byGraph: MapByGraph<DirectiveStateInGraph>;
  locations: Set<string>;
  repeatable: boolean;
  args: Map<string, DirectiveArgState>;
};

type DirectiveStateInGraph = {
  locations: Set<string>;
  repeatable: boolean;
  version: FederationVersion;
};

export type DirectiveArgState = {
  name: string;
  type: string;
  kind: ArgumentKind;
  tags: Set<string>;
  inaccessible: boolean;
  defaultValue?: string;
  byGraph: MapByGraph<ArgStateInGraph>;
  ast: {
    directives: DirectiveNode[];
  };
};

type ArgStateInGraph = {
  type: string;
  kind: ArgumentKind;
  defaultValue?: string;
  version: FederationVersion;
};

function getOrCreateDirective(
  state: Map<string, DirectiveState>,
  directiveName: string,
) {
  const existing = state.get(directiveName);

  if (existing) {
    return existing;
  }

  const def: DirectiveState = {
    kind: "directive",
    name: directiveName,
    locations: new Set(),
    byGraph: new Map(),
    args: new Map(),
    repeatable: false,
  };

  state.set(directiveName, def);

  return def;
}

function getOrCreateArg(
  directiveState: DirectiveState,
  argName: string,
  argType: string,
  argKind: ArgumentKind,
) {
  const existing = directiveState.args.get(argName);

  if (existing) {
    return existing;
  }

  const def: DirectiveArgState = {
    name: argName,
    type: argType,
    kind: argKind,
    inaccessible: false,
    tags: new Set(),
    byGraph: new Map(),
    ast: {
      directives: [],
    },
  };

  directiveState.args.set(argName, def);

  return def;
}
