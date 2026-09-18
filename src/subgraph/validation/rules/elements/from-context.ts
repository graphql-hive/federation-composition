import {
  ASTVisitor,
  ConstDirectiveNode,
  FieldDefinitionNode,
  GraphQLError,
  InputValueDefinitionNode,
  Kind,
  SelectionSetNode,
  TypeNode,
} from "graphql";
import { parseContextReference } from "../../../context.js";
import {
  namedTypeFromTypeNode,
  parseFields,
  printOutputType,
  validateDirectiveAgainstOriginal,
} from "../../../helpers.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

type ContextOwnerName = string;

const typenameType: TypeNode = {
  kind: Kind.NON_NULL_TYPE,
  type: {
    kind: Kind.NAMED_TYPE,
    name: { kind: Kind.NAME, value: "String" },
  },
};

type SelectableType =
  | {
      kind: "OBJECT" | "INTERFACE";
      name: string;
      fields: Map<string, FieldDefinitionNode>;
      interfaces: string[];
      directives: readonly ConstDirectiveNode[];
    }
  | {
      kind: "UNION";
      name: string;
      members: string[];
      directives: readonly ConstDirectiveNode[];
    };

/** A field path or a type-conditioned alternative, without GraphQL syntax. */
type ContextValue =
  | { field: string; next?: ContextValue[] }
  | { onType: string | null; next: ContextValue[] };

type ContextSelection =
  | { kind: "direct"; values: ContextValue[] }
  | { kind: "conditional"; branches: Map<string, ContextValue[]> }
  | { kind: "invalid"; reason: string };

type SelectionTypeResult =
  | { kind: "resolved"; type: TypeNode }
  | { kind: "unresolved" }
  | { kind: "unknownField"; owner: string; field: string }
  | { kind: "interfaceObject"; typeName: string };

export function FromContextDirectiveRules(
  context: SubgraphValidationContext,
): ASTVisitor {
  const contextOwnersByName = indexContextOwners(context);

  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "fromContext", context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective("fromContext", node)) {
        return;
      }

      context.stateBuilder.markSpecAsUsed("context");

      const typeDef = context.typeNodeInfo.getTypeDef();
      const fieldDef = context.typeNodeInfo.getFieldDef();
      const argDef = context.typeNodeInfo.getArgumentDef();
      const argumentNode: InputValueDefinitionNode | undefined =
        typeDef?.kind === Kind.DIRECTIVE_DEFINITION
          ? fieldDef?.kind === Kind.INPUT_VALUE_DEFINITION
            ? fieldDef
            : undefined
          : (argDef ?? undefined);

      if (!typeDef || !fieldDef || !argumentNode) {
        return;
      }

      if (typeDef.kind === Kind.DIRECTIVE_DEFINITION) {
        context.reportError(
          new GraphQLError(
            `@fromContext argument cannot be used on a directive definition "@${typeDef.name.value}(${argumentNode.name.value}:)".`,
            {
              extensions: { code: "CONTEXT_NOT_SET" },
            },
          ),
        );
        return;
      }

      if (
        typeDef.kind !== Kind.OBJECT_TYPE_DEFINITION &&
        typeDef.kind !== Kind.OBJECT_TYPE_EXTENSION
      ) {
        context.reportError(
          new GraphQLError(
            `@fromContext argument cannot be used on a field that exists on an abstract type "${argCoordinate(context)}".`,
            {
              extensions: { code: "CONTEXT_NOT_SET" },
            },
          ),
        );
        return;
      }

      const objectType = context
        .getSubgraphObjectOrInterfaceTypes()
        .get(typeDef.name.value);

      if (objectType?.interfaces?.length) {
        for (const implementedInterface of objectType.interfaces) {
          const interfaceName = implementedInterface.name.value;
          const interfaceType = context
            .getSubgraphObjectOrInterfaceTypes()
            .get(interfaceName);

          if (
            interfaceType?.kind === Kind.INTERFACE_TYPE_DEFINITION ||
            interfaceType?.kind === Kind.INTERFACE_TYPE_EXTENSION
          ) {
            const implementedField = interfaceType.fields?.find(
              (field) => field.name.value === fieldDef.name.value,
            );

            if (implementedField) {
              context.reportError(
                new GraphQLError(
                  `@fromContext argument cannot be used on a field implementing an interface field "${interfaceName}.${fieldDef.name.value}".`,
                  {
                    extensions: { code: "CONTEXT_NOT_SET" },
                  },
                ),
              );
            }
          }
        }
      }

      if (typeof argumentNode.defaultValue !== "undefined") {
        context.reportError(
          new GraphQLError(
            `@fromContext arguments may not have a default value: "${argCoordinate(context)}".`,
            {
              extensions: { code: "CONTEXT_NOT_SET" },
            },
          ),
        );
      }

      const fieldValue = node.arguments?.find(
        (arg) => arg.name.value === "field",
      )?.value;

      if (!fieldValue || fieldValue.kind !== Kind.STRING) {
        return;
      }

      const { context: contextName, selection } = parseContextReference(
        fieldValue.value,
      );

      if (!contextName || !selection) {
        context.reportError(
          new GraphQLError(
            `@fromContext argument does not reference a context "${fieldValue.value}".`,
            {
              extensions: { code: "NO_CONTEXT_IN_SELECTION" },
            },
          ),
        );
        return;
      }

      const contextOwnerNames = contextOwnersByName.get(contextName);

      if (!contextOwnerNames?.length) {
        context.reportError(
          new GraphQLError(
            `Context "${contextName}" is used at location "${argCoordinate(context)}" but is never set.`,
            {
              extensions: { code: "CONTEXT_NOT_SET" },
            },
          ),
        );
        return;
      }

      validateSelection({
        context,
        contextOwnerNames,
        contextName,
        selection,
        argDef: argumentNode,
      });

      const hasResolvableKey = (objectType?.directives ?? []).some(
        (directive) => {
          if (!context.isAvailableFederationDirective("key", directive)) {
            return false;
          }

          const resolvable = directive.arguments?.find(
            (arg) => arg.name.value === "resolvable",
          )?.value;

          return resolvable?.kind === Kind.BOOLEAN ? resolvable.value : true;
        },
      );

      if (!hasResolvableKey) {
        context.reportError(
          new GraphQLError(
            `Object "${typeDef.name.value}" has no resolvable key but has a field with a contextual argument.`,
            {
              extensions: { code: "CONTEXT_NO_RESOLVABLE_KEY" },
            },
          ),
        );
      }

      context.stateBuilder.objectType.field.arg.setFromContext(
        typeDef.name.value,
        fieldDef.name.value,
        argumentNode.name.value,
        {
          context: contextName,
          selection,
        },
      );
    },
  };
}

