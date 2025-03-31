import {
  concatAST,
  ConstDirectiveNode,
  DefinitionNode,
  DocumentNode,
  FieldDefinitionNode,
  GraphQLError,
  Kind,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  OperationTypeNode,
  parse,
  SchemaDefinitionNode,
  SchemaExtensionNode,
  visit,
  visitInParallel,
} from "graphql";
import {
  TypeNodeInfo,
  visitWithTypeNodeInfo,
} from "../../graphql/type-node-info.js";
import {
  createSpecSchema,
  FederationVersion,
} from "../../specifications/federation.js";
import {
  Link,
  LinkImport,
  parseLinkDirective,
} from "../../specifications/link.js";
import { SubgraphStateBuilder } from "../state.js";
import { AuthenticatedRule } from "./rules/elements/authenticated.js";
import { ComposeDirectiveRules } from "./rules/elements/compose-directive.js";
import { ContextDirectiveRules } from "./rules/elements/context.js";
import { CostRule } from "./rules/elements/cost.js";
import { ExtendsRules } from "./rules/elements/extends.js";
import { ExternalRules } from "./rules/elements/external.js";
import { FieldSetRules } from "./rules/elements/field-set.js";
import { FromContextDirectiveRules } from "./rules/elements/from-context.js";
import { InaccessibleRules } from "./rules/elements/inaccessible.js";
import { InterfaceObjectRules } from "./rules/elements/interface-object.js";
import { KeyRules } from "./rules/elements/key.js";
import { ListSizeRule } from "./rules/elements/list-size.js";
import { OverrideRules } from "./rules/elements/override.js";
import { PolicyRule } from "./rules/elements/policy.js";
import { ProvidesRules } from "./rules/elements/provides.js";
import { RequiresScopesRule } from "./rules/elements/requires-scopes.js";
import { RequiresRules } from "./rules/elements/requires.js";
import { ShareableRules } from "./rules/elements/shareable.js";
import { TagRules } from "./rules/elements/tag.js";
import { KnownArgumentNamesOnDirectivesRule } from "./rules/known-argument-names-on-directives-rule.js";
import { KnownDirectivesRule } from "./rules/known-directives-rule.js";
import { KnownFederationDirectivesRule } from "./rules/known-federation-directive-rule.js";
import { KnownRootTypeRule } from "./rules/known-root-type-rule.js";
import { KnownTypeNamesRule } from "./rules/known-type-names-rule.js";
import { LoneSchemaDefinitionRule } from "./rules/lone-schema-definition-rule.js";
import { OnlyInterfaceImplementationRule } from "./rules/only-interface-implementation-rule.js";
import { ProvidedArgumentsOnDirectivesRule } from "./rules/provided-arguments-on-directives-rule.js";
import { ProvidedRequiredArgumentsOnDirectivesRule } from "./rules/provided-required-arguments-on-directives-rule.js";
import { QueryRootTypeInaccessibleRule } from "./rules/query-root-type-inaccessible-rule.js";
import { ReservedSubgraphNameRule } from "./rules/reserved-subgraph-name-rule.js";
import { RootTypeUsedRule } from "./rules/root-type-used-rule.js";
import { UniqueArgumentDefinitionNamesRule } from "./rules/unique-argument-definition-names-rule.js";
import { UniqueArgumentNamesRule } from "./rules/unique-argument-names-rule.js";
import { UniqueDirectiveNamesRule } from "./rules/unique-directive-names-rule.js";
import { UniqueDirectivesPerLocationRule } from "./rules/unique-directives-per-location-rule.js";
import { UniqueEnumValueNamesRule } from "./rules/unique-enum-value-names-rule.js";
import { UniqueFieldDefinitionNamesRule } from "./rules/unique-field-definition-names-rule.js";
import { UniqueInputFieldNamesRule } from "./rules/unique-input-field-names-rule.js";
import { UniqueOperationTypesRule } from "./rules/unique-operation-types-rule.js";
import { UniqueTypeNamesRule } from "./rules/unique-type-names-rule.js";
import { validateSubgraphState } from "./validate-state.js";
import {
  createSimpleValidationContext,
  createSubgraphValidationContext,
} from "./validation-context.js";

export function assertUniqueSubgraphNames(
  subgraphs: ReadonlyArray<{ name: string }>,
): asserts subgraphs is Array<{ name: string }> {
  const names = new Set<string>();

  for (const subgraph of subgraphs) {
    if (names.has(subgraph.name)) {
      throw new Error(`A subgraph named ${subgraph.name} already exists`);
    }
    names.add(subgraph.name);
  }
}

