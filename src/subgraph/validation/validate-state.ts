import {
  GraphQLError,
  introspectionTypes,
  Kind,
  parseValue,
  specifiedScalarTypes,
  ValueNode,
} from "graphql";
import { andList } from "../../utils/format.js";
import {
  isList,
  isNonNull,
  stripList,
  stripNonNull,
  stripTypeModifiers,
} from "../../utils/state.js";
import {
  Argument,
  Directive,
  EnumType,
  InputField,
  InputObjectType,
  InterfaceType,
  ObjectType,
  ScalarType,
  SubgraphState,
  SubgraphType,
  TypeKind,
  UnionType,
} from "../state.js";
import { SubgraphValidationContext } from "./validation-context.js";

const specifiedScalars = new Set(specifiedScalarTypes.map((t) => t.name));

type ReportErrorFn = (message: string) => void;

const SKIP = Symbol("skip");

export function validateSubgraphState(
  state: SubgraphState,
  context: SubgraphValidationContext,
) {
  const errors: GraphQLError[] = [];

  function reportError(message: string) {
    errors.push(
      new GraphQLError(message, {
        extensions: {
          code: "INVALID_GRAPHQL",
        },
      }),
    );
  }

  validateRootTypes(state, reportError);
  validateDirectives(state, reportError, context);
  validateTypes(state, reportError);

  return errors;
}

