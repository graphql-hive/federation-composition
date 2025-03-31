import {
  GraphQLError,
  Kind,
  ListValueNode,
  OperationTypeNode,
  print,
  specifiedScalarTypes,
  ValueNode,
} from "graphql";
import {
  isList,
  isNonNull,
  stripNonNull,
  stripTypeModifiers,
} from "../../../utils/state.js";
import { InterfaceTypeFieldState } from "../../composition/interface-type.js";
import { ObjectTypeFieldState } from "../../composition/object-type.js";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphState } from "../../state.js";
import type { SupergraphValidationContext } from "../validation-context.js";
import { isFieldEdge } from "./satisfiablity/edge.js";
import { SatisfiabilityError } from "./satisfiablity/errors.js";
import { Supergraph } from "./satisfiablity/supergraph.js";
import { WalkTracker } from "./satisfiablity/walker.js";

type QueryPath = Array<
  | {
      typeName: string;
      fieldName: string;
    }
  | {
      typeName: string;
    }
>;

export function SatisfiabilityRule(
  context: SupergraphValidationContext,
  supergraphState: SupergraphState,
): SupergraphVisitorMap {
  const supergraph = new Supergraph(supergraphState);

  const unreachables = supergraph.validate();

  const errorByCoordinate: Record<string, WalkTracker[]> = {};

  for (const unreachable of unreachables) {
    const edge = unreachable.superPath.edge();

    if (!edge) {
      throw new Error("Expected edge to be defined");
    }

    if (isFieldEdge(edge)) {
      const fieldCoordinate = `${edge.move.typeName}.${edge.move.fieldName}`;

      if (!errorByCoordinate[fieldCoordinate]) {
        errorByCoordinate[fieldCoordinate] = [];
      }

      errorByCoordinate[fieldCoordinate].push(unreachable);
    } else {
      const coordinate = edge.head.typeName;

      if (!errorByCoordinate[coordinate]) {
        errorByCoordinate[coordinate] = [];
      }

      errorByCoordinate[coordinate].push(unreachable);
    }
  }

  function check(typeName: string, fieldName?: string) {
    const coordinate = fieldName ? `${typeName}.${fieldName}` : typeName;

    const unreachables = errorByCoordinate[coordinate];

    if (!unreachables?.length) {
      return;
    }

    for (const unreachable of unreachables) {
      const queryString = printQueryPath(
        supergraphState,
        unreachable.superPath.steps(),
      );

      if (!queryString) {
        return;
      }

      const errorsBySourceGraph: Record<string, SatisfiabilityError[]> = {};
      const reasons: Array<[string, string[]]> = [];

      for (const error of unreachable.listErrors()) {
        const sourceGraphName = error.sourceGraphName;

        if (!errorsBySourceGraph[sourceGraphName]) {
          errorsBySourceGraph[sourceGraphName] = [];
        }

        errorsBySourceGraph[sourceGraphName].push(error);
      }

      for (const sourceGraphName in errorsBySourceGraph) {
        const errors = errorsBySourceGraph[sourceGraphName];
        reasons.push([sourceGraphName, errors.map((e) => e.message)]);
      }

      if (reasons.length === 0) {
        continue;
      }

      context.reportError(
        new GraphQLError(
          [
            "The following supergraph API query:",
            queryString,
            "cannot be satisfied by the subgraphs because:",
            ...reasons.map(([graphName, reasons]) => {
              if (reasons.length === 1) {
                return `- from subgraph "${graphName}": ${reasons[0]}`;
              }

              return (
                `- from subgraph "${graphName}":\n` +
                reasons.map((r) => `  - ${r}`).join("\n")
              );
            }),
          ].join("\n"),
          {
            extensions: {
              code: "SATISFIABILITY_ERROR",
            },
          },
        ),
      );
    }
  }

  return {
    InterfaceType(interfaceState) {
      check(interfaceState.name);
      interfaceState.implementedBy.forEach((typeName) => check(typeName));
    },
    ObjectType(objectState) {
      check(objectState.name);
    },
    InterfaceTypeField(interfaceState, fieldState) {
      check(interfaceState.name, fieldState.name);
      interfaceState.implementedBy.forEach((typeName) =>
        check(typeName, fieldState.name),
      );
    },
    ObjectTypeField(objectState, fieldState) {
      check(objectState.name, fieldState.name);
    },
  };
}

function printLine(msg: string, indentLevel: number) {
  return "  ".repeat(indentLevel + 1) + msg;
}

