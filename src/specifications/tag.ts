import { parse } from "graphql";
import { isDirectiveDefinition } from "../graphql/helpers.js";

export const sdl = /* GraphQL */ `
  directive @tag(
    name: String!
  ) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION | SCHEMA
`;

export const typeDefs = parse(sdl);

export const directive = typeDefs.definitions.filter(isDirectiveDefinition)[0];
