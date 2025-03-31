import { ASTVisitor, GraphQLError, Kind, ValueNode } from "graphql";
import { validateDirectiveAgainstOriginal } from "../../../helpers.js";
import { print } from "../../../../graphql/printer.js";
import type { SubgraphValidationContext } from "../../validation-context.js";

// Supergraph context:
// - save what field is being overridden and from which subgraph

const labelNonPercentRegex = /^[a-zA-Z][a-zA-Z0-9_\-:./]*$/;
const labelPercentRegex =
  /^percent\(((\d{1,2}(\.\d{1,8})?)|100(\.[0]{1,8})?)\)$/;

export function OverrideRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      validateDirectiveAgainstOriginal(node, "override", context);
    },
    Directive(node) {
      if (!context.isAvailableFederationDirective("override", node)) {
        return;
      }

      const fieldDef = context.typeNodeInfo.getFieldDef();
      const typeDef = context.typeNodeInfo.getTypeDef();

      if (!fieldDef || !typeDef) {
        return;
      }

      if (
        (typeDef.kind === Kind.INTERFACE_TYPE_DEFINITION ||
          typeDef.kind === Kind.INTERFACE_TYPE_EXTENSION) &&
        context.satisfiesVersionRange(">= v2.3")
      ) {
        context.reportError(
          new GraphQLError(
            `@override cannot be used on field "${typeDef.name.value}.${
              fieldDef.name.value
            }" on subgraph "${context.getSubgraphName()}": @override is not supported on interface type fields.`,
            { nodes: node, extensions: { code: "OVERRIDE_ON_INTERFACE" } },
          ),
        );
        // We stop here as we don't want to report other errors on this field (Apollo Composition does not)
        return;
      }

      const labelArg = node.arguments?.find(
        (arg) => arg.name.value === "label",
      );
      if (labelArg && context.satisfiesVersionRange(">= v2.7")) {
        if (!isValidLabel(labelArg.value)) {
          context.reportError(
            new GraphQLError(
              invalidLabelValueError(
                print(labelArg.value),
                `${typeDef.name.value}.${fieldDef.name.value}`,
                context.getSubgraphName(),
              ),
              { extensions: { code: "OVERRIDE_LABEL_INVALID" } },
            ),
          );
          return;
        }
      }

      const labelValue = labelArg?.value;

      if (labelValue && labelValue.kind !== Kind.STRING) {
        // other validation rule takes care of this case.
        // At this point, we can ignore this directive as the subgraph is invalid anyway.
        return;
      }

      const fromArg = node.arguments?.find((arg) => arg.name.value === "from");

      if (!fromArg || fromArg.value.kind !== Kind.STRING) {
        return;
      }

      if (!typeDef) {
        throw new Error(
          "Parent type not found but `@override` directive is present on a field.",
        );
      }

      const conflictingDirectives = fieldDef.directives?.filter((directive) =>
        context.isAvailableFederationDirective("external", directive),
      );

      if (conflictingDirectives?.length) {
        conflictingDirectives.forEach((directive) => {
          context.reportError(
            new GraphQLError(
              `@override cannot be used on field "${typeDef.name.value}.${
                fieldDef.name.value
              }" on subgraph "${context.getSubgraphName()}" since "${typeDef.name.value}.${
                fieldDef.name.value
              }" on "${context.getSubgraphName()}" is marked with directive "@${
                directive.name.value
              }"`,
              {
                extensions: {
                  code: "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
                },
              },
            ),
          );
        });
      }

      if (fromArg.value.value === context.getSubgraphName()) {
        context.reportError(
          new GraphQLError(
            `Source and destination subgraphs "${fromArg.value.value}" are the same for overridden field "${typeDef.name.value}.${fieldDef.name.value}"`,
            { nodes: node, extensions: { code: "OVERRIDE_FROM_SELF_ERROR" } },
          ),
        );
      }

      if (
        typeDef.kind === Kind.OBJECT_TYPE_DEFINITION ||
        typeDef.kind === Kind.OBJECT_TYPE_EXTENSION
      ) {
        context.stateBuilder.objectType.field.setOverride(
          typeDef.name.value,
          fieldDef.name.value,
          fromArg.value.value,
          labelValue?.value ?? null,
        );
      } else {
        context.stateBuilder.interfaceType.field.setOverride(
          typeDef!.name.value,
          fieldDef.name.value,
          fromArg.value.value,
          labelValue?.value ?? null,
        );
      }
    },
  };
}

function invalidLabelValueError(
  value: string,
  coordinate: string,
  subgraphName: string,
) {
  return `Invalid @override label ${value} on field "${coordinate}" on subgraph "${subgraphName}": labels must start with a letter and after that may contain alphanumerics, underscores, minuses, colons, periods, or slashes. Alternatively, labels may be of the form "percent(x)" where x is a float between 0-100 inclusive.`;
}

function isValidLabel(valueNode: ValueNode) {
  if (valueNode.kind !== Kind.STRING) {
    return false;
  }

  const value = valueNode.value;

  if (value.startsWith("percent(+") || value.startsWith("percent(-")) {
    return false;
  }

  if (value.startsWith("percent(") && value.endsWith(")")) {
    if (!labelPercentRegex.test(value)) {
      return false;
    }

    const percentage = parseFloat(
      value.replace("percent(", "").replace(")", ""),
    );
    return percentage >= 0 && percentage <= 100;
  }

  return labelNonPercentRegex.test(value);
}