function indexContextOwners(context: SubgraphValidationContext) {
  const ownersByContext = new Map<string, ContextOwnerName[]>();

  for (const [
    typeName,
    typeDef,
  ] of context.getSubgraphObjectOrInterfaceTypes()) {
    for (const directive of typeDef.directives ?? []) {
      rememberContextOwner(
        ownersByContext,
        readContextDirectiveName(context, directive),
        typeName,
      );
    }
  }

  for (const definition of context.getDocument().definitions) {
    if (
      definition.kind !== Kind.UNION_TYPE_DEFINITION &&
      definition.kind !== Kind.UNION_TYPE_EXTENSION
    ) {
      continue;
    }

    for (const directive of definition.directives ?? []) {
      rememberContextOwner(
        ownersByContext,
        readContextDirectiveName(context, directive),
        definition.name.value,
      );
    }
  }

  return ownersByContext;
}

function readContextDirectiveName(
  context: SubgraphValidationContext,
  directive: ConstDirectiveNode,
) {
  if (!context.isAvailableFederationDirective("context", directive)) {
    return undefined;
  }

  const name = directive.arguments?.find(
    (arg) => arg.name.value === "name",
  )?.value;

  return name?.kind === Kind.STRING ? name.value : undefined;
}

function rememberContextOwner(
  ownersByContext: Map<string, ContextOwnerName[]>,
  contextName: string | undefined,
  ownerName: ContextOwnerName,
) {
  if (!contextName) {
    return;
  }

  const owners = ownersByContext.get(contextName);

  if (owners) {
    owners.push(ownerName);
  } else {
    ownersByContext.set(contextName, [ownerName]);
  }
}

function argCoordinate(context: SubgraphValidationContext) {
  const typeDef = context.typeNodeInfo.getTypeDef();
  const fieldDef = context.typeNodeInfo.getFieldDef();
  const argDef = context.typeNodeInfo.getArgumentDef();

  return `${typeDef?.name.value}.${fieldDef?.name.value}(${argDef?.name.value}:)`;
}

