import { ArgumentNode, ASTNode, InputValueDefinitionNode } from "graphql";

function printString(string: string) {
  return JSON.stringify(string);
}

function printBlockString(string: string) {
  return '"""\n' + string.replace(/"""/g, '\\"""') + '\n"""';
}

const nodes: {
  [NodeT in ASTNode as NodeT["kind"]]: (node: NodeT) => string;
} = {
  Document(node) {
    return node.definitions?.length > 0
      ? node.definitions.map(print).join("\n\n")
      : "";
  },
  // ...
  OperationDefinition(node) {
    if (
      node.operation === "query" &&
      !node.name &&
      !node.variableDefinitions?.length &&
      !node.directives?.length
    ) {
      return print(node.selectionSet);
    }

    return (
      join(
        [
          node.operation,
          print(node.name) +
            wrap("(", join(node.variableDefinitions?.map(print), ", "), ")"),
          join(node.directives?.map(print), " "),
        ],
        " ",
      ) + print(node.selectionSet)
    );
  },
  VariableDefinition(node) {
    return [
      print(node.variable),
      ":",
      print(node.type),
      wrap(" = ", print(node.defaultValue)),
      join(node.directives?.map(print), " "),
    ].join(" ");
  },
  Field(node) {
    return (
      join(
        [
          (node.alias ? node.alias.value + ": " : "") +
            node.name.value +
            printArgs(node.arguments),
          join(node.directives?.map(print), " "),
        ],
        " ",
      ) + print(node.selectionSet)
    );
  },
  StringValue(node) {
    return node.block ? printBlockString(node.value) : printString(node.value);
  },
  BooleanValue(node) {
    return "" + node.value;
  },
  NullValue(_node) {
    return "null";
  },
  IntValue(node) {
    return node.value;
  },
  FloatValue(node) {
    return node.value;
  },
  EnumValue(node) {
    return node.value;
  },
  Name(node) {
    return node.value;
  },
  Variable(node) {
    return "$" + node.name.value;
  },
  ListValue(node) {
    return "[" + node.values.map(print).join(", ") + "]";
  },
  ObjectValue(node) {
    return "{" + node.fields.map(print).join(", ") + "}";
  },
  ObjectField(node) {
    return node.name.value + ": " + print(node.value);
  },
  SelectionSet(node) {
    return block(node.selections.map(print));
  },
  Argument(node) {
    return node.name.value + ": " + print(node.value);
  },
  FragmentSpread(node) {
    return join(
      ["...", print(node.name), join(node.directives?.map(print), " ")],
      " ",
    );
  },
  InlineFragment(node) {
    return join(
      [
        "...",
        node.typeCondition ? "on " + node.typeCondition.name.value : "",
        join(node.directives?.map(print), " "),
        print(node.selectionSet),
      ],
      " ",
    );
  },
  FragmentDefinition(node) {
    return join([
      "fragment",
      print(node.name),
      "on",
      node.typeCondition.name.value,
      join(node.directives?.map(print), " "),
      print(node.selectionSet),
    ]);
  },
  Directive(node) {
    return "@" + node.name.value + printArgs(node.arguments);
  },
  NamedType(node) {
    return node.name.value;
  },
  ListType(node) {
    return "[" + print(node.type) + "]";
  },
  NonNullType(node) {
    return print(node.type) + "!";
  },
  // Type system definitions
  SchemaDefinition(node) {
    return join(
      [
        "schema",
        join(node.directives?.map(print), " "),
        block(node.operationTypes?.map(print)),
      ],
      " ",
    );
  },
  OperationTypeDefinition(node) {
    return node.operation + ": " + print(node.type);
  },
  ScalarTypeDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      join(
        ["scalar", print(node.name), join(node.directives?.map(print), " ")],
        " ",
      )
    );
  },
  ObjectTypeDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      join(
        [
          "type",
          print(node.name),
          wrap("implements ", join(node.interfaces?.map(print), " & ")),
          join(node.directives?.map(print), " "),
          block(node.fields?.map(print)),
        ],
        " ",
      )
    );
  },
  InterfaceTypeDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      join(
        [
          "interface",
          print(node.name),
          wrap("implements ", join(node.interfaces?.map(print), " & ")),
          join(node.directives?.map(print), " "),
          block(node.fields?.map(print)),
        ],
        " ",
      )
    );
  },
  InputObjectTypeDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      join(
        [
          "input",
          print(node.name),
          join(node.directives?.map(print), " "),
          block(node.fields?.map(print)),
        ],
        " ",
      )
    );
  },
  UnionTypeDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      join(
        [
          "union",
          print(node.name),
          join(node.directives?.map(print), " "),
          wrap("= ", join(node.types?.map(print), " | ")),
        ],
        " ",
      )
    );
  },
  EnumTypeDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      join(
        [
          "enum",
          print(node.name),
          join(node.directives?.map(print), " "),
          block(node.values?.map(print)),
        ],
        " ",
      )
    );
  },
  EnumValueDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      join([print(node.name), join(node.directives?.map(print), " ")], " ")
    );
  },
  FieldDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      print(node.name) +
      printArgs(node.arguments) +
      ": " +
      print(node.type) +
      wrap(" ", join(node.directives?.map(print), " "))
    );
  },
  InputValueDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      join(
        [
          print(node.name) + ": " + print(node.type),
          wrap("= ", print(node.defaultValue)),
          join(node.directives?.map(print), " "),
        ],
        " ",
      )
    );
  },
  DirectiveDefinition(node) {
    return (
      wrap("", print(node.description), "\n") +
      "directive @" +
      print(node.name) +
      printArgs(node.arguments) +
      (node.repeatable ? " repeatable" : "") +
      " on " +
      join(node.locations?.map(print), " | ")
    );
  },
  // Type system extensions (Supergraph does not need that)
  SchemaExtension() {
    return "";
  },
  ScalarTypeExtension() {
    return "";
  },
  ObjectTypeExtension() {
    return "";
  },
  InterfaceTypeExtension() {
    return "";
  },
  UnionTypeExtension() {
    return "";
  },
  EnumTypeExtension() {
    return "";
  },
  InputObjectTypeExtension() {
    return "";
  },
};

export function print(node?: ASTNode): string {
  if (!node) {
    return "";
  }
  return nodes[node.kind] ? (nodes as any)[node.kind](node) : "";
}

function printArgs(
  nodes:
    | readonly ArgumentNode[]
    | readonly InputValueDefinitionNode[]
    | undefined,
) {
  if (!nodes || nodes.length === 0) {
    return "";
  }

  const args = nodes.map(print);
  const argsLine = "(" + args.join(", ") + ") ";
  return argsLine.length > 80
    ? "(\n  " + args.join("\n").replace(/\n/g, "\n  ") + "\n)"
    : argsLine;
}

function block(array: ReadonlyArray<string | undefined> | undefined): string {
  return wrap("{\n", indent(join(array, "\n")), "\n}");
}

function indent(str: string): string {
  return wrap("  ", str.replaceAll("\n", "\n  "));
}

function wrap(
  start: string,
  maybeString: string | undefined,
  end: string = "",
): string {
  return maybeString != null && maybeString !== ""
    ? start + maybeString + end
    : "";
}

function join(
  maybeArray: ReadonlyArray<string | undefined> | undefined,
  separator = "",
): string {
  return maybeArray?.filter((x) => x).join(separator) ?? "";
}
