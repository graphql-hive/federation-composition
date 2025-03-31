import { expect, test } from "vitest";
import {
  graphql,
  satisfiesVersionRange,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  test("OVERRIDE_ON_INTERFACE", () => {
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

            interface Bill @key(fields: "id") {
              id: ID!
              amount: Int! @override(from: "billing")
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          satisfiesVersionRange(">= v2.3", version)
            ? expect.objectContaining({
                message: expect.stringContaining(
                  `@override cannot be used on field "Bill.amount" on subgraph "billing": @override is not supported on interface type fields.`,
                ),
                extensions: expect.objectContaining({
                  code: "OVERRIDE_ON_INTERFACE",
                }),
              })
            : expect.objectContaining({
                message: expect.stringContaining(
                  '[billing] Cannot use @key on interface "Bill": @key is not yet supported on interfaces',
                ),
                extensions: expect.objectContaining({
                  code: "KEY_UNSUPPORTED_ON_INTERFACE",
                }),
              }),
        ]),
      }),
    );
  });
});