function validateSelection(input: {
  context: SubgraphValidationContext;
  contextOwnerNames: ContextOwnerName[];
  contextName: string;
  selection: string;
  argDef: InputValueDefinitionNode;
}) {
  const { context, contextName, argDef } = input;
  const typeViews = new Map<string, SelectableType | null>();
  const runtimeTypeSets = new Map<string, Set<string>>();

  function invalid(reason: string) {
    reportInvalidSelection(context, contextName, reason);
  }

  function getSelectableType(typeName: string): SelectableType | null {
    if (!typeViews.has(typeName)) {
      typeViews.set(typeName, buildSelectableType(context, typeName));
    }

    return typeViews.get(typeName) ?? null;
  }

  /**
   * This function finds the object types that the given type can be at runtime.
   */
  function runtimeSetFor(type: SelectableType): Set<string> {
    const cached = runtimeTypeSets.get(type.name);

    if (cached) {
      return cached;
    }

    let runtimeTypes: Set<string>;

    if (type.kind === "OBJECT") {
      runtimeTypes = new Set([type.name]);
    } else if (type.kind === "UNION") {
      runtimeTypes = new Set(type.members);
    } else {
      runtimeTypes = new Set(
        Array.from(context.getSubgraphObjectOrInterfaceTypes())
          .filter(
            ([_, candidate]) =>
              (candidate.kind === Kind.OBJECT_TYPE_DEFINITION ||
                candidate.kind === Kind.OBJECT_TYPE_EXTENSION) &&
              (candidate.interfaces ?? []).some(
                (item) => item.name.value === type.name,
              ),
          )
          .map(([candidateName]) => candidateName),
      );
    }

    runtimeTypeSets.set(type.name, runtimeTypes);
    return runtimeTypes;
  }

  function getFieldDefinition(
    type: Extract<SelectableType, { kind: "OBJECT" | "INTERFACE" }>,
    fieldName: string,
  ): FieldDefinitionNode | null {
    const field = type.fields.get(fieldName);

    if (field) {
      return field;
    }

    if (type.kind !== "OBJECT") {
      return null;
    }

    for (const interfaceName of type.interfaces) {
      const interfaceType = getSelectableType(interfaceName);

      if (interfaceType?.kind !== "INTERFACE") {
        continue;
      }

      const interfaceField = interfaceType.fields.get(fieldName);

      if (interfaceField) {
        return interfaceField;
      }
    }

    return null;
  }

  function resolveSelectedType(
    currentType: SelectableType,
    selections: ContextValue[],
  ): SelectionTypeResult {
    if (
      currentType.kind === "OBJECT" &&
      hasInterfaceObjectDirective(context, currentType)
    ) {
      return { kind: "interfaceObject", typeName: currentType.name };
    }

    let resolvedType: TypeNode | undefined;

    for (const selection of selections) {
      const next = resolveSelectionType(currentType, selection);

      if (next.kind !== "resolved") {
        return next;
      }

      if (!resolvedType) {
        resolvedType = next.type;
        continue;
      }

      // Compatibility in both directions requires identical list/nullability shape.
      if (
        !matchesArgType(resolvedType, next.type) ||
        !matchesArgType(next.type, resolvedType)
      ) {
        return { kind: "unresolved" };
      }
    }

    return resolvedType
      ? { kind: "resolved", type: resolvedType }
      : { kind: "unresolved" };
  }

  function resolveSelectionType(
    currentType: SelectableType,
    selection: ContextValue,
  ): SelectionTypeResult {
    if ("onType" in selection) {
      const fragmentType = selection.onType
        ? getSelectableType(selection.onType)
        : null;

      return fragmentType
        ? resolveSelectedType(fragmentType, selection.next)
        : { kind: "unresolved" };
    }

    if (selection.field === "__typename") {
      return { kind: "resolved", type: typenameType };
    }

    if (currentType.kind === "UNION") {
      return { kind: "unresolved" };
    }

    const field = getFieldDefinition(currentType, selection.field);

    if (!field) {
      return {
        kind: "unknownField",
        owner: currentType.name,
        field: selection.field,
      };
    }

    markFieldAsUsed(context, currentType, selection.field);

    if (!selection.next) {
      return { kind: "resolved", type: nullableType(field.type) };
    }

    const childType = getSelectableType(
      namedTypeFromTypeNode(field.type).name.value,
    );

    if (!childType) {
      return { kind: "unresolved" };
    }

    const nested = resolveSelectedType(childType, selection.next);

    if (nested.kind !== "resolved") {
      return nested;
    }

    return {
      kind: "resolved",
      type: wrapListModifiers(field.type, nested.type),
    };
  }

  function validateSelectedType(result: SelectionTypeResult) {
    if (result.kind === "unknownField") {
      reportUnknownField(context, contextName, result.owner, result.field);
      return false;
    }

    if (result.kind === "interfaceObject") {
      reportInterfaceObject(context, contextName, result.typeName);
      return false;
    }

    if (result.kind === "unresolved") {
      invalid(
        `the type of the selection does not match the expected type "${printOutputType(argDef.type)}"`,
      );
      return false;
    }

    if (!matchesArgType(result.type, argDef.type)) {
      invalid(
        `the type of the selection "${printOutputType(result.type)}" does not match the expected type "${printOutputType(argDef.type)}"`,
      );
      return false;
    }

    return true;
  }

  function validateConditionalSelections(
    owner: SelectableType,
    branches: Map<string, ContextValue[]>,
    touchedTypeConditions: Set<string>,
  ) {
    let sawApplicableBranch = false;
    const runtimeTypes = runtimeSetFor(owner);

    for (const [branchName, selections] of branches) {
      // If no branch applies, this function reports that no type condition
      // matches the location. If a branch applies, a later step reports each
      // unused type condition.
      if (!runtimeTypes.has(branchName)) {
        continue;
      }

      sawApplicableBranch = true;
      touchedTypeConditions.add(branchName);

      const branchType = getSelectableType(branchName);

      if (!branchType || branchType.kind !== "OBJECT") {
        invalid("type conditions must be an object type");
        return false;
      }

      if (!validateSelectedType(resolveSelectedType(branchType, selections))) {
        return false;
      }
    }

    if (!sawApplicableBranch) {
      invalid(`no type condition matches the location "${owner.name}"`);
      return false;
    }

    return true;
  }

  const layout = parseContextSelection(input.selection);

  if (layout.kind === "invalid") {
    invalid(layout.reason);
    return;
  }

  const touchedTypeConditions = new Set<string>();

  for (const ownerName of input.contextOwnerNames) {
    const owner = getSelectableType(ownerName);

    if (!owner) {
      continue;
    }

    const isValid =
      layout.kind === "direct"
        ? validateSelectedType(resolveSelectedType(owner, layout.values))
        : validateConditionalSelections(
            owner,
            layout.branches,
            touchedTypeConditions,
          );

    if (!isValid) {
      return;
    }
  }

  if (layout.kind === "conditional") {
    for (const typeCondition of layout.branches.keys()) {
      if (!touchedTypeConditions.has(typeCondition)) {
        invalid(`type condition "${typeCondition}" is never used.`);
        return;
      }
    }
  }
}

