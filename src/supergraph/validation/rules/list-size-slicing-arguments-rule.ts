import { GraphQLError } from "graphql";
import type { SupergraphVisitorMap } from "../../composition/visitor.js";
import type { SupergraphState } from "../../state.js";
import type { SupergraphValidationContext } from "../validation-context.js";
import { ObjectTypeFieldState } from "../../composition/object-type.js";
import { InterfaceTypeFieldState } from "../../composition/interface-type.js";

export function ListSizeSlicingArgumentsRule(
  context: SupergraphValidationContext,
  supergraph: SupergraphState,
): SupergraphVisitorMap {
  return {
    ObjectTypeField(objectState, fieldState) {
      let error = ensureSlicingArgumentsExist(objectState.name, fieldState);

      if (error) {
        context.reportError(error);
      }
    },
    InterfaceTypeField(interfaceState, fieldState) {
      let error = ensureSlicingArgumentsExist(interfaceState.name, fieldState);

      if (error) {
        context.reportError(error);
        return;
      }

      if (
        !fieldState?.listSize ||
        !fieldState?.listSize.slicingArguments?.length
      ) {
        return;
      }

      for (const implementorName of interfaceState.implementedBy) {
        const implementorType = supergraph.objectTypes.get(implementorName);

        if (!implementorType) {
          continue;
        }

        let implementorField = implementorType.fields.get(fieldState.name);

        if (!implementorField) {
          continue;
        }

        if (!implementorField.listSize) {
          continue;
        }

        if (!implementorField.listSize.slicingArguments?.length) {
          continue;
        }

        // When interface field has slicing arguments, and the implementor field has slicing arguments,
        // we need to print the requireOneSlicingArgument argument in the supergraph SDL.
        // No idea why though, I would print it only when they are different or something.
        // It's `true` by default anyway, so it doesn't really matter.
        fieldState.listSize.printRequireOneSlicingArgument = true;
      }
    },
  };
}

function ensureSlicingArgumentsExist(
  typeName: string,
  fieldState: ObjectTypeFieldState | InterfaceTypeFieldState,
): GraphQLError | undefined {
  if (!fieldState.listSize?.slicingArguments?.length) {
    return;
  }

  const newslicingArguments: string[] = [];
  for (const argName of fieldState.listSize.slicingArguments) {
    const argState = fieldState.args.get(argName);

    if (!argState) {
      throw new Error(
        "Could not find the argument in the field annotated with @listSize",
      );
    }

    if (argState.byGraph.size !== fieldState.byGraph.size) {
      continue;
    }

    newslicingArguments.push(argName);
  }

  if (!newslicingArguments.length) {
    return new GraphQLError(
      [
        `All arguments for @listSize(slicingArguments:) on field "${typeName}.${fieldState.name}" were disregarded.`,
        `For an argument to be valid, it must be defined in every subgraph where the field exists.`,
      ].join(" "),
      {
        extensions: {
          code: "LIST_SIZE_INVALID_SLICING_ARGUMENT",
        },
      },
    );
  }

  fieldState.listSize.slicingArguments = newslicingArguments;
}