function printQueryPath(
  supergraphState: SupergraphState,
  queryPath: QueryPath,
) {
  const lines: string[] = [];

  let endsWithScalar = false;

  for (let i = 0; i < queryPath.length; i++) {
    const point = queryPath[i];

    if ("fieldName" in point) {
      const typeState = supergraphState.objectTypes.get(point.typeName);

      if (!typeState) {
        throw new Error(
          `Object type "${point.typeName}" not found in Supergraph state`,
        );
      }

      let fieldState:
        | ObjectTypeFieldState
        | InterfaceTypeFieldState
        | undefined = typeState?.fields.get(point.fieldName);

      if (!fieldState) {
        for (const interfaceName of typeState.interfaces) {
          const interfaceState =
            supergraphState.interfaceTypes.get(interfaceName);

          if (!interfaceState) {
            throw new Error(
              `Interface type "${interfaceName}" not found in Supergraph state`,
            );
          }

          fieldState = interfaceState.fields.get(point.fieldName);

          if (fieldState) {
            break;
          }
        }
      }

      if (!fieldState) {
        throw new Error(
          `Field "${point.typeName}.${point.fieldName}" not found in Supergraph state`,
        );
      }

      const args = Array.from(fieldState.args)
        .map(
          ([name, argState]) =>
            `${name}: ${print(createEmptyValueNode(argState.type, supergraphState))}`,
        )
        .join(", ");
      const argsPrinted = args.length > 0 ? `(${args})` : "";

      if (i == queryPath.length - 1) {
        const outputTypeName = stripTypeModifiers(fieldState.type);
        endsWithScalar =
          supergraphState.scalarTypes.has(outputTypeName) ||
          supergraphState.enumTypes.has(outputTypeName) ||
          specifiedScalarTypes.some((s) => s.name === outputTypeName);

        if (endsWithScalar) {
          lines.push(printLine(`${point.fieldName}${argsPrinted}`, i));
        } else {
          lines.push(printLine(`${point.fieldName}${argsPrinted} {`, i));
        }
      } else {
        lines.push(printLine(`${point.fieldName}${argsPrinted} {`, i));
      }
    } else {
      lines.push(printLine(`... on ${point.typeName} {`, i));
    }
  }

  if (!endsWithScalar) {
    lines.push(printLine("...", lines.length));
  }

  const len = lines.length - 1;
  for (let i = 0; i < len; i++) {
    lines.push(printLine("}", len - i - 1));
  }

  if (queryPath[0].typeName === "Query") {
    lines.unshift("{");
  } else if (queryPath[0].typeName === "Mutation") {
    lines.unshift("mutation {");
  } else {
    lines.unshift("subscription {");
  }
  lines.push("}");

  return lines.join("\n");
}

function createEmptyValueNode(
  fullType: string,
  supergraphState: SupergraphState,
): ValueNode {
  if (isList(fullType)) {
    return {
      kind: Kind.LIST,
      values: [],
    } as ListValueNode;
  }

  if (isNonNull(fullType)) {
    const innerType = stripNonNull(fullType);

    return createEmptyValueNode(innerType, supergraphState);
  }

  if (supergraphState.enumTypes.has(fullType)) {
    const enumState = supergraphState.enumTypes.get(fullType)!;
    return {
      kind: Kind.ENUM,
      value: Array.from(enumState.values.keys())[0],
    };
  }

  if (supergraphState.scalarTypes.has(fullType)) {
    return {
      kind: Kind.STRING,
      value: "A string value",
    };
  }

  if (supergraphState.inputObjectTypes.has(fullType)) {
    const inputObjectTypeState =
      supergraphState.inputObjectTypes.get(fullType)!;

    return {
      kind: Kind.OBJECT,
      fields: Array.from(inputObjectTypeState.fields)
        .filter(([_, fieldState]) => isNonNull(fieldState.type))
        .map(([fieldName, fieldState]) => ({
          kind: Kind.OBJECT_FIELD,
          name: {
            kind: Kind.NAME,
            value: fieldName,
          },
          value: createEmptyValueNode(fieldState.type, supergraphState),
        })),
    };
  }

  const specifiedScalar = specifiedScalarTypes.find((s) => s.name === fullType);

  if (!specifiedScalar) {
    throw new Error(`Type "${fullType}" is not defined.`);
  }

  if (specifiedScalar.name === "String") {
    return {
      kind: Kind.STRING,
      value: "A string value",
    };
  }

  if (specifiedScalar.name === "Int" || specifiedScalar.name === "Float") {
    return {
      kind: Kind.INT,
      value: "0",
    };
  }

  if (specifiedScalar.name === "Boolean") {
    return {
      kind: Kind.BOOLEAN,
      value: true,
    };
  }

  if (specifiedScalar.name === "ID") {
    return {
      kind: Kind.STRING,
      value: "<any id>",
    };
  }

  throw new Error(`Type "${fullType}" is not supported.`);
}
