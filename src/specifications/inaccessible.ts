import { parse } from "graphql";
import { isDirectiveDefinition } from "../graphql/helpers.js";

export const sdl = /* GraphQL */ `
  directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
`;

export const typeDefs = parse(sdl);
export const directive = typeDefs.definitions.filter(isDirectiveDefinition)[0];
