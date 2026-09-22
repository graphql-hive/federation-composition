import type { SubgraphState } from "../../subgraph/state.js";
import { visitSupergraphState } from "../composition/visitor.js";
import type { SupergraphStateBuilder } from "../state.js";
import { AuthOnRequiresRule } from "./rules/auth-on-requires-rule.js";
import { AuthOnContextRule } from "./rules/auth-on-context-rule.js";
import { ContextualArgumentRule } from "./rules/contextual-argument-rule.js";
import { DefaultValueUsesInaccessibleRule } from "./rules/default-value-uses-inaccessible-rule.js";
import { DirectiveCompositionRule } from "./rules/directive-composition-rule.js";
import { EnumValuesRule } from "./rules/enum-values-rule.js";
import { ExtensionWithBaseRule } from "./rules/extension-with-base.js";
import { ExternalArgumentMissingRule } from "./rules/external-argument-missing-rule.js";
import { ExternalMissingOnBaseRule } from "./rules/external-missing-on-base-rule.js";
import { ExternalTypeMismatchRule } from "./rules/external-type-mismatch-rule.js";
import { FieldArgumentDefaultMismatchRule } from "./rules/field-argument-default-mismatch-rule.js";
import { FieldArgumentsOfTheSameTypeRule } from "./rules/field-arguments-of-the-same-type-rule.js";
import { FieldsOfTheSameTypeRule } from "./rules/fields-of-the-same-type-rule.js";
import { InputFieldDefaultMismatchRule } from "./rules/input-field-default-mismatch-rule.js";
import { InputObjectValuesRule } from "./rules/input-object-values-rule.js";
import { InterfaceFieldNoImplementationRule } from "./rules/interface-field-no-implementation-rule.js";
import { InterfaceKeyMissingImplementationTypeRule } from "./rules/interface-key-missing-implementation-type.js";
import { InterfaceObjectUsageErrorRule } from "./rules/interface-object-usage-error.js";
import { InterfaceSubtypeRule } from "./rules/interface-subtype-rule.js";
import { InvalidFieldSharingRule } from "./rules/invalid-field-sharing-rule.js";
import { LinkImportNameMismatchRule } from "./rules/link-import-name-mismatch-rule.js";
import { ListSizeSlicingArgumentsRule } from "./rules/list-size-slicing-arguments-rule.js";
import { NoInaccessibleOnImplementedInterfaceFieldsRule } from "./rules/no-inaccessible-on-implemented-interface-fields-rule.js";
import { OnlyInaccessibleChildrenRule } from "./rules/only-inaccessible-children-rule.js";
import { OverrideSourceHasOverrideRule } from "./rules/override-source-has-override.js";
import { OverrideLabelWithRequiresRule } from "./rules/override-label-with-requires.js";
import { ReferencedInaccessibleRule } from "./rules/referenced-inaccessible-rule.js";
import { RequiredArgumentMissingInSomeSubgraph } from "./rules/required-argument-missing-in-some-subgraph-rule.js";
import { RequiredArgumentOrFieldIsNotInaccessibleRule } from "./rules/required-argument-or-field-is-not-inaccessible-rule.js";
import { RequiredInputFieldMissingInSomeSubgraphRule } from "./rules/required-input-field-missing-in-some-subgraph-rule.js";
import { RequiredQueryRule } from "./rules/required-query-rule.js";
import { SatisfiabilityRule } from "./rules/satisfiablity-rule.js";
import { SubgraphNameRule } from "./rules/subgraph-name-rule.js";
import { TypesOfTheSameKindRule } from "./rules/types-of-the-same-kind-rule.js";
import { createSupergraphValidationContext } from "./validation-context.js";

export function validateSupergraph(
  subgraphStates: Map<string, SubgraphState>,
  state: SupergraphStateBuilder,
  __internal?: {
    disableValidationRules?: string[];
  },
) {
  const context = createSupergraphValidationContext(subgraphStates);

  for (const subgraphState of subgraphStates.values()) {
    state.addSubgraph(subgraphState);
  }
  const preSupergraphRules = [
    RequiredQueryRule,
    TypesOfTheSameKindRule,
    LinkImportNameMismatchRule,
  ];
  const rulesToSkip = __internal?.disableValidationRules ?? [];

  for (const rule of preSupergraphRules) {
    if (rulesToSkip.includes(rule.name)) {
      continue;
    }
    rule(context);
  }

  for (const subgraphState of subgraphStates.values()) {
    state.visitSubgraphState(subgraphState);
  }

  state.composeSupergraphState();

  const postSupergraphRules = [
    InterfaceFieldNoImplementationRule,
    ExtensionWithBaseRule,
    FieldsOfTheSameTypeRule,
    FieldArgumentsOfTheSameTypeRule,
    EnumValuesRule,
    OverrideSourceHasOverrideRule,
    OverrideLabelWithRequiresRule,
    ExternalMissingOnBaseRule,
    InputObjectValuesRule,
    RequiredArgumentMissingInSomeSubgraph,
    RequiredInputFieldMissingInSomeSubgraphRule,
    ExternalArgumentMissingRule,
    InputFieldDefaultMismatchRule,
    FieldArgumentDefaultMismatchRule,
    DefaultValueUsesInaccessibleRule,
    OnlyInaccessibleChildrenRule,
    ReferencedInaccessibleRule,
    DirectiveCompositionRule,
    InterfaceObjectUsageErrorRule,
    InterfaceKeyMissingImplementationTypeRule,
    ExternalTypeMismatchRule,
    InvalidFieldSharingRule,
    SubgraphNameRule,
    RequiredArgumentOrFieldIsNotInaccessibleRule,
    InterfaceSubtypeRule,
    NoInaccessibleOnImplementedInterfaceFieldsRule,
    ListSizeSlicingArgumentsRule,
    ContextualArgumentRule,
  ];

  // These resolve @key/@requires/@provides/@fromContext selection sets against the merged
  // supergraph state. A selection set is written against a single subgraph, so when subgraphs
  // disagree on a field's type (FIELD_TYPE_MISMATCH, EXTERNAL_TYPE_MISMATCH, TYPE_KIND_MISMATCH...)
  // it may point at fields the merged type does not have, and these rules throw instead of
  // reporting. Composition already failed at that point, so run them only on a coherent state.
  const selectionDependentRules = [
    SatisfiabilityRule,
    AuthOnRequiresRule,
    AuthOnContextRule,
  ];

  const supergraph = state.getSupergraphState();

  function runRules(rules: typeof postSupergraphRules) {
    visitSupergraphState(
      supergraph,
      rules.map((rule) => {
        if (rulesToSkip.includes(rule.name)) {
          return {};
        }

        return rule(context, supergraph);
      }),
    );
  }

  runRules(postSupergraphRules);

  const errors = context.collectReportedErrors();

  if (errors.length > 0) {
    return errors;
  }

  runRules(selectionDependentRules);

  return context.collectReportedErrors();
}