export function validateSubgraphCore(subgraph: {
  name: string;
  typeDefs: DocumentNode;
}) {
  const extractedLinks = extractLinks(subgraph);

  if (extractedLinks.errors) {
    extractedLinks.errors.forEach((error) =>
      enrichErrorWithSubgraphName(error, subgraph.name),
    );
  }

  return extractedLinks;
}

export function validateSubgraph(
  subgraph: { name: string; typeDefs: DocumentNode; id: string },
  stateBuilder: SubgraphStateBuilder,
  federation: {
    version: FederationVersion;
    imports: readonly LinkImport[];
  },
  __internal?: {
    disableValidationRules?: string[];
  },
) {
  subgraph.typeDefs = cleanSubgraphTypeDefsFromSubgraphSpec(subgraph.typeDefs);

  const linkSpecDefinitions = parse(/* GraphQL */ `
    enum Purpose {
      EXECUTION
      SECURITY
    }

    directive @link(
      url: String
      as: String
      for: link__Purpose
      import: [link__Import]
    ) repeatable on SCHEMA

    scalar link__Import

    enum link__Purpose {
      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY

      """
      \`EXECUTION\` features provide metadata necessary for operation execution.
      """
      EXECUTION
    }
  `).definitions;

  const rulesToSkip = __internal?.disableValidationRules ?? [];
  const typeNodeInfo = new TypeNodeInfo();
  const validationContext = createSubgraphValidationContext(
    subgraph,
    federation,
    typeNodeInfo,
    stateBuilder,
  );

  const federationRules = [
    ReservedSubgraphNameRule,
    KnownFederationDirectivesRule,
    FieldSetRules,
    InaccessibleRules,
    InterfaceObjectRules,
    AuthenticatedRule,
    PolicyRule,
    RequiresScopesRule,
    CostRule,
    ListSizeRule,
    OverrideRules,
    ContextDirectiveRules,
    FromContextDirectiveRules,
    ExtendsRules,
    QueryRootTypeInaccessibleRule,
    KnownTypeNamesRule,
    KnownRootTypeRule,
    RootTypeUsedRule,
    ShareableRules,
    KeyRules,
    ProvidesRules,
    RequiresRules,
    ExternalRules,
    TagRules,
    ComposeDirectiveRules,
  ];
  const graphqlRules = [
    OnlyInterfaceImplementationRule,
    LoneSchemaDefinitionRule,
    UniqueOperationTypesRule,
    UniqueTypeNamesRule,
    UniqueEnumValueNamesRule,
    UniqueFieldDefinitionNamesRule,
    UniqueArgumentDefinitionNamesRule,
    KnownDirectivesRule,
    UniqueDirectivesPerLocationRule,
    KnownArgumentNamesOnDirectivesRule,
    UniqueArgumentNamesRule,
    UniqueInputFieldNamesRule,
    UniqueDirectiveNamesRule,
    ProvidedRequiredArgumentsOnDirectivesRule,
    ProvidedArgumentsOnDirectivesRule,
  ];
  visit(
    subgraph.typeDefs,
    visitWithTypeNodeInfo(
      typeNodeInfo,
      visitInParallel(
        [stateBuilder.visitor(typeNodeInfo)].concat(
          federationRules.map((rule) => {
            if (rulesToSkip.includes(rule.name)) {
              return {};
            }
            return rule(validationContext);
          }),
        ),
      ),
    ),
  );

  const federationDefinitionReplacements =
    validationContext.collectFederationDefinitionReplacements();

  // Include only link spec definitions that are not already defined in the subgraph
  const linkSpecDefinitionsToInclude = linkSpecDefinitions.filter((def) => {
    if ("name" in def && typeof def.name?.value === "string") {
      return !stateBuilder.state.types.has(def.name.value);
    }

    return true;
  });
  const fullTypeDefs = concatAST(
    [
      {
        kind: Kind.DOCUMENT,
        definitions: validationContext
          .getAvailableFederationTypeAndDirectiveDefinitions()
          .filter(
            (def) => !federationDefinitionReplacements.has(def.name.value),
          ),
      } as DocumentNode,
      validationContext.satisfiesVersionRange("> v1.0") &&
      !stateBuilder.state.specs.link
        ? // TODO: If Link v1.0 spec is detected in the subgraph (`schema @link(url: ".../link/v1.0")`)
          // We should validate its directives and types
          // just like we do with Federation directives and types.
          linkSpecDefinitionsToInclude.length > 0
          ? ({
              kind: Kind.DOCUMENT,
              definitions: linkSpecDefinitionsToInclude,
            } as DocumentNode)
          : null
        : null,
      subgraph.typeDefs,
    ].filter(onlyDocumentNode),
  );

  // validate built subgraph state
  const subgraphStateErrors = validateSubgraphState(
    stateBuilder.state,
    validationContext,
  );

  const simpleValidationContext = createSimpleValidationContext(
    fullTypeDefs,
    typeNodeInfo,
  );

  visit(
    fullTypeDefs,
    visitInParallel(
      graphqlRules.map((rule) => {
        if (rulesToSkip.includes(rule.name)) {
          return {};
        }
        return rule(simpleValidationContext);
      }),
    ),
  );

  for (const {
    typeName,
    fieldName,
  } of validationContext.getFieldsToMarkAsShareable()) {
    if (validationContext.stateBuilder.isInterfaceObject(typeName)) {
      continue;
    }

    validationContext.stateBuilder.objectType.field.setShareable(
      typeName,
      fieldName,
    );
  }

  return validationContext
    .collectReportedErrors()
    .concat(
      validationContext.collectUnusedExternal().map((coordinate) =>
        enrichErrorWithSubgraphName(
          new GraphQLError(
            `Field "${coordinate}" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).`,
            {
              extensions: {
                code: "EXTERNAL_UNUSED",
              },
            },
          ),
          subgraph.name,
        ),
      ),
    )
    .concat(simpleValidationContext.collectReportedErrors())
    .concat(subgraphStateErrors)
    .map((error) => enrichErrorWithSubgraphName(error, subgraph.name));
}

