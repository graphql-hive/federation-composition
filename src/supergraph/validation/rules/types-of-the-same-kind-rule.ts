import { GraphQLError } from "graphql";
import { TypeKind } from "../../../subgraph/state.js";
import { SupergraphValidationContext } from "./../validation-context.js";

const mapIRKindToString = {
  [TypeKind.OBJECT]: "Object",
  [TypeKind.INTERFACE]: "Interface",
  [TypeKind.UNION]: "Union",
  [TypeKind.ENUM]: "Enum",
  [TypeKind.INPUT_OBJECT]: "InputObject",
  [TypeKind.SCALAR]: "Scalar",
  [TypeKind.DIRECTIVE]: "Directive",
};

export type GraphTypeValidationContext = {
  graphName: string;
  isInterfaceObject: boolean;
};

export function TypesOfTheSameKindRule(context: SupergraphValidationContext) {
  /**
   * Map<typeName, Map<kind, Set<graphName>>>
   */
  const typeToKindWithGraphs = new Map<
    string,
    Map<TypeKind, Set<GraphTypeValidationContext>>
  >();
  const typesWithConflict = new Set<string>();

  for (const [graph, state] of context.subgraphStates) {
    state.types.forEach((type) => {
      const kindToGraphs = typeToKindWithGraphs.get(type.name);
      const isInterfaceObject =
        type.kind === TypeKind.INTERFACE ? type.isInterfaceObject : false;

      const graphsValue = {
        graphName: context.graphIdToName(graph),
        isInterfaceObject,
      };

      if (kindToGraphs) {
        // Seems like we've already seen this type
        const graphs = kindToGraphs.get(type.kind);

        if (graphs) {
          // If we've already seen this kind
          // Add the graph to the set.
          graphs.add(graphsValue);
        } else {
          // Add the kind to the map of kinds for that type
          kindToGraphs.set(type.kind, new Set([graphsValue]));
        }

        // If it has more than 1 kind
        if (kindToGraphs.size > 1) {
          // Add it to the conflict set
          typesWithConflict.add(type.name);
        }
      } else {
        // We haven't seen this type yet
        typeToKindWithGraphs.set(
          type.name,
          new Map([[type.kind, new Set([graphsValue])]]),
        );
      }
    });
  }

  for (const typeName of typesWithConflict) {
    const kindToGraphs = typeToKindWithGraphs.get(typeName)!;

    if (interfaceObjectConditions(kindToGraphs)) {
      continue;
    }

    const groups = Array.from(kindToGraphs.entries()).map(([kind, graphs]) => {
      const plural = graphs.size > 1 ? "s" : "";
      return `${mapIRKindToString[kind]} Type in subgraph${plural} "${Array.from(
        graphs,
      )
        .map((typeValidationContext) => typeValidationContext.graphName)
        .join('", "')}"`;
    });
    const [first, second, ...rest] = groups;

    context.reportError(
      new GraphQLError(
        `Type "${typeName}" has mismatched kind: it is defined as ${first} but ${second}${
          rest.length ? ` and ${rest.join(" and ")}` : ""
        }`,
        {
          extensions: {
            code: "TYPE_KIND_MISMATCH",
          },
        },
      ),
    );
  }
}

function interfaceObjectConditions(
  kindToGraphs: Map<TypeKind, Set<GraphTypeValidationContext>>,
): boolean {
  const interfaceTypes = kindToGraphs.get(TypeKind.INTERFACE) || [];
  for (const graphTypeValidationContext of interfaceTypes) {
    if (graphTypeValidationContext.isInterfaceObject) {
      return true;
    }
  }
  return false;
}
