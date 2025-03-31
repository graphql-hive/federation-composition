import {
  ArgumentNode,
  DefinitionNode,
  DirectiveNode,
  DocumentNode,
  EnumValueDefinitionNode,
  FieldDefinitionNode,
  InputValueDefinitionNode,
  Kind,
  NamedTypeNode,
  NameNode,
  OperationDefinitionNode,
  parse,
  SelectionNode,
  stripIgnoredCharacters,
  ValueNode,
  VariableDefinitionNode,
  visit,
} from "graphql";
import sortBy from "lodash.sortby";
import { print } from "./printer.js";

// Used to normalize the AST of Supergraph SDLs so that they can be compared without worrying about ordering
export function sortSDL(doc: DocumentNode) {
  try {
    return visit(doc, {
      Document(node) {
        return {
          ...node,
          definitions: sortNodes(node.definitions),
        };
      },
      SchemaDefinition(node) {
        return {
          ...node,
          directives: sortNodes(node.directives),
        };
      },
      ScalarTypeDefinition(node) {
        return {
          ...node,
          directives: sortNodes(node.directives),
        };
      },
      ObjectTypeDefinition(node) {
        return {
          ...node,
          directives: sortNodes(node.directives),
          fields: sortNodes(node.fields),
          interfaces: sortNodes(node.interfaces),
        };
      },
      InterfaceTypeDefinition(node) {
        return {
          ...node,
          directives: sortNodes(node.directives),
          fields: sortNodes(node.fields),
        };
      },
      InputObjectTypeDefinition(node) {
        return {
          ...node,
          directives: sortNodes(node.directives),
          fields: sortNodes(node.fields),
        };
      },
      EnumTypeDefinition(node) {
        return {
          ...node,
          directives: sortNodes(node.directives),
          values: sortNodes(node.values),
        };
      },
      EnumValueDefinition(node) {
        return {
          ...node,
          directives: sortNodes(node.directives),
        };
      },
      UnionTypeDefinition(node) {
        return {
          ...node,
          types: sortNodes(node.types),
          directives: sortNodes(node.directives),
        };
      },
      FieldDefinition(node) {
        return {
          ...node,
          directives: sortNodes(node.directives),
          // arguments: sortNodes(node.arguments),
        };
      },
      DirectiveDefinition(node) {
        return {
          ...node,
          locations: sortNodes(node.locations),
        };
      },
      Directive(node) {
        for (const arg of node.arguments ?? []) {
          if (
            ["requires", "provides"].includes(arg.name.value) &&
            arg.value.kind === Kind.STRING
          ) {
            const parsedFields = parseFields(arg.value.value);

            if (parsedFields) {
              const printed = stripIgnoredCharacters(print(parsedFields));

              (arg.value as any).value = printed
                .replace(/^\{/, "")
                .replace(/\}$/, "");
            }
          }
        }

        return {
          ...node,
          arguments: sortNodes(node.arguments),
        };
      },
      StringValue(node) {
        return {
          ...node,
          value: node.value.trim(),
        };
      },
    });
  } catch (error) {
    console.log("Failed to parse", doc.loc?.source.name);
    throw error;
  }
}

function parseFields(fields: string) {
  const parsed = parse(
    fields.trim().startsWith(`{`) ? `query ${fields}` : `query { ${fields} }`,
  ).definitions.find((d) => d.kind === Kind.OPERATION_DEFINITION) as
    | OperationDefinitionNode
    | undefined;

  return parsed?.selectionSet;
}

function valueNodeToString(node: ValueNode): string {
  if ("name" in node) {
    return node.name.value;
  }

  if ("value" in node) {
    return node.value.toString();
  }

  if (node.kind === Kind.LIST) {
    return node.values.map(valueNodeToString).join(",");
  }

  if (node.kind === Kind.OBJECT) {
    return "OBJECT";
  }

  return "NULL";
}

function sortNodes(nodes: readonly DefinitionNode[]): readonly DefinitionNode[];
function sortNodes(
  nodes: readonly NamedTypeNode[] | undefined,
): readonly NamedTypeNode[] | undefined;
function sortNodes(
  nodes: readonly ArgumentNode[] | undefined,
): readonly ArgumentNode[] | undefined;
function sortNodes(
  nodes: readonly EnumValueDefinitionNode[] | undefined,
): readonly EnumValueDefinitionNode[] | undefined;
function sortNodes(
  nodes: readonly DirectiveNode[] | undefined,
): readonly DirectiveNode[] | undefined;
function sortNodes(
  nodes: readonly NameNode[] | undefined,
): readonly NameNode[] | undefined;
function sortNodes(
  nodes: readonly FieldDefinitionNode[] | undefined,
): readonly FieldDefinitionNode[] | undefined;
function sortNodes(
  nodes: readonly InputValueDefinitionNode[] | undefined,
): readonly InputValueDefinitionNode[] | undefined;
function sortNodes(
  nodes: readonly any[] | undefined,
): readonly any[] | undefined {
  if (nodes) {
    if (nodes.length === 0) {
      return [];
    }

    if (isOfKindList<NamedTypeNode>(nodes, Kind.NAMED_TYPE)) {
      return sortBy(nodes, "name.value");
    }

    if (isOfKindList<DirectiveNode>(nodes, Kind.DIRECTIVE)) {
      return sortBy(nodes, (n) => {
        const args =
          n.arguments
            ?.map((a) => a.name.value + valueNodeToString(a.value))
            .sort()
            .join(";") ?? "";
        return n.name.value + args;
      });
    }

    if (isOfKindList<VariableDefinitionNode>(nodes, Kind.VARIABLE_DEFINITION)) {
      return sortBy(nodes, "variable.name.value");
    }

    if (isOfKindList<ArgumentNode>(nodes, Kind.ARGUMENT)) {
      return sortBy(nodes, "name.value");
    }

    if (
      isOfKindList<EnumValueDefinitionNode>(nodes, Kind.ENUM_VALUE_DEFINITION)
    ) {
      return sortBy(nodes, "name.value");
    }

    if (
      isOfKindList<InputValueDefinitionNode>(nodes, Kind.INPUT_VALUE_DEFINITION)
    ) {
      return sortBy(nodes, "name.value");
    }

    if (
      isOfKindList<SelectionNode>(nodes, [
        Kind.FIELD,
        Kind.FRAGMENT_SPREAD,
        Kind.INLINE_FRAGMENT,
      ])
    ) {
      return sortBy(nodes, "kind", "name.value");
    }

    if (isOfKindList<NameNode>(nodes, Kind.NAME)) {
      return sortBy(nodes, "value");
    }

    return sortBy(nodes, "kind", "name.value");
  }

  return;
}

function isOfKindList<T>(
  nodes: readonly any[],
  kind: string | string[],
): nodes is T[] {
  return typeof kind === "string"
    ? nodes[0].kind === kind
    : kind.includes(nodes[0].kind);
}
