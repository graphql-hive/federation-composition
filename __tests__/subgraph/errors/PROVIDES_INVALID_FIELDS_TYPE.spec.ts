import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("PROVIDES_INVALID_FIELDS_TYPE - boolean", () => {
    expect(
      api.composeServices([
        {
          name: "billing",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@provides"]
              )

            type Payment @key(fields: "id") {
              id: ID!
              amount: Int!
            }

            type Invoice @key(fields: "id") {
              id: ID!
              amount: Int!
              payment: Payment @provides(fields: true)
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `[billing] On field "Invoice.payment", for @provides(fields: true): Invalid value for argument "fields": must be a string.`,
            ),
            extensions: expect.objectContaining({
              code: "PROVIDES_INVALID_FIELDS_TYPE",
            }),
          }),
        ]),
      }),
    );
  });
});