function markFieldAsUsed(
  context: SubgraphValidationContext,
  currentType: Extract<SelectableType, { kind: "OBJECT" | "INTERFACE" }>,
  fieldName: string,
) {
  context.markAsUsed(
    "fields",
    currentType.kind === "OBJECT"
      ? Kind.OBJECT_TYPE_DEFINITION
      : Kind.INTERFACE_TYPE_DEFINITION,
    currentType.name,
    fieldName,
  );
}

function reportInvalidSelection(
  context: SubgraphValidationContext,
  contextName: string,
  reason: string,
) {
  context.reportError(
    new GraphQLError(
      `Context "${contextName}" is used in "${argCoordinate(context)}" but the selection is invalid: ${reason}`,
      {
        extensions: { code: "CONTEXT_INVALID_SELECTION" },
      },
    ),
  );
}

function reportUnknownField(
  context: SubgraphValidationContext,
  contextName: string,
  owner: string,
  field: string,
) {
  context.reportError(
    new GraphQLError(
      `Context "${contextName}" is used in "${argCoordinate(context)}" but the selection is invalid for type ${owner}. Error: Cannot query field "${field}" on type "${owner}".`,
      {
        extensions: { code: "CONTEXT_INVALID_SELECTION" },
      },
    ),
  );
}

function reportInterfaceObject(
  context: SubgraphValidationContext,
  contextName: string,
  typeName: string,
) {
  context.reportError(
    new GraphQLError(
      `Context "${contextName}" is used in "${argCoordinate(context)}" but the selection is invalid: One of the types in the selection is an interfaceObject: "${typeName}"`,
      {
        extensions: { code: "CONTEXT_INVALID_SELECTION" },
      },
    ),
  );
}

