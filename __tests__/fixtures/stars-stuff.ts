import { graphql } from "../shared/utils.js";

export const createStarsStuff = () => ({
  inventory: {
    name: "inventory",
    typeDefs: graphql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.1"
          import: ["@key", "@shareable", "@external", "@requires"]
        )

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
  reviews: {
    name: "reviews",
    typeDefs: graphql`
      schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: ["@key", "@override", "@shareable"]
        ) {
        query: Query
      }

      type Product implements ProductItf @key(fields: "id") {
        id: ID!
        reviewsCount: Int!
        reviewsScore: Float! @shareable @override(from: "products")
        reviews: [Review!]!
      }

      interface ProductItf {
        id: ID!
        reviewsCount: Int!
        reviewsScore: Float!
        reviews: [Review!]!
      }

      type Query {
        review(id: Int!): Review
      }

      type Review {
        id: Int!
        body: String!
      }
    `,
  },
  pandas: {
    name: "pandas",
    typeDefs: graphql`
      directive @tag(name: String!) repeatable on FIELD_DEFINITION

      type Query {
        allPandas: [Panda]
        panda(name: ID!): Panda
      }

      type Panda {
        name: ID!
        favoriteFood: String @tag(name: "nom-nom-nom")
      }
    `,
  },
  products: {
    name: "products",
    typeDefs: graphql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.1"
          import: [
            "@key"
            "@shareable"
            "@tag"
            "@inaccessible"
            "@composeDirective"
          ]
        )
        @link(
          url: "https://myspecs.dev/myDirective/v1.0"
          import: ["@myDirective", { name: "@anotherDirective", as: "@hello" }]
        )
        @composeDirective(name: "@myDirective")
        @composeDirective(name: "@hello")

      directive @myDirective(a: String!) on FIELD_DEFINITION
      directive @hello on FIELD_DEFINITION

      type Query {
        allProducts: [ProductItf]
        product(id: ID!): ProductItf
      }

      interface ProductItf implements SkuItf {
        id: ID!
        sku: String
        name: String
        package: String
        variation: ProductVariation
        dimensions: ProductDimension
        createdBy: User
        hidden: String @inaccessible
        oldField: String @deprecated(reason: "refactored out")
      }

      interface SkuItf {
        sku: String
      }

      type Product implements ProductItf & SkuItf
        @key(fields: "id")
        @key(fields: "sku package")
        @key(fields: "sku variation { id }") {
        id: ID! @tag(name: "hi-from-products")
        sku: String
        name: String @hello
        package: String
        variation: ProductVariation
        dimensions: ProductDimension
        createdBy: User
        hidden: String
        reviewsScore: Float!
        oldField: String
      }
      enum ShippingClass {
        STANDARD
        EXPRESS
      }
      type ProductVariation {
        id: ID!
        name: String
      }
      type ProductDimension @shareable {
        size: String
        weight: Float
      }
      type User @key(fields: "email") {
        email: ID!
        totalProductsCreated: Int @shareable
      }
    `,
  },
  users: {
    name: "users",
    typeDefs: graphql`
      directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT

      type User @key(fields: "email") {
        email: ID! @tag(name: "test-from-users")
        name: String
        totalProductsCreated: Int
      }
    `,
  },
});
