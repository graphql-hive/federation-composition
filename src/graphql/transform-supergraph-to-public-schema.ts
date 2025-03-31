import {
  Kind,
  specifiedDirectives as specifiedDirectivesArray,
  visit,
  type ConstDirectiveNode,
  type DirectiveDefinitionNode,
  type DirectiveNode,
  type DocumentNode,
  type SchemaDefinitionNode,
} from "graphql";
import { extractLinkImplementations } from "../utils/link/index.js";
import {
  extraFederationDirectiveNames,
  extraFederationTypeNames,
  getSupergraphSpecNodes,
} from "./supergraph-spec.js";

const specifiedDirectives = new Set(
  specifiedDirectivesArray.map((d) => d.name),
);

function getAdditionalDirectivesToStrip(documentNode: DocumentNode) {
  const schemaDefinitionNode = documentNode.definitions.find(
    (node): node is SchemaDefinitionNode =>
      node.kind === Kind.SCHEMA_DEFINITION,
  );
  if (!schemaDefinitionNode?.directives?.length) {
    return null;
  }

  const additionalDirectivesToStrip = new Set<string>();
  for (const directive of schemaDefinitionNode.directives) {
    if (directive.name.value !== "link") {
      continue;
    }
    const asArg = directive.arguments?.find((arg) => arg.name.value === "as");

    if (asArg?.value.kind === Kind.STRING) {
      additionalDirectivesToStrip.add(asArg.value.value);
    }
  }

  return additionalDirectivesToStrip;
}

const federationInaccessibleDirectiveUrlPrefix =
  "https://specs.apollo.dev/inaccessible";

function getInaccessibleDirectiveName(documentNode: DocumentNode) {
  const schemaDefinitionNode = documentNode.definitions.find(
    (node): node is SchemaDefinitionNode =>
      node.kind === Kind.SCHEMA_DEFINITION,
  );
  if (schemaDefinitionNode?.directives?.length) {
    for (const directive of schemaDefinitionNode.directives) {
      if (directive.name.value !== "link") {
        continue;
      }
      const urlArg = directive.arguments?.find(
        (arg) => arg.name.value === "url",
      );
      const asArg = directive.arguments?.find((arg) => arg.name.value === "as");

      if (
        urlArg?.value.kind === Kind.STRING &&
        urlArg.value.value.startsWith(federationInaccessibleDirectiveUrlPrefix)
      ) {
        if (asArg?.value.kind === Kind.STRING) {
          return asArg.value.value;
        }
        break;
      }
    }
  }

  return "inaccessible";
}

/**
 * Transform a supergraph document node to the public API schema, as served by a gateway.
 */
export function transformSupergraphToPublicSchema(
  documentNode: DocumentNode,
): DocumentNode {
  const additionalFederationDirectives =
    getAdditionalDirectivesToStrip(documentNode);
  const inaccessibleDirectiveName = getInaccessibleDirectiveName(documentNode);

  const specLinks = extractLinkImplementations(documentNode).links.filter(
    (link) => link.identity.includes("//specs.apollo.dev/"),
  );

  const specPrefixes = specLinks.map(
    (l) => l.identity.substring(l.identity.lastIndexOf("/") + 1) + "__",
  );

  const supergraphSpecNodeNames = getSupergraphSpecNodes();

  const supergraphDirectives = new Set<string>();
  const supergraphEnums = new Set<string>();
  const supergraphInputObjects = new Set<string>();
  const supergraphScalars = new Set<string>();

  for (const { kind, name } of supergraphSpecNodeNames) {
    if (kind === Kind.ENUM_TYPE_DEFINITION) {
      supergraphEnums.add(name);
    } else if (kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) {
      supergraphInputObjects.add(name);
    } else if (kind === Kind.SCALAR_TYPE_DEFINITION) {
      supergraphScalars.add(name);
    } else if (kind === Kind.DIRECTIVE_DEFINITION) {
      supergraphDirectives.add(name);
    }
  }

  const importedPieces = specLinks
    .map((l) => l.imports.map((i) => i.as ?? i.name))
    .flat();
  const definitionsToRemove = new Set(
    importedPieces.map((name) => name.replace("@", "")),
  );
  const directivesToRemove = new Set(
    importedPieces
      .filter((name) => name.startsWith("@"))
      .map((name) => name.substring(1)),
  );

  function removeFederationOrSpecifiedDirectives(
    node: DirectiveDefinitionNode | DirectiveNode,
  ): null | undefined {
    if (
      belongsToLinkedSpec(node) ||
      supergraphDirectives.has(node.name.value) ||
      extraFederationDirectiveNames.has(node.name.value) ||
      additionalFederationDirectives?.has(node.name.value) ||
      directivesToRemove.has(node.name.value) ||
      (node.kind === Kind.DIRECTIVE_DEFINITION &&
        specifiedDirectives.has(node.name.value))
    ) {
      return null;
    }
  }

  function belongsToLinkedSpec(node: {
    name: {
      value: string;
    };
  }) {
    return specPrefixes.some((prefix) => node.name.value.startsWith(prefix));
  }

  function hasInaccessibleDirective(node: {
    directives?: readonly ConstDirectiveNode[];
  }) {
    return node.directives?.some(
      (d) => d.name.value === inaccessibleDirectiveName,
    );
  }

  function removeInaccessibleNode(node: {
    directives?: readonly ConstDirectiveNode[];
    name: {
      value: string;
    };
  }) {
    if (hasInaccessibleDirective(node) || belongsToLinkedSpec(node)) {
      return null;
    }
  }

  return visit(documentNode, {
    [Kind.DIRECTIVE_DEFINITION]: removeFederationOrSpecifiedDirectives,
    [Kind.DIRECTIVE]: removeFederationOrSpecifiedDirectives,
    [Kind.SCHEMA_EXTENSION]: () => null,
    [Kind.SCHEMA_DEFINITION]: () => null,
    [Kind.SCALAR_TYPE_DEFINITION](node) {
      if (
        belongsToLinkedSpec(node) ||
        supergraphScalars.has(node.name.value) ||
        extraFederationTypeNames.has(node.name.value) ||
        definitionsToRemove.has(node.name.value) ||
        hasInaccessibleDirective(node)
      ) {
        return null;
      }
    },
    [Kind.ENUM_TYPE_DEFINITION](node) {
      if (
        belongsToLinkedSpec(node) ||
        supergraphEnums.has(node.name.value) ||
        extraFederationTypeNames.has(node.name.value) ||
        definitionsToRemove.has(node.name.value) ||
        hasInaccessibleDirective(node)
      ) {
        return null;
      }
    },
    [Kind.ENUM_VALUE_DEFINITION]: removeInaccessibleNode,
    [Kind.OBJECT_TYPE_DEFINITION]: removeInaccessibleNode,
    [Kind.FIELD_DEFINITION]: removeInaccessibleNode,
    [Kind.INTERFACE_TYPE_DEFINITION]: removeInaccessibleNode,
    [Kind.UNION_TYPE_DEFINITION]: removeInaccessibleNode,
    [Kind.INPUT_OBJECT_TYPE_DEFINITION](node) {
      if (
        belongsToLinkedSpec(node) ||
        supergraphInputObjects.has(node.name.value) ||
        definitionsToRemove.has(node.name.value) ||
        hasInaccessibleDirective(node)
      ) {
        return null;
      }
    },
    [Kind.INPUT_VALUE_DEFINITION]: removeInaccessibleNode,
  });
}