function parseContextSelection(source: string): ContextSelection {
  const selectionSet = parseFields(source);
  if (!selectionSet) {
    return { kind: "invalid", reason: "no selection is made" };
  }

  const compiled = compileContextValues(selectionSet);
  if (compiled.kind === "invalid") {
    return compiled;
  }

  const [firstSelection, ...remainingSelections] = compiled.values;

  if (!firstSelection) {
    return { kind: "invalid", reason: "no selection is made" };
  }

  if ("field" in firstSelection) {
    return remainingSelections.length === 0
      ? { kind: "direct", values: compiled.values }
      : { kind: "invalid", reason: "multiple selections are made" };
  }

  const branches = new Map<string, ContextValue[]>();

  for (const selection of compiled.values) {
    if ("field" in selection) {
      return { kind: "invalid", reason: "multiple fields could be selected" };
    }

    if (!selection.onType) {
      return {
        kind: "invalid",
        reason: "inline fragments must have type conditions",
      };
    }

    branches.set(selection.onType, selection.next);
  }

  return branches.size === compiled.values.length
    ? { kind: "conditional", branches }
    : { kind: "invalid", reason: "type conditions have same name" };
}

function buildSelectableType(
  context: SubgraphValidationContext,
  typeName: string,
): SelectableType | null {
  const objectOrInterface = context
    .getSubgraphObjectOrInterfaceTypes()
    .get(typeName);

  if (objectOrInterface) {
    return {
      kind:
        objectOrInterface.kind === Kind.INTERFACE_TYPE_DEFINITION ||
        objectOrInterface.kind === Kind.INTERFACE_TYPE_EXTENSION
          ? "INTERFACE"
          : "OBJECT",
      name: typeName,
      fields: new Map(
        (objectOrInterface.fields ?? []).map((field) => [
          field.name.value,
          field,
        ]),
      ),
      interfaces: (objectOrInterface.interfaces ?? []).map(
        (item) => item.name.value,
      ),
      directives: objectOrInterface.directives ?? [],
    };
  }

  const unionMembers = context.getSubgraphUnionTypes().get(typeName);

  if (unionMembers) {
    const unionState = context.stateBuilder.state.types.get(typeName);
    return {
      kind: "UNION",
      name: typeName,
      members: Array.from(unionMembers),
      directives:
        unionState?.kind === "UNION"
          ? (unionState.ast.directives as ConstDirectiveNode[])
          : [],
    };
  }

  return null;
}

function hasInterfaceObjectDirective(
  context: SubgraphValidationContext,
  type: SelectableType,
) {
  return type.directives.some((directive) =>
    context.isAvailableFederationDirective("interfaceObject", directive),
  );
}

function nullableType(type: TypeNode): TypeNode {
  return type.kind === Kind.NON_NULL_TYPE ? type.type : type;
}

function wrapListModifiers(type: TypeNode, resolvedType: TypeNode): TypeNode {
  type = nullableType(type);
  if (type.kind === Kind.LIST_TYPE) {
    return {
      kind: Kind.LIST_TYPE,
      type: wrapListModifiers(type.type, resolvedType),
    };
  }

  return resolvedType;
}

function matchesArgType(selectType: TypeNode, argType: TypeNode): boolean {
  if (argType.kind === Kind.NON_NULL_TYPE) {
    if (selectType.kind !== Kind.NON_NULL_TYPE) {
      return false;
    }
    return matchesArgType(selectType.type, argType.type);
  }

  // A non-null selection satisfies a nullable argument.
  if (selectType.kind === Kind.NON_NULL_TYPE) {
    return matchesArgType(selectType.type, argType);
  }

  if (argType.kind === Kind.LIST_TYPE) {
    if (selectType.kind !== Kind.LIST_TYPE) {
      return false;
    }
    return matchesArgType(selectType.type, argType.type);
  }

  if (selectType.kind === Kind.LIST_TYPE) {
    return false;
  }

  return selectType.name.value === argType.name.value;
}

function compileContextValues(
  selectionSet: SelectionSetNode,
):
  | { kind: "values"; values: ContextValue[] }
  | { kind: "invalid"; reason: string } {
  const values: ContextValue[] = [];
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      return { kind: "invalid", reason: "fragment spread is not allowed" };
    }

    if (selection.kind === Kind.FIELD && Boolean(selection.alias)) {
      return {
        kind: "invalid",
        reason: "aliases are not allowed in the selection",
      };
    }

    if (selection.directives && selection.directives.length) {
      return {
        kind: "invalid",
        reason: "directives are not allowed in the selection",
      };
    }

    const nested = selection.selectionSet
      ? compileContextValues(selection.selectionSet)
      : undefined;
    if (nested?.kind === "invalid") {
      return nested;
    }
    values.push(
      selection.kind === Kind.FIELD
        ? { field: selection.name.value, next: nested?.values }
        : {
            onType: selection.typeCondition?.name.value ?? null,
            next: nested?.values ?? [],
          },
    );
  }

  return { kind: "values", values };
}
