import { SupergraphState } from "../state.js";
import { DirectiveState } from "./directive.js";
import { EnumTypeState } from "./enum-type.js";
import {
  InputObjectTypeFieldState,
  InputObjectTypeState,
} from "./input-object-type.js";
import {
  InterfaceTypeFieldState,
  InterfaceTypeState,
} from "./interface-type.js";
import {
  ObjectTypeFieldArgState,
  ObjectTypeFieldState,
  ObjectTypeState,
} from "./object-type.js";

/**
 * Implements a visitor pattern to easily access types, fields, arguments and so on without iterating over the subgraph's state over and over again.
 * This is super helpful in the supergraph validation phase.
 * The idea here is to iterate over supergraph's state once and pass objects to all the visitors.
 *
 * There's no point to visit everything as it's only used by the validation phase (supergraph).
 * Once we need to visit more objects, we will implement it.
 */
export function visitSupergraphState(
  supergraphState: SupergraphState,
  visitors: Array<SupergraphVisitorMap>,
) {
  // Object
  supergraphState.objectTypes.forEach((objectTypeState) => {
    for (const visitor of visitors) {
      if (visitor.ObjectType) {
        visitor.ObjectType(objectTypeState);
      }
    }

    for (const fieldState of objectTypeState.fields.values()) {
      for (const visitor of visitors) {
        if (visitor.ObjectTypeField) {
          visitor.ObjectTypeField(objectTypeState, fieldState);
        }
      }

      for (const argState of fieldState.args.values()) {
        for (const visitor of visitors) {
          if (visitor.ObjectTypeFieldArg) {
            visitor.ObjectTypeFieldArg(objectTypeState, fieldState, argState);
          }
        }
      }
    }
  });

  // Enum
  supergraphState.enumTypes.forEach((enumTypeState) => {
    for (const visitor of visitors) {
      if (visitor.EnumType) {
        visitor.EnumType(enumTypeState);
      }
    }
  });

  // Input Object
  supergraphState.inputObjectTypes.forEach((inputObjectTypeState) => {
    for (const visitor of visitors) {
      if (visitor.InputObjectType) {
        visitor.InputObjectType(inputObjectTypeState);
      }
    }

    for (const fieldState of inputObjectTypeState.fields.values()) {
      for (const visitor of visitors) {
        if (visitor.InputObjectTypeField) {
          visitor.InputObjectTypeField(inputObjectTypeState, fieldState);
        }
      }
    }
  });

  // Interface
  supergraphState.interfaceTypes.forEach((interfaceTypeState) => {
    for (const visitor of visitors) {
      if (visitor.InterfaceType) {
        visitor.InterfaceType(interfaceTypeState);
      }
    }

    for (const fieldState of interfaceTypeState.fields.values()) {
      for (const visitor of visitors) {
        if (visitor.InterfaceTypeField) {
          visitor.InterfaceTypeField(interfaceTypeState, fieldState);
        }
      }
    }
  });

  // Directive
  supergraphState.directives.forEach((directiveState) => {
    for (const visitor of visitors) {
      if (visitor.Directive) {
        visitor.Directive(directiveState);
      }
    }
  });
}

export interface SupergraphVisitorMap {
  // Object
  ObjectType?(objectState: ObjectTypeState): void;
  ObjectTypeField?(
    objectState: ObjectTypeState,
    fieldState: ObjectTypeFieldState,
  ): void;
  ObjectTypeFieldArg?(
    objectState: ObjectTypeState,
    fieldState: ObjectTypeFieldState,
    argState: ObjectTypeFieldArgState,
  ): void;
  // Interface
  InterfaceTypeField?(
    interfaceState: InterfaceTypeState,
    fieldState: InterfaceTypeFieldState,
  ): void;
  // Enum
  EnumType?(enumState: EnumTypeState): void;
  // Input Object
  InputObjectType?(inputObjectState: InputObjectTypeState): void;
  InputObjectTypeField?(
    inputObjectState: InputObjectTypeState,
    fieldState: InputObjectTypeFieldState,
  ): void;
  // Interface
  InterfaceType?(interfaceState: InterfaceTypeState): void;
  // Directive
  Directive?(directiveState: DirectiveState): void;
}