function enrichErrorWithSubgraphName(
  error: GraphQLError,
  subgraphName: string,
) {
  // Not if it's already enriched
  if (error.extensions.subgraphName) {
    return error;
  }

  error.message = `[${subgraphName}] ${error.message}`;
  error.extensions.subgraphName = subgraphName;
  return error;
}

// Move somewhere else

const availableFeatures: Record<string, string[]> = {
  link: ["v1.0"],
  tag: ["v0.1", "v0.2"],
  kotlin_labs: ["v0.1", "v0.2"],
  join: ["v0.1", "v0.2", "v0.3", "v0.4", "v0.5"],
  inaccessible: ["v0.1", "v0.2"],
  core: ["v0.1", "v0.2"],
};

function extractLinks(subgraph: { name: string; typeDefs: DocumentNode }) {
  const schemaNodes = subgraph.typeDefs.definitions.filter(
    isSchemaDefinitionOrExtensionNode,
  );

  if (schemaNodes.length === 0) {
    return {
      links: [],
    };
  }

  const linkDirectives: ConstDirectiveNode[] = [];

  for (const schemaNode of schemaNodes) {
    if (schemaNode.directives?.length) {
      for (const directiveNode of schemaNode.directives) {
        if (directiveNode.name.value === "link") {
          linkDirectives.push(directiveNode);
        }
      }
    }
  }

  if (!linkDirectives) {
    return {
      links: [],
    };
  }

  const errors: GraphQLError[] = [];
  const links: Link[] = [];
  const identities = new Set();
  const reportedAsDuplicate = new Set();

  for (let i = 0; i < linkDirectives.length; i++) {
    const linkDirective = linkDirectives[i];

    try {
      const link = parseLinkDirective(linkDirective);

      if (!link) {
        continue;
      }

      if (
        identities.has(link.identity) &&
        !reportedAsDuplicate.has(link.identity)
      ) {
        errors.push(
          new GraphQLError(`Duplicate inclusion of feature ${link.identity}`, {
            extensions: {
              code: "INVALID_LINK_DIRECTIVE_USAGE",
            },
          }),
        );
        reportedAsDuplicate.add(link.identity);
      }

      identities.add(link.identity);

      if (link.version && !/^v\d+\.\d+/.test(link.version)) {
        errors.push(
          new GraphQLError(
            `Expected a version string (of the form v1.2), got ${link.version}`,
            {
              extensions: {
                code: "INVALID_LINK_IDENTIFIER",
              },
            },
          ),
        );
        continue;
      }

      if (!link.name) {
        errors.push(
          new GraphQLError(`Missing path in feature url '${link.identity}'`, {
            extensions: {
              code: "INVALID_LINK_IDENTIFIER",
            },
          }),
        );
        continue;
      }

      if (link.identity.startsWith("https://specs.apollo.dev/")) {
        if (link.name === "federation") {
          if (!link.version) {
            errors.push(
              new GraphQLError(
                `Missing version in feature url '${link.identity}'`,
                {
                  extensions: {
                    code: "TODO",
                  },
                },
              ),
            );
            continue;
          }

          const spec = createSpecSchema(link.version as any);
          const availableElements = new Set(
            spec.directives
              .map((d) => d.name.value)
              .concat(spec.types.map((t) => t.name.value)),
          );

          // ensure correct imports
          let pushedError = false;
          for (const im of link.imports) {
            if (!availableElements.has(im.name.replace(/^@/, ""))) {
              pushedError = true;
              errors.push(
                new GraphQLError(
                  `Cannot import unknown element "${im.name}".`,
                  {
                    extensions: {
                      code: "INVALID_LINK_DIRECTIVE_USAGE",
                    },
                  },
                ),
              );
            }
          }

          if (pushedError) {
            continue;
          }
        } else if (link.version && availableFeatures[link.name]) {
          if (!availableFeatures[link.name].includes(link.version)) {
            errors.push(
              new GraphQLError(
                `Schema uses unknown version ${link.version} of the ${link.name} spec`,
                {
                  extensions: {
                    code: "UNKNOWN_LINK_VERSION",
                  },
                },
              ),
            );
            continue;
          }
        }
      }

      links.push(link);
    } catch (error) {
      errors.push(
        error instanceof GraphQLError ? error : new GraphQLError(String(error)),
      );
    }
  }

  if (errors.length > 0) {
    return {
      errors,
    };
  }

  return {
    links,
  };
}

