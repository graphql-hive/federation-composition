import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("OVERRIDE_FROM_SELF_ERROR", () => {
    expect(
      api.composeServices([
        {
          name: "billing",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@override"]
              )

            type Query {
              bills: [Bill]
            }

            type Bill @key(fields: "id") {
              id: ID!
              amount: Int! @override(from: "billing")
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Source and destination subgraphs "billing" are the same for overridden field "Bill.amount"`,
            ),
            extensions: expect.objectContaining({
              code: "OVERRIDE_FROM_SELF_ERROR",
            }),
          }),
        ]),
      }),
    );
  });
});
