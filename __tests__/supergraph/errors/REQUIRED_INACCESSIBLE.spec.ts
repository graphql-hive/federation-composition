import { expect, test } from "vitest";
import { graphql, testVersions } from "../../shared/testkit.js";

testVersions((api, version) => {
  test("REQUIRED_INACCESSIBLE", () => {
    expect(
      api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible"]
              )
            type Query {
              a(id: ID! @inaccessible): Int!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message:
              'Argument "Query.a(id:)" is @inaccessible but is a required argument of its field.',
            extensions: expect.objectContaining({
              code: "REQUIRED_INACCESSIBLE",
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
                import: ["@key", "@inaccessible"]
              )
              
            input A {
              id: ID! @inaccessible
              b: Int
            }
            type Query {
              a(a: A): Int!
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message:
              'Input field "A.id" is @inaccessible but is a required input field of its type.',
            extensions: expect.objectContaining({
              code: "REQUIRED_INACCESSIBLE",
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

          type Query {
            a(id: ID! @inaccessible): Int!@inaccessible
            b: Int!
          }
        `,
        },
      ])?.errors,
    ).toBeUndefined();

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

          input A @inaccessible {
            a: Int! @inaccessible
          }

          type Query {
            a(id: A! @inaccessible): Int! @inaccessible
            b: Int!
          }
        `,
        },
      ])?.errors,
    ).toBeUndefined();
  });
});
