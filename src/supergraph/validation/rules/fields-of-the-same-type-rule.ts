import { GraphQLError } from "graphql";
import { TypeKind } from "../../../subgraph/state.js";
import { SupergraphVisitorMap } from "../../composition/visitor.js";
import { SupergraphValidationContext } from "../validation-context.js";

function stripNonNull(type: string) {
  return type.replace(/!$/, "");
}

function stripList(type: string) {
  const startsAt = type.indexOf("[");
  const endsAt = type.lastIndexOf("]");

  return type.slice(startsAt + 1, endsAt);
}

// We normalize the type to remove the non-null modifier
// Yeah yeah yeah, we could use an object to define if it's a list or non-null or name etc
// But this way is faster to iterate.
//
// Turn User! into User (if super type is nullable)
// Supergraph type | sign | Local type
// -----------------------------------
// `User`            ===    `User!`
// `String`          !==    `User!`
// `[User]`          ===    `[User!]`
// `[User!]`         ===    `[User!]`
// `[User]!`         ===    `[User!]!`
// `[User]!`         ===    `[User]!`
// `[User]`          ===    `[User!]!`
function normalizeOutputTypeStrings({
  superType,
  localType,
}: {
  superType: string;
  localType: string;
}): {
  superType: string;
  localType: string;
} {
  let superTypeNormalized = superType;
  let localTypeNormalized = localType;

  // If the super type is nullable, we remove the non-null modifier from the local type
  if (!superTypeNormalized.endsWith("!")) {
    localTypeNormalized = stripNonNull(localTypeNormalized);
  }

  // If the super type is a list and local type as well, we remove the list modifier
  if (
    superTypeNormalized.startsWith("[") &&
    localTypeNormalized.startsWith("[")
  ) {
    const innerSuper = stripList(superTypeNormalized);
    let innerLocal = stripList(localTypeNormalized);

    // If the inner type of super type is nullable, we remove the non-null modifier from the inner type of the local type
    if (!innerSuper.endsWith("!")) {
      innerLocal = stripNonNull(innerLocal);
    }

    const superSign = superTypeNormalized.endsWith("!") ? "!" : "";
    const localSign = localTypeNormalized.endsWith("!") ? "!" : "";
    superTypeNormalized = `[${innerSuper}]${superSign}`;
    localTypeNormalized = `[${innerLocal}]${localSign}`;
  }

  return {
    superType: superTypeNormalized,
    localType: localTypeNormalized,
  };
}

export function FieldsOfTheSameTypeRule(
  context: SupergraphValidationContext,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectTypeState, fieldState) {
      const typeToGraphs = new Map<string, string[]>();
      const typeNameToPossibleTypeNames = new Map<string, Set<string>>();

      fieldState.byGraph.forEach((field, graphName) => {
        const typeName = field.type
          .replaceAll("!", "")
          .replaceAll("[", "")
          .replaceAll("]", "");
        const typeState = context.subgraphStates
          .get(graphName)
          ?.types.get(typeName);

        if (typeState?.kind === TypeKind.UNION) {
          if (!typeNameToPossibleTypeNames.has(typeName)) {
            typeNameToPossibleTypeNames.set(typeName, new Set());
          }
          const list = typeNameToPossibleTypeNames.get(typeName)!;

          typeState.members.forEach((member) => {
            list.add(member);
          });
        } else if (typeState?.kind === TypeKind.INTERFACE) {
          if (!typeNameToPossibleTypeNames.has(typeName)) {
            typeNameToPossibleTypeNames.set(typeName, new Set());
          }
          const list = typeNameToPossibleTypeNames.get(typeName)!;

          typeState.implementedBy.forEach((member) => {
            list.add(member);
          });
        }

        const normalizedOutputTypes = normalizeOutputTypeStrings({
          superType: fieldState.type,
          localType: field.type,
        });
        const fieldOutputType =
          normalizedOutputTypes.superType === normalizedOutputTypes.localType
            ? normalizedOutputTypes.localType
            : field.type;
        const existing = typeToGraphs.get(fieldOutputType);

        if (existing) {
          existing.push(graphName);
        } else {
          typeToGraphs.set(fieldOutputType, [graphName]);
        }
      });

      if (typeToGraphs.size > 1) {
        if (typeNameToPossibleTypeNames.size === 1) {
          const possibleTypeNames: string[] = [];

          typeNameToPossibleTypeNames.forEach((list, unionOrInterfaceName) => {
            possibleTypeNames.push(unionOrInterfaceName);
            for (const typeName of list) {
              possibleTypeNames.push(typeName);
            }
          });

          const outputTypeNames = Array.from(typeToGraphs.keys()).map((t) =>
            t.replaceAll("!", "").replaceAll("[", "").replaceAll("]", ""),
          );

          if (outputTypeNames.every((t) => possibleTypeNames.includes(t))) {
            return;
          }
        }

        const groups = Array.from(typeToGraphs.entries()).map(
          ([outputType, graphs]) => {
            const plural = graphs.length > 1 ? "s" : "";
            return `type "${outputType}" in subgraph${plural} "${graphs
              .map(context.graphIdToName)
              .join('", "')}"`;
          },
        );
        const [first, second, ...rest] = groups;

        context.reportError(
          new GraphQLError(
            `Type of field "${objectTypeState.name}.${
              fieldState.name
            }" is incompatible across subgraphs: it has ${first} but ${second}${
              rest.length ? ` and ${rest.join(" and ")}` : ""
            }`,
            {
              extensions: {
                code: "FIELD_TYPE_MISMATCH",
              },
            },
          ),
        );
      }
    },
    InputObjectTypeField(inputObjectTypeState, fieldState) {
      const typeToGraphs = new Map<string, string[]>();

      fieldState.byGraph.forEach((field, graphName) => {
        // We normalize the type to remove the non-null modifier
        // Yeah yeah yeah, we could use an object to define if it's a list or non-null or name etc
        // But this way is faster to iterate.
        const isNonNullable = field.type.endsWith("!");
        const isNonNullableInSupergraph = fieldState.type.endsWith("!");
        const isMatchingNonNullablePart =
          fieldState.type.replace(/!$/, "") === field.type.replace(/!$/, "");
        let normalizedOutputType: string;

        // Turn User! into User (if super type is nullable)
        // Supergraph type | sign | Local type
        // -----------------------------------
        // `User!`           ===    `User`
        // `String!`         !==    `User`
        if (isMatchingNonNullablePart) {
          normalizedOutputType = isNonNullableInSupergraph
            ? isNonNullable
              ? field.type
              : field.type + "!"
            : field.type;
        } else {
          normalizedOutputType = field.type;
        }
        const existing = typeToGraphs.get(normalizedOutputType);

        if (existing) {
          existing.push(graphName);
        } else {
          typeToGraphs.set(normalizedOutputType, [graphName]);
        }
      });

      if (typeToGraphs.size > 1) {
        const groups = Array.from(typeToGraphs.entries()).map(
          ([outputType, graphs]) => {
            const plural = graphs.length > 1 ? "s" : "";
            return `type "${outputType}" in subgraph${plural} "${graphs
              .map(context.graphIdToName)
              .join('", "')}"`;
          },
        );
        const [first, second, ...rest] = groups;
        context.reportError(
          new GraphQLError(
            `Type of field "${inputObjectTypeState.name}.${
              fieldState.name
            }" is incompatible across subgraphs: it has ${first} but ${second}${
              rest.length ? ` and ${rest.join(" and ")}` : ""
            }`,
            {
              extensions: {
                code: "FIELD_TYPE_MISMATCH",
              },
            },
          ),
        );
      }
    },
  };
}