function isSchemaDefinitionOrExtensionNode(
  node: unknown,
): node is SchemaDefinitionNode | SchemaExtensionNode {
  return (
    (node as any).kind === Kind.SCHEMA_DEFINITION ||
    (node as any).kind === Kind.SCHEMA_EXTENSION
  );
}

function onlyDocumentNode(
  item: DocumentNode | null | undefined,
): item is DocumentNode {
  return item != null;
}

/**
 * Removes all types that are specific to the subgraph spec.
 * I'm not sure why there are types like _Any and _Service in the first place,
 * but they should be ignored.
 *
 * ```graphql
 * type Query {
 *  _service: _Service!
 *  _entities(representations: [_Any!]!): [_Entity]!
 * }
 * scalar _Any
 * union _Entity = ...
 * type _Service {
 *  sdl: String
 * }
 * ```
 */
function cleanSubgraphTypeDefsFromSubgraphSpec(typeDefs: DocumentNode) {
  let queryTypes: Array<ObjectTypeDefinitionNode | ObjectTypeExtensionNode> =
    [];

  const schemaDef = typeDefs.definitions.find(
    (node) =>
      (node.kind === Kind.SCHEMA_DEFINITION ||
        node.kind === Kind.SCHEMA_EXTENSION) &&
      node.operationTypes?.some(
        (op) => op.operation === OperationTypeNode.QUERY,
      ),
  ) as SchemaDefinitionNode | SchemaExtensionNode | undefined;

  const queryTypeName =
    schemaDef?.operationTypes?.find(
      (op) => op.operation === OperationTypeNode.QUERY,
    )?.type.name.value ?? "Query";

  (typeDefs.definitions as unknown as DefinitionNode[]) =
    typeDefs.definitions.filter((def) => {
      if (
        (def.kind === Kind.SCALAR_TYPE_DEFINITION ||
          def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) &&
        def.name.value === "_Any"
      ) {
        return false;
      }

      if (
        def.kind === Kind.UNION_TYPE_DEFINITION &&
        def.name.value === "_Entity"
      ) {
        return false;
      }

      if (
        def.kind === Kind.OBJECT_TYPE_DEFINITION &&
        def.name.value === "_Service"
      ) {
        return false;
      }

      if (
        (def.kind === Kind.OBJECT_TYPE_DEFINITION ||
          def.kind === Kind.OBJECT_TYPE_EXTENSION) &&
        def.name.value === queryTypeName
      ) {
        queryTypes.push(def);
      }

      return true;
    });

  if (queryTypes.length > 0) {
    for (const queryType of queryTypes) {
      (queryType.fields as unknown as FieldDefinitionNode[]) =
        queryType.fields?.filter((field) => {
          if (
            field.name.value === "_service" ||
            field.name.value === "_entities"
          ) {
            return false;
          }

          return true;
        }) ?? [];
    }
  }

  return typeDefs;
}