function validateRootTypes(
  state: SubgraphState,
  reportError: ReportErrorFn,
): void {
  const rootTypesMap = new Map<string, Set<keyof typeof state.schema>>();

  for (const key in state.schema) {
    const rootTypeKind = key as keyof typeof state.schema;
    const rootTypeName = state.schema[rootTypeKind];

    if (rootTypeName) {
      const rootType = state.types.get(rootTypeName);

      if (!rootType) {
        // The existence of the type was already validated.
        // If it doesn't exist, it means it's been reported by KnownTypeNamesRule.
        continue;
      }

      if (!isObjectType(rootType)) {
        const operationTypeStr = capitalize(rootTypeKind.replace("Type", ""));
        reportError(
          rootTypeKind === "queryType"
            ? `${operationTypeStr} root type must be Object type, it cannot be ${rootTypeName}.`
            : `${operationTypeStr} root type must be Object type if provided, it cannot be ${rootTypeName}.`,
        );
      } else {
        const existing = rootTypesMap.get(rootTypeName);
        if (existing) {
          existing.add(rootTypeKind);
        } else {
          rootTypesMap.set(rootTypeName, new Set([rootTypeKind]));
        }
      }
    }
  }

  for (const [rootTypeName, operationTypes] of rootTypesMap) {
    if (operationTypes.size > 1) {
      const operationList = andList(
        Array.from(operationTypes).map((op) =>
          capitalize(op.replace("Type", "")),
        ),
      );
      reportError(
        `All root types must be different, "${rootTypeName}" type is used as ${operationList} root types.`,
      );
    }
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function validateDirectives(
  state: SubgraphState,
  reportError: ReportErrorFn,
  context: SubgraphValidationContext,
): void {
  for (const directive of state.types.values()) {
    if (isDirective(directive)) {
      if (context.isLinkSpecDirective(directive.name)) {
        continue;
      }

      // Ensure they are named correctly.
      validateName(reportError, directive.name);

      // Ensure the arguments are valid.
      for (const [argName, arg] of directive.args) {
        // Ensure they are named correctly.
        validateName(reportError, argName);

        // Ensure the type is an input type.
        const argInputTypeName = stripTypeModifiers(arg.type);

        if (context.isLinkSpecType(argInputTypeName)) {
          continue;
        }

        const isInput = isInputType(state, argInputTypeName);

        if (isInput === SKIP) {
          continue;
        }

        if (!isInput) {
          reportError(
            `The type of @${directive.name}(${arg.name}:) must be Input Type ` +
              `but got: ${arg.type}.`,
          );
        }

        if (isRequiredArgument(arg) && arg.deprecated?.deprecated === true) {
          reportError(
            `Required argument @${directive.name}(${arg.name}:) cannot be deprecated.`,
          );
        }
      }
    }
  }
}

function validateTypes(state: SubgraphState, reportError: ReportErrorFn): void {
  const validateInputObjectCircularRefs =
    createInputObjectCircularRefsValidator(state, reportError);
  const implementationsMap = new Map<string, Set<string>>();

  for (const type of state.types.values()) {
    if (isInterfaceType(type)) {
      // Store implementations by interface.
      for (const iface of type.interfaces) {
        const interfaceType = state.types.get(iface);
        if (interfaceType && isInterfaceType(interfaceType)) {
          let implementations = implementationsMap.get(iface);
          if (implementations === undefined) {
            implementationsMap.set(iface, new Set([type.name]));
          } else {
            implementations.add(type.name);
          }
        }
      }
    } else if (isObjectType(type)) {
      // Store implementations by objects.
      for (const iface of type.interfaces) {
        const interfaceType = state.types.get(iface);
        if (interfaceType && isInterfaceType(interfaceType)) {
          let implementations = implementationsMap.get(iface);
          if (implementations === undefined) {
            implementationsMap.set(iface, new Set([type.name]));
          } else {
            implementations.add(type.name);
          }
        }
      }
    }
  }

  for (const type of state.types.values()) {
    // Ensure it is named correctly (excluding introspection types).
    if (!isIntrospectionType(type.name)) {
      validateName(reportError, type.name);
    }

    if (isObjectType(type)) {
      // Ensure fields are valid
      validateFields(state, reportError, type);

      // Ensure objects implement the interfaces they claim to.
      validateInterfaces(state, implementationsMap, reportError, type);
    } else if (isInterfaceType(type)) {
      // Ensure fields are valid.
      validateFields(state, reportError, type);

      // Ensure interfaces implement the interfaces they claim to.
      validateInterfaces(state, implementationsMap, reportError, type);
    } else if (isUnionType(type)) {
      // Ensure Unions include valid member types.
      validateUnionMembers(state, reportError, type);
    } else if (isEnumType(type)) {
      // Ensure Enums have valid values.
      validateEnumValues(reportError, type);
    } else if (isInputObjectType(type)) {
      // Ensure Input Object fields are valid.
      validateInputFields(state, reportError, type);

      // Ensure Input Objects do not contain non-nullable circular references
      validateInputObjectCircularRefs(type);
    }
  }
}

function validateName(reportError: ReportErrorFn, name: string): void {
  // Ensure names are valid, however introspection types opt out.
  if (name.startsWith("__")) {
    reportError(
      `Name "${name}" must not begin with "__", which is reserved by GraphQL introspection.`,
    );
  }
}

function validateFields(
  state: SubgraphState,
  reportError: ReportErrorFn,
  type: ObjectType | InterfaceType,
): void {
  const fields = type.fields;
  const isRootType =
    type.name === state.schema.queryType ||
    type.name === state.schema.mutationType ||
    type.name === state.schema.subscriptionType;

  // Objects and Interfaces both must define one or more fields.
  if (fields.size === 0 && !isRootType) {
    reportError(`Type ${type.name} must define one or more fields.`);
  }

  for (const field of fields.values()) {
    // Ensure they are named correctly.
    validateName(reportError, field.name);

    const fieldTypeName = stripTypeModifiers(field.type);
    const fieldTypeExists = typeExists(state, fieldTypeName);

    if (!fieldTypeExists) {
      // The existence of the type was already validated.
      // If it doesn't exist, it means it's been reported by KnownTypeNamesRule.
      continue;
    }

    // Ensure the type is an output type
    const isOutput = isOutputType(state, fieldTypeName);

    if (isOutput === SKIP) {
      continue;
    }

    if (!isOutput) {
      reportError(
        `The type of "${type.name}.${field.name}" must be Output Type but got: "${field.type}".`,
      );
    }

    // Ensure the arguments are valid
    for (const arg of field.args.values()) {
      const argName = arg.name;

      // Ensure they are named correctly.
      validateName(reportError, argName);

      const argTypeName = stripTypeModifiers(arg.type);
      const argTypeExists = typeExists(state, argTypeName);

      if (!argTypeExists) {
        // The existence of the type was already validated.
        // If it doesn't exist, it means it's been reported by KnownTypeNamesRule.
        continue;
      }

      // Ensure the type is an input type
      const isInput = isInputType(state, argTypeName);

      if (isInput === SKIP) {
        continue;
      }

      if (!isInput) {
        const isList = arg.type.endsWith("]");
        const isNonNull = arg.type.endsWith("!");
        const extra = isList
          ? ", a ListType"
          : isNonNull
            ? ", a NonNullType"
            : "";

        reportError(
          `The type of "${type.name}.${field.name}(${argName}:)" must be Input Type but got "${arg.type}"${extra}.`,
        );
      }

      if (isRequiredArgument(arg) && arg.deprecated?.deprecated) {
        reportError(
          `Required argument ${type.name}.${field.name}(${argName}:) cannot be deprecated.`,
        );
      }

      // Ensure default value is valid
      if (
        typeof arg.defaultValue !== "undefined" &&
        !isValidateDefaultValue(
          state,
          reportError,
          arg.type,
          parseValue(arg.defaultValue),
        )
      ) {
        reportError(
          `Invalid default value (got: ${arg.defaultValue}) provided for argument ${type.name}.${field.name}(${arg.name}:) of type ${arg.type}.`,
        );
      }
    }
  }
}

function isValidateDefaultValue(
  state: SubgraphState,
  reportError: ReportErrorFn,
  inputTypePrinted: string,
  value: ValueNode,
): boolean {
  if (isNonNull(inputTypePrinted)) {
    if (value.kind === Kind.NULL) {
      return false;
    }

    return isValidateDefaultValue(
      state,
      reportError,
      stripNonNull(inputTypePrinted),
      value,
    );
  }

  if (value.kind === Kind.NULL) {
    // At this point, NULL is acceptable for all types.
    return true;
  }

  const inputTypeName = stripTypeModifiers(inputTypePrinted);
  const inputType = state.types.get(inputTypeName);

  if (inputType && isScalarType(inputType)) {
    return true;
  }

  if (isList(inputTypePrinted)) {
    if (value.kind === Kind.LIST) {
      return value.values.every((val) =>
        isValidateDefaultValue(
          state,
          reportError,
          stripList(inputTypePrinted),
          val,
        ),
      );
    }

    return isValidateDefaultValue(
      state,
      reportError,
      stripList(inputTypePrinted),
      value,
    );
  }

  if (specifiedScalars.has(inputTypeName)) {
    const specifiedScalar = specifiedScalarTypes.find(
      (t) => t.name === inputTypeName,
    )!;

    try {
      specifiedScalar.parseLiteral(value);
      return true;
    } catch (error) {
      return false;
    }
  }

  if (!inputType) {
    return true; // The existence of the type was already validated.
  }

  if (isInputObjectType(inputType)) {
    if (value.kind !== Kind.OBJECT) {
      return false;
    }

    const fields = inputType.fields;

    for (const astField of value.fields) {
      const field = fields.get(astField.name.value);

      if (!field) {
        return false;
      }

      if (
        !isValidateDefaultValue(state, reportError, field.type, astField.value)
      ) {
        return false;
      }
    }

    return true;
  }

  if (isEnumType(inputType)) {
    if (value.kind !== Kind.ENUM && value.kind !== Kind.STRING) {
      return false;
    }

    return inputType.values.has(value.value);
  }

  return false;
}

function validateUnionMembers(
  state: SubgraphState,
  reportError: ReportErrorFn,
  union: UnionType,
): void {
  const memberTypes = union.members;

  if (memberTypes.size === 0) {
    reportError(
      `Union type ${union.name} must define one or more member types.`,
    );
  }

  const includedTypeNames = new Set<string>();
  for (const memberType of memberTypes) {
    if (includedTypeNames.has(memberType)) {
      reportError(
        `Union type ${union.name} can only include type ${memberType} once.`,
      );
      continue;
    }
    includedTypeNames.add(memberType);
    const type = state.types.get(memberType);

    if (!type || !isObjectType(type)) {
      reportError(
        `Union type ${union.name} can only include Object types, ` +
          `it cannot include ${memberType}.`,
      );
    }
  }
}

function validateEnumValues(reportError: ReportErrorFn, enumType: EnumType) {
  const enumValues = enumType.values;

  if (enumValues.size === 0) {
    reportError(`Enum type ${enumType.name} must define one or more values.`);
  }

  for (const enumValue of enumValues.keys()) {
    // Ensure valid name.
    validateName(reportError, enumValue);
  }
}

function validateInputFields(
  state: SubgraphState,
  reportError: ReportErrorFn,
  inputObj: InputObjectType,
): void {
  const fields = inputObj.fields;

  if (fields.size === 0) {
    reportError(
      `Input Object type ${inputObj.name} must define one or more fields.`,
    );
  }

  // Ensure the arguments are valid
  for (const field of fields.values()) {
    // Ensure they are named correctly.
    validateName(reportError, field.name);

    const fieldTypeName = stripTypeModifiers(field.type);
    const fieldTypeExists = typeExists(state, fieldTypeName);

    if (!fieldTypeExists) {
      // The existence of the type was already validated.
      // If it doesn't exist, it means it's been reported by KnownTypeNamesRule.
      continue;
    }

    // Ensure the type is an input type
    const isInput = isInputType(state, fieldTypeName);

    if (isInput === SKIP) {
      continue;
    }

    if (!isInput) {
      const isList = field.type.endsWith("]");
      const isNonNull = field.type.endsWith("!");
      const extra = isList
        ? ", a ListType"
        : isNonNull
          ? ", a NonNullType"
          : "";
      reportError(
        `The type of ${inputObj.name}.${field.name} must be Input Type but got "${field.type}"${extra}.`,
      );
    }

    if (isRequiredInputField(field) && field.deprecated?.deprecated) {
      reportError(
        `Required input field ${inputObj.name}.${field.name} cannot be deprecated.`,
      );
    }

    // Ensure default value is valid
    if (
      typeof field.defaultValue !== "undefined" &&
      !isValidateDefaultValue(
        state,
        reportError,
        field.type,
        parseValue(field.defaultValue),
      )
    ) {
      reportError(
        `Invalid default value (got: ${field.defaultValue}) provided for input field ${inputObj.name}.${field.name} of type ${field.type}.`,
      );
    }
  }
}

function validateInterfaces(
  state: SubgraphState,
  implementationsMap: Map<string, Set<string>>,
  reportError: ReportErrorFn,
  type: ObjectType | InterfaceType,
): void {
  const ifaceTypeNames = new Set<string>();
  for (const iface of type.interfaces) {
    const interfaceType = state.types.get(iface);

    if (!interfaceType) {
      // The existence of the type was already validated.
      // If it doesn't exist, it means it's been reported by KnownTypeNamesRule.
      continue;
    }

    if (!isInterfaceType(interfaceType)) {
      reportError(
        `Type ${type.name} must only implement Interface types, it cannot implement ${iface}.`,
      );
      continue;
    }

    if (type.name === iface) {
      reportError(
        `Type ${type.name} cannot implement itself because it would create a circular reference.`,
      );
      continue;
    }

    if (ifaceTypeNames.has(iface)) {
      reportError(`Type ${type.name} can only implement ${iface} once.`);
      continue;
    }

    ifaceTypeNames.add(iface);

    validateTypeImplementsAncestors(reportError, type, interfaceType);
    validateTypeImplementsInterface(
      state,
      implementationsMap,
      reportError,
      type,
      interfaceType,
    );
  }
}

function validateTypeImplementsAncestors(
  reportError: ReportErrorFn,
  type: ObjectType | InterfaceType,
  interfaceType: InterfaceType,
): void {
  const ifaceInterfaces = type.interfaces;
  for (const transitive of interfaceType.interfaces) {
    if (!ifaceInterfaces.has(transitive)) {
      reportError(
        transitive === type.name
          ? `Type ${type.name} cannot implement ${interfaceType.name} because it would create a circular reference.`
          : `Type ${type.name} must implement ${transitive} because it is implemented by ${interfaceType.name}.`,
      );
    }
  }
}

function validateTypeImplementsInterface(
  state: SubgraphState,
  implementationsMap: Map<string, Set<string>>,
  reportError: ReportErrorFn,
  type: ObjectType | InterfaceType,
  interfaceType: InterfaceType,
): void {
  const typeFieldMap = type.fields;

  // Assert each interface field is implemented.
  for (const ifaceField of interfaceType.fields.values()) {
    const fieldName = ifaceField.name;
    const typeField = typeFieldMap.get(fieldName);

    // Assert interface field exists on type.
    if (typeField == null) {
      reportError(
        `Interface field ${interfaceType.name}.${fieldName} expected but ${type.name} does not provide it.`,
      );
      continue;
    }

    // Assert interface field type is satisfied by type field type, by being
    // a valid subtype. (covariant)
    if (
      !isTypeSubTypeOf(
        state,
        implementationsMap,
        typeField.type,
        ifaceField.type,
      )
    ) {
      reportError(
        `Interface field ${interfaceType.name}.${fieldName} expects type ` +
          `${ifaceField.type} but ${type.name}.${fieldName} of type ${typeField.type} is not a proper subtype.`,
      );
    }

    // Assert each interface field arg is implemented.
    for (const ifaceArg of ifaceField.args.values()) {
      const argName = ifaceArg.name;
      const typeArg = typeField.args.get(argName);

      // Assert interface field arg exists on object field.
      if (!typeArg) {
        reportError(
          `Interface field argument ${interfaceType.name}.${fieldName}(${argName}:) expected but ${type.name}.${fieldName} does not provide it.`,
        );
        continue;
      }

      // Assert interface field arg type matches object field arg type.
      if (ifaceArg.type !== typeArg.type) {
        reportError(
          `Interface field argument ${interfaceType.name}.${fieldName}(${argName}:) ` +
            `expects type ${ifaceArg.type} but ` +
            `${type.name}.${fieldName}(${argName}:) is type ` +
            `${typeArg.type}.`,
        );
      }
    }

    // Assert additional arguments must not be required.
    for (const typeArg of typeField.args.values()) {
      const argName = typeArg.name;
      const ifaceArg = ifaceField.args.get(argName);
      if (!ifaceArg && isRequiredArgument(typeArg)) {
        reportError(
          `Object field ${type.name}.${fieldName} includes required argument ${argName} that is missing from the Interface field ${interfaceType.name}.${fieldName}.`,
        );
      }
    }
  }
}

/**
 * Provided a type and a super type, return true if the first type is either
 * equal or a subset of the second super type (covariant).
 */
export function isTypeSubTypeOf(
  state: SubgraphState,
  implementationsMap: Map<string, Set<string>>,
  maybeSubTypeName: string,
  superTypeName: string,
): boolean {
  // Equivalent type is a valid subtype
  if (maybeSubTypeName === superTypeName) {
    return true;
  }

  // If superType is non-null, maybeSubType must also be non-null.
  if (isNonNull(superTypeName)) {
    if (isNonNull(maybeSubTypeName)) {
      return isTypeSubTypeOf(
        state,
        implementationsMap,
        stripNonNull(maybeSubTypeName),
        stripNonNull(superTypeName),
      );
    }
    return false;
  }
  if (isNonNull(maybeSubTypeName)) {
    // If superType is nullable, maybeSubType may be non-null or nullable.
    return isTypeSubTypeOf(
      state,
      implementationsMap,
      stripNonNull(maybeSubTypeName),
      superTypeName,
    );
  }

  // If superType type is a list, maybeSubType type must also be a list.
  if (isList(superTypeName)) {
    if (isList(maybeSubTypeName)) {
      return isTypeSubTypeOf(
        state,
        implementationsMap,
        stripList(maybeSubTypeName),
        stripList(superTypeName),
      );
    }
    return false;
  }
  if (isList(maybeSubTypeName)) {
    // If superType is not a list, maybeSubType must also be not a list.
    return false;
  }

  const superType = state.types.get(superTypeName);
  const maybeSubType = state.types.get(maybeSubTypeName);

  // The existence of the types was already validated.
  // If one of them does not exist, it means it's been reported by KnownTypeNamesRule.
  if (!superType || !maybeSubType) {
    return false;
  }

  // If superType type is an abstract type, check if it is super type of maybeSubType.
  // Otherwise, the child type is not a valid subtype of the parent type.
  return (
    isAbstractType(superType) &&
    (isInterfaceType(maybeSubType) || isObjectType(maybeSubType)) &&
    isSubType(implementationsMap, superType, maybeSubType)
  );
}

function isSubType(
  implementationsMap: Map<string, Set<string>>,
  abstractType: InterfaceType | UnionType,
  maybeSubType: ObjectType | InterfaceType,
): boolean {
  if (isUnionType(abstractType)) {
    // set = new Set<GraphQLObjectType>(abstractType.getTypes());
    return abstractType.members.has(maybeSubType.name);
  }

  return (
    implementationsMap.get(abstractType.name)?.has(maybeSubType.name) ?? false
  );
}

function createInputObjectCircularRefsValidator(
  state: SubgraphState,
  reportError: ReportErrorFn,
): (inputObj: InputObjectType) => void {
  // Modified copy of algorithm from 'src/validation/rules/NoFragmentCycles.js'.
  // Tracks already visited types to maintain O(N) and to ensure that cycles
  // are not redundantly reported.
  const visitedTypes = new Set<InputObjectType>();

  // Array of type names used to produce meaningful errors
  const fieldPath: Array<string> = [];

  // Position in the type path
  const fieldPathIndexByTypeName = Object.create(null);

  return detectCycleRecursive;

  // This does a straight-forward DFS to find cycles.
  // It does not terminate when a cycle was found but continues to explore
  // the graph to find all possible cycles.
  function detectCycleRecursive(inputObj: InputObjectType): void {
    if (visitedTypes.has(inputObj)) {
      return;
    }

    visitedTypes.add(inputObj);
    fieldPathIndexByTypeName[inputObj.name] = fieldPath.length;

    for (const field of inputObj.fields.values()) {
      if (isNonNull(field.type)) {
        const fieldType = state.types.get(stripNonNull(field.type));
        if (fieldType && isInputObjectType(fieldType)) {
          const cycleIndex = fieldPathIndexByTypeName[fieldType.name];

          fieldPath.push(field.name);
          if (cycleIndex === undefined) {
            detectCycleRecursive(fieldType);
          } else {
            const cyclePath = fieldPath.slice(cycleIndex);
            reportError(
              `Cannot reference Input Object "${
                fieldType.name
              }" within itself through a series of non-null fields: "${cyclePath.join(".")}".`,
            );
          }
          fieldPath.pop();
        }
      }
    }

    fieldPathIndexByTypeName[inputObj.name] = undefined;
  }
}

function isIntrospectionType(typeName: string): boolean {
  return introspectionTypes.some((t) => t.name === typeName);
}

function isAbstractType(type: SubgraphType): type is UnionType | InterfaceType {
  return isInterfaceType(type) || isUnionType(type);
}

function isRequiredArgument(arg: Argument): boolean {
  return isNonNull(arg.type) && arg.defaultValue === undefined;
}

function isRequiredInputField(arg: InputField): boolean {
  return isNonNull(arg.type) && arg.defaultValue === undefined;
}

function isOutputType(state: SubgraphState, typeName: string) {
  const type = state.types.get(typeName);

  if (!type) {
    if (specifiedScalars.has(typeName)) {
      return true;
    }

    // The existence of the type was already validated.
    // See: KnownTypeNamesRule
    // No need to throw an exception here, because it affects the rest of the validation logic.
    return SKIP;
  }

  // Only input types are not output types (scalars and enums are in both).
  // This is a quick check, to make it least expensive possible.
  return !isInputObjectType(type);
}

export function isInputType(state: SubgraphState, typeName: string) {
  const type = state.types.get(typeName);

  if (!type) {
    if (specifiedScalars.has(typeName)) {
      return true;
    }

    // The existence of the type was already validated.
    // See: KnownTypeNamesRule
    // No need to throw an exception here, because it affects the rest of the validation logic.
    return SKIP;
  }

  return isScalarType(type) || isEnumType(type) || isInputObjectType(type);
}

export function typeExists(state: SubgraphState, typeName: string): boolean {
  return state.types.has(typeName) || specifiedScalars.has(typeName);
}

export function isInputObjectType(type: SubgraphType): type is InputObjectType {
  return type.kind === TypeKind.INPUT_OBJECT;
}

export function isScalarType(type: SubgraphType): type is ScalarType {
  return type.kind === TypeKind.SCALAR;
}

export function isEnumType(type: SubgraphType): type is EnumType {
  return type.kind === TypeKind.ENUM;
}

export function isObjectType(type: SubgraphType): type is ObjectType {
  return type.kind === TypeKind.OBJECT;
}

export function isInterfaceType(type: SubgraphType): type is InterfaceType {
  return type.kind === TypeKind.INTERFACE;
}

export function isUnionType(type: SubgraphType): type is UnionType {
  return type.kind === TypeKind.UNION;
}

export function isDirective(type: SubgraphType): type is Directive {
  return type.kind === TypeKind.DIRECTIVE;
}
