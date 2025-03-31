import { GraphQLError } from "graphql";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphState } from "../../state.js";
import type { SupergraphValidationContext } from "../validation-context.js";

export function ReferencedInaccessibleRule(
  context: SupergraphValidationContext,
  supergraph: SupergraphState,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectState, fieldState) {
      const outputTypeName = fieldState.type.replace(/[\[\]\!]+/g, "");
      const referencesInaccessible =
        findOutputType(supergraph, outputTypeName)?.inaccessible === true;
      const isInaccessible =
        fieldState.inaccessible === true || objectState.inaccessible === true;

      if (referencesInaccessible && !isInaccessible) {
        context.reportError(
          new GraphQLError(
            `Type "${outputTypeName}" is @inaccessible but is referenced by "${objectState.name}.${fieldState.name}", which is in the API schema.`,
            {
              extensions: {
                code: "REFERENCED_INACCESSIBLE",
              },
            },
          ),
        );
      }
    },
    ObjectTypeFieldArg(objectState, fieldState, argState) {
      const outputTypeName = argState.type.replace(/[\[\]\!]+/g, "");
      const referencesInaccessible =
        findInputType(supergraph, outputTypeName)?.inaccessible === true;
      const isInaccessible =
        argState.inaccessible === true ||
        fieldState.inaccessible === true ||
        objectState.inaccessible === true;

      if (referencesInaccessible && !isInaccessible) {
        context.reportError(
          new GraphQLError(
            `Type "${outputTypeName}" is @inaccessible but is referenced by "${objectState.name}.${fieldState.name}(${argState.name}:)", which is in the API schema.`,
            {
              extensions: {
                code: "REFERENCED_INACCESSIBLE",
              },
            },
          ),
        );
      }
    },
  };
}

function findOutputType(supergraph: SupergraphState, typeName: string) {
  return (
    supergraph.enumTypes.get(typeName) ||
    supergraph.objectTypes.get(typeName) ||
    supergraph.interfaceTypes.get(typeName) ||
    supergraph.unionTypes.get(typeName)
  );
}

function findInputType(supergraph: SupergraphState, typeName: string) {
  return (
    supergraph.enumTypes.get(typeName) ||
    supergraph.inputObjectTypes.get(typeName)
  );
}
