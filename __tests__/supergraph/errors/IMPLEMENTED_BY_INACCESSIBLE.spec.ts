import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("IMPLEMENTED_BY_INACCESSIBLE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@inaccessible"]
              )

            interface Shared {
              sharedField: String!
            }

            type A implements Shared {
              sharedField: String! @inaccessible
              b: String!
            }

            type B implements Shared {
              sharedField: String!
              b: String!
            }

            type Query {
              a: Shared
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Field "A.sharedField" is @inaccessible but implements the interface field "Shared.sharedField", which is in the API schema.`,
            ),
            extensions: expect.objectContaining({
              code: "IMPLEMENTED_BY_INACCESSIBLE",
            }),
          }),
        ]),
      }),
    );

    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@inaccessible"]
              )

            interface Shared {
              sharedField: String!
              inaccessibleField: String! @inaccessible
            }

            type A implements Shared {
              sharedField: String!
              inaccessibleField: String! @inaccessible
            }

            type B implements Shared {
              sharedField: String!
              inaccessibleField: String! @inaccessible
            }

            type Query {
              a: Shared
            }
          `,
        },
      ]),
    ).toEqual(expect.objectContaining({ supergraphSdl: expect.any(String) }));
  });
});
