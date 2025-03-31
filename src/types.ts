import { DocumentNode } from "graphql";

export interface ServiceDefinition {
  typeDefs: DocumentNode;
  name: string;
  url?: string;
}
