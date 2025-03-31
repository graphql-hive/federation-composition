import { Kind, parse } from "graphql";
import { describe, expect, test } from "vitest";
import { assertCompositionSuccess, composeServices } from "../src/compose.js";
import { ServiceDefinition } from "../src/types.js";
import { validate } from "../src/validate.js";

const serviceA: ServiceDefinition = {
  name: "serviceA",
  typeDefs: parse(`#graphql
        schema {
          query: CustomQueryName
        }
        type CustomQueryName {
          helloFromServiceA: String
        }
      `),
};

const serviceB: ServiceDefinition = {
  name: "serviceB",
  typeDefs: parse(`#graphql
        type Query {
          helloFromServiceB: String
        }
      `),
};
const serviceC: ServiceDefinition = {
  name: "serviceC",
  typeDefs: parse(`#graphql
        schema {
          query: RootQuery
        }
        type RootQuery {
          helloFromServiceC: String
        }
      `),
};

const subgraphServices = [serviceA, serviceB, serviceC];

describe("Test to validate custom root query is treated as Query", () => {
  test("Should treat RootQuery and CustomQueryName as Query when validating subgraphs", () => {
    const validationResult = validate(subgraphServices);

    if (!validationResult.success) {
      throw new Error("Validation failed");
    }

    const supergraph = validationResult.supergraph;

    const hasCustomRootQueryAsObjectType = supergraph.some(
      (def) =>
        def.kind === Kind.OBJECT_TYPE_DEFINITION &&
        (def.name.value === "RootQuery" ||
          def.name.value === "CustomQueryName"),
    );

    expect(hasCustomRootQueryAsObjectType).eq(false);
  });

  test("Should treat RootQuery and CustomQueryName as Query when merging subgraphs into supergraph", () => {
    const compositionResult = composeServices(subgraphServices);

    // Ensure composition was successful
    assertCompositionSuccess(compositionResult);

    const expectedQueryFields = [
      "helloFromServiceA",
      "helloFromServiceB",
      "helloFromServiceC",
    ];

    // Check the composed supergraph schema to see if both RootQuery and CustomQueryName were treated as Query
    for (const expectedField of expectedQueryFields) {
      expect(compositionResult.supergraphSdl).include(expectedField);
    }
  });
});
