import { describe, expect, test } from "vitest";
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  createStarsStuff,
  graphql,
  testVersions,
} from "../../shared/testkit.js";

testVersions((api, version) => {
  describe("@extends", () => {
    test("different location should be ignored if not imported", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

                type User @key(fields: "id") {
                  id: ID!
                }

                type Query {
                  users: [User]
                }
              `,
          },
          {
            name: "profiles",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@external"]
                  )

                directive @extends on FIELD_DEFINITION

                type User @key(fields: "id") {
                  id: ID!
                  profile: Profile
                }

                type Profile {
                  name: String!
                }
              `,
          },
        ]),
      );
    });

    test("different location should be ignored if imported but not used", () => {
      const result = api.composeServices([
        {
          name: "users",
          typeDefs: graphql`
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

                type User @key(fields: "id") {
                  id: ID!
                }

                type Query {
                  users: [User]
                }
              `,
        },
        {
          name: "profiles",
          typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@external", "@extends"]
                  )

                directive @extends on FIELD_DEFINITION

                type User @key(fields: "id") {
                  id: ID!
                  profile: Profile
                }

                type Profile {
                  name: String!
                }
              `,
        },
      ]);

      assertCompositionFailure(result);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message:
            '[profiles] Invalid definition for directive "@extends": "@extends" should have locations OBJECT, INTERFACE, but found (non-subset) FIELD_DEFINITION',
          extensions: expect.objectContaining({
            code: "DIRECTIVE_DEFINITION_INVALID",
          }),
        }),
      );
    });
  });

  describe("@external", () => {
    test("exact same definition without an import should be ignored", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

                directive @external on OBJECT | FIELD_DEFINITION

                type Query {
                  users: [User]
                }

                type User @key(fields: "id") {
                  id: ID!
                  name: String! @external
                }
              `,
          },
        ]),
      );
    });

    test("exact same definition with an import", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@external"]
                  )

                directive @external on OBJECT | FIELD_DEFINITION

                type Query {
                  users: [User]
                }

                type User @key(fields: "id") {
                  id: ID!
                  name: String! @external
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Field "User.name" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).`,
              ),
              extensions: expect.objectContaining({
                code: "EXTERNAL_UNUSED",
              }),
            }),
          ]),
        }),
      );
    });

    test("no OBJECT", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@external"]
                  )

                directive @external on FIELD_DEFINITION

                type Query {
                  users: [User]
                }

                type User @key(fields: "id") {
                  id: ID!
                  name: String! @external
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Field "User.name" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).`,
              ),
              extensions: expect.objectContaining({
                code: "EXTERNAL_UNUSED",
              }),
            }),
          ]),
        }),
      );
    });

    test("no FIELD_DEFINITION", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@external"]
                  )

                directive @external on OBJECT

                type Query {
                  users: [User]
                }

                type User @key(fields: "id") @external {
                  id: ID!
                  name: String!
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Field "User.name" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).`,
              ),
              extensions: expect.objectContaining({
                code: "EXTERNAL_UNUSED",
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe("@tag", () => {
    test("exact same definition should be ignored if not imported", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@inaccessible", "@requires", "@provides", "@external"]
                  )

                directive @tag(
                  name: String!
                ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

                type Query {
                  users: [User]
                }

                type User @key(fields: "id") {
                  id: ID!
                  internalId: ID! @inaccessible @external @tag(name: "public")
                  profile: Profile @requires(fields: "internalId")
                }

                type Profile {
                  name: String
                }
              `,
          },
          {
            name: "ext",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@inaccessible", "@external"]
                  )

                type Query {
                  users: [User]
                }

                extend type User @key(fields: "id") {
                  id: ID!
                  internalId: ID! @inaccessible
                }
              `,
          },
        ]),
      ).not.toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Cannot apply merged directive @tag(name: "public") to external field "User.internalId"`,
              ),
              extensions: expect.objectContaining({
                code: "MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL",
              }),
            }),
          ]),
        }),
      );
    });

    test("exact same definition with import", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: [
                      "@key"
                      "@inaccessible"
                      "@requires"
                      "@provides"
                      "@external"
                      "@tag"
                    ]
                  )

                directive @tag(
                  name: String!
                ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

                type Query {
                  users: [User]
                }

                type User @key(fields: "id") {
                  id: ID!
                  internalId: ID! @inaccessible @external @tag(name: "public")
                  profile: Profile @requires(fields: "internalId")
                }

                type Profile {
                  name: String
                }
              `,
          },
          {
            name: "ext",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@inaccessible", "@external"]
                  )

                type Query {
                  users: [User]
                }

                extend type User @key(fields: "id") {
                  id: ID!
                  internalId: ID! @inaccessible
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Cannot apply merged directive @tag(name: "public") to external field "User.internalId"`,
              ),
              extensions: expect.objectContaining({
                code: "MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL",
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe("@inaccessible", () => {
    test("exact same definition and imported", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@inaccessible", "@requires", "@provides", "@external"]
                  )

                directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

                type Query {
                  users: [User]
                }

                type User @key(fields: "id") {
                  id: ID!
                  internalId: ID! @inaccessible @external
                  profile: Profile @requires(fields: "internalId")
                }

                type Profile {
                  name: String
                }
              `,
          },
          {
            name: "ext",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@inaccessible", "@external"]
                  )

                type Query {
                  users: [User]
                }

                extend type User @key(fields: "id") {
                  id: ID!
                  internalId: ID! @inaccessible
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Cannot apply merged directive @inaccessible to external field "User.internalId"`,
              ),
              extensions: expect.objectContaining({
                code: "MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL",
              }),
            }),
          ]),
        }),
      );
    });

    test("exact same definition should be ignored when not imported", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@requires", "@provides", "@external"]
                  )

                directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

                type Query {
                  users: [User]
                }

                type User @key(fields: "id") {
                  id: ID!
                  internalId: ID! @inaccessible @external
                  profile: Profile @requires(fields: "internalId")
                }

                type Profile {
                  name: String
                }
              `,
          },
          {
            name: "ext",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@external"]
                  )

                directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION

                type Query {
                  users: [User]
                }

                extend type User @key(fields: "id") {
                  id: ID!
                  internalId: ID! @inaccessible
                }
              `,
          },
        ]),
      ).not.toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Cannot apply merged directive @inaccessible to external field "User.internalId"`,
              ),
              extensions: expect.objectContaining({
                code: "MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL",
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe("@override", () => {
    test("exact same definition and imported", () => {
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

                directive @override(from: String!) on FIELD_DEFINITION

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

    test("exact same definition should be ignored if not imported", () => {
      expect(
        api.composeServices([
          {
            name: "billing",
            typeDefs: graphql`
                extend schema
                  @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key"])

                directive @override(from: String!) on FIELD_DEFINITION

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
      ).not.toEqual(
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

  describe("@key", () => {
    test("exact same definition should be ignored if not imported", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@external", "FieldSet"]
                  ) {
                  query: Query
                }

                directive @key(
                  fields: FieldSet!
                  resolvable: Boolean = true
                ) repeatable on OBJECT | INTERFACE

                scalar FieldSet

                type User @key(fields: "THERE IS NO FIELD NAMED LIKE THIS") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      );
    });

    test("fields of String type", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@external", "@key"]
                  ) {
                  query: Query
                }

                directive @key(
                  fields: String!
                  resolvable: Boolean = true
                ) repeatable on OBJECT | INTERFACE

                type User @key(fields: "id") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      );
    });

    test("fields of different type", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@external", "@key"]
                  ) {
                  query: Query
                }

                directive @key(
                  fields: [String!]!
                  resolvable: Boolean = true
                ) repeatable on OBJECT | INTERFACE

                type User @key(fields: "id") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      );

      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@external", "@key"]
                  ) {
                  query: Query
                }

                directive @key(
                  fields: Str!
                  resolvable: Boolean = true
                ) repeatable on OBJECT | INTERFACE

                scalar Str

                type User @key(fields: "id") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Invalid definition for directive "@key": argument "fields" should have type "${
                  api.library === "apollo" ? "federation__FieldSet" : "FieldSet"
                }!" but found type "Str!"`,
              ),
              extensions: expect.objectContaining({
                code: "DIRECTIVE_DEFINITION_INVALID",
              }),
            }),
          ]),
        }),
      );
    });

    test("federation__FieldSet should be accepted", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
          schema @link(url: "https://specs.apollo.dev/link/v1.0") {
          query: Query
        }

        extend schema @link(url: "https://specs.apollo.dev/federation/${version}", import: ["@key", "@shareable", "@external", "@provides"])

        directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

        scalar federation__FieldSet

        type User @key(fields: "id") {
          id: ID!
          name: String
        }

        type Query {
          users: [User]
        }

        `,
          },
        ]),
      );
    });

    test("Fed v1: fields of [String!]! type should be accepted", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
              directive @key(fields: [String!]!) on OBJECT

              type User @key(fields: "id") {
                id: ID!
                name: String
              }

              type Query {
                users: [User]
              }
            `,
          },
        ]),
      );
    });

    test("missing default value for resolvable", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@external", "@key", "FieldSet"]
                  ) {
                  query: Query
                }

                directive @key(
                  fields: FieldSet!
                  resolvable: Boolean
                ) repeatable on OBJECT | INTERFACE

                scalar FieldSet

                type User @key(fields: "id") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Invalid definition for directive "@key": argument "resolvable" should have default value true but found default value null`,
              ),
              extensions: expect.objectContaining({
                code: "DIRECTIVE_DEFINITION_INVALID",
              }),
            }),
          ]),
        }),
      );
    });

    test("missing resolvable", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "FieldSet"]
                  ) {
                  query: Query
                }
                directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE

                scalar FieldSet

                type User @key(fields: "id") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      );
    });

    test("missing fields", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "FieldSet"]
                  ) {
                  query: Query
                }
                directive @key(field: FieldSet!) repeatable on OBJECT | INTERFACE

                scalar FieldSet

                type User @key(field: "id") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Invalid definition for directive "@key": missing required argument "fields"`,
              ),
              extensions: expect.objectContaining({
                code: "DIRECTIVE_DEFINITION_INVALID",
              }),
            }),
          ]),
        }),
      );
    });

    test("missing repeatable", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "FieldSet"]
                  ) {
                  query: Query
                }

                directive @key(
                  fields: FieldSet!
                  resolvable: Boolean = true
                ) on OBJECT | INTERFACE

                scalar FieldSet

                type User @key(fields: "id") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      );
    });

    test("not on INTERFACE", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "FieldSet"]
                  ) {
                  query: Query
                }
                directive @key(fields: FieldSet!, resolvable: Boolean = true) repeatable on OBJECT

                scalar FieldSet

                type User @key(fields: "id") {
                  id: ID!
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      );
    });

    test("not on OBJECT", () => {
      assertCompositionSuccess(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "FieldSet"]
                  ) {
                  query: Query
                }
                directive @key(
                  fields: FieldSet!
                  resolvable: Boolean = true
                ) repeatable on INTERFACE

                scalar FieldSet

                type Query {
                  users: [String]
                }
              `,
          },
        ]),
      );
    });

    test("on FIELD", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
                schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "FieldSet"]
                  ) {
                  query: Query
                }
                directive @key(fields: FieldSet!, resolvable: Boolean = true) repeatable on FIELD

                scalar FieldSet

                type User {
                  id: ID! @key(fields: "id")
                  name: String
                }

                type Query {
                  users: [User]
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[users] Invalid definition for directive "@key": "@key" should have locations OBJECT, INTERFACE, but found (non-subset) FIELD`,
              ),
              extensions: expect.objectContaining({
                code: "DIRECTIVE_DEFINITION_INVALID",
              }),
            }),
          ]),
        }),
      );
    });

    test("fed v1: uses FieldSet", () => {
      expect(
        api.composeServices([
          {
            name: "users",
            typeDefs: graphql`
              scalar FieldSet
              directive @key(
                fields: FieldSet!
                resolvable: Boolean = true
              ) repeatable on OBJECT | INTERFACE

              type User @key(fields: "id") {
                id: ID!
                name: String
              }

              type Query {
                users: [User]
              }
            `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                '[users] Invalid definition for directive "@key": argument "fields" should have type "_FieldSet!" but found type "FieldSet!"',
              ),
              extensions: expect.objectContaining({
                code: "DIRECTIVE_DEFINITION_INVALID",
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe("@requires", () => {
    test("should be ignored if not imported", () => {
      const starsStuff = createStarsStuff();

      assertCompositionSuccess(
        api.composeServices([
          starsStuff.users,
          starsStuff.pandas,
          starsStuff.products,
          starsStuff.reviews,
          {
            name: "inventory",
            typeDefs: graphql`
              extend schema
                @link(
                  url: "https://specs.apollo.dev/federation/${version}"
                  import: ["@key", "@shareable", "@external", "FieldSet"]
                )

              directive @requires(fields: FieldSet!) on FIELD_DEFINITION
              scalar FieldSet

              type Product implements ProductItf @key(fields: "id") {
                id: ID!
                dimensions: ProductDimension @external
                delivery(zip: String): DeliveryEstimates @requires(fields: "IT DOES NOT EXIST!!!!! ")
              }

              type ProductDimension @shareable {
                size: String
                weight: Float
              }

              type DeliveryEstimates {
                estimatedDelivery: String
                fastestDelivery: String
              }

              interface ProductItf {
                id: ID!
                dimensions: ProductDimension
                delivery(zip: String): DeliveryEstimates
              }

              enum ShippingClass {
                STANDARD
                EXPRESS
                OVERNIGHT
              }
            `,
          },
        ]),
      );
    });

    test("exact definition", () => {
      const starsStuff = createStarsStuff();

      assertCompositionSuccess(
        api.composeServices([
          starsStuff.users,
          starsStuff.pandas,
          starsStuff.products,
          starsStuff.reviews,
          {
            name: "inventory",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@shareable", "@external", "FieldSet", "@requires"]
                  )

                directive @requires(fields: FieldSet!) on FIELD_DEFINITION
                scalar FieldSet

                type Product implements ProductItf @key(fields: "id") {
                  id: ID!
                  dimensions: ProductDimension @external
                  delivery(zip: String): DeliveryEstimates
                    @requires(fields: "dimensions { size weight }")
                }

                type ProductDimension @shareable {
                  size: String
                  weight: Float
                }

                type DeliveryEstimates {
                  estimatedDelivery: String
                  fastestDelivery: String
                }

                interface ProductItf {
                  id: ID!
                  dimensions: ProductDimension
                  delivery(zip: String): DeliveryEstimates
                }

                enum ShippingClass {
                  STANDARD
                  EXPRESS
                  OVERNIGHT
                }
              `,
          },
        ]),
      );
    });

    test("fields of String type", () => {
      const starsStuff = createStarsStuff();

      assertCompositionSuccess(
        api.composeServices([
          starsStuff.users,
          starsStuff.pandas,
          starsStuff.products,
          starsStuff.reviews,
          {
            name: "inventory",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@shareable", "@external", "@requires"]
                  )

                directive @requires(fields: String!) on FIELD_DEFINITION

                type Product implements ProductItf @key(fields: "id") {
                  id: ID!
                  dimensions: ProductDimension @external
                  delivery(zip: String): DeliveryEstimates
                    @requires(fields: "dimensions { size weight }")
                }

                type ProductDimension @shareable {
                  size: String
                  weight: Float
                }

                type DeliveryEstimates {
                  estimatedDelivery: String
                  fastestDelivery: String
                }

                interface ProductItf {
                  id: ID!
                  dimensions: ProductDimension
                  delivery(zip: String): DeliveryEstimates
                }

                enum ShippingClass {
                  STANDARD
                  EXPRESS
                  OVERNIGHT
                }
              `,
          },
        ]),
      );
    });

    test("fields of different type", () => {
      const starsStuff = createStarsStuff();

      expect(
        api.composeServices([
          starsStuff.users,
          starsStuff.pandas,
          starsStuff.products,
          starsStuff.reviews,
          {
            name: "inventory",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@shareable", "@external", "@requires"]
                  )

                directive @requires(fields: Str!) on FIELD_DEFINITION
                scalar Str

                type Product implements ProductItf @key(fields: "id") {
                  id: ID!
                  dimensions: ProductDimension @external
                  delivery(zip: String): DeliveryEstimates
                    @requires(fields: "dimensions { size weight }")
                }

                type ProductDimension @shareable {
                  size: String
                  weight: Float
                }

                type DeliveryEstimates {
                  estimatedDelivery: String
                  fastestDelivery: String
                }

                interface ProductItf {
                  id: ID!
                  dimensions: ProductDimension
                  delivery(zip: String): DeliveryEstimates
                }

                enum ShippingClass {
                  STANDARD
                  EXPRESS
                  OVERNIGHT
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[inventory] Invalid definition for directive "@requires": argument "fields" should have type "${
                  api.library === "apollo" ? "federation__FieldSet" : "FieldSet"
                }!" but found type "Str!"`,
              ),
              extensions: expect.objectContaining({
                code: "DIRECTIVE_DEFINITION_INVALID",
              }),
            }),
          ]),
        }),
      );
    });

    test("missing fields", () => {
      const starsStuff = createStarsStuff();

      expect(
        api.composeServices([
          starsStuff.users,
          starsStuff.pandas,
          starsStuff.products,
          starsStuff.reviews,
          {
            name: "inventory",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@shareable", "@external", "@requires"]
                  )

                directive @requires(field: FieldSet!) on FIELD_DEFINITION
                scalar FieldSet

                type Product implements ProductItf @key(fields: "id") {
                  id: ID!
                  dimensions: ProductDimension @external
                  delivery(zip: String): DeliveryEstimates
                    @requires(field: "dimensions { size weight }")
                }

                type ProductDimension @shareable {
                  size: String
                  weight: Float
                }

                type DeliveryEstimates {
                  estimatedDelivery: String
                  fastestDelivery: String
                }

                interface ProductItf {
                  id: ID!
                  dimensions: ProductDimension
                  delivery(zip: String): DeliveryEstimates
                }

                enum ShippingClass {
                  STANDARD
                  EXPRESS
                  OVERNIGHT
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[inventory] Invalid definition for directive "@requires": missing required argument "fields"`,
              ),
              extensions: expect.objectContaining({
                code: "DIRECTIVE_DEFINITION_INVALID",
              }),
            }),
          ]),
        }),
      );
    });

    test("on OBJECT", () => {
      const starsStuff = createStarsStuff();

      expect(
        api.composeServices([
          starsStuff.users,
          starsStuff.pandas,
          starsStuff.products,
          starsStuff.reviews,
          {
            name: "inventory",
            typeDefs: graphql`
                extend schema
                  @link(
                    url: "https://specs.apollo.dev/federation/${version}"
                    import: ["@key", "@shareable", "@external", "@requires", "FieldSet"]
                  )

                directive @requires(fields: FieldSet!) on OBJECT
                scalar FieldSet

                type Product implements ProductItf @key(fields: "id") {
                  id: ID!
                  dimensions: ProductDimension @external
                  delivery(zip: String): DeliveryEstimates
                    @requires(fields: "dimensions { size weight }")
                }

                type ProductDimension @shareable {
                  size: String
                  weight: Float
                }

                type DeliveryEstimates {
                  estimatedDelivery: String
                  fastestDelivery: String
                }

                interface ProductItf {
                  id: ID!
                  dimensions: ProductDimension
                  delivery(zip: String): DeliveryEstimates
                }

                enum ShippingClass {
                  STANDARD
                  EXPRESS
                  OVERNIGHT
                }
              `,
          },
        ]),
      ).toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(
                `[inventory] Invalid definition for directive "@requires": "@requires" should have locations FIELD_DEFINITION, but found (non-subset) OBJECT`,
              ),
              extensions: expect.objectContaining({
                code: "DIRECTIVE_DEFINITION_INVALID",
              }),
            }),
          ]),
        }),
      );
    });
  });
});
