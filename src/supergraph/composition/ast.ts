/**
 * Set of functions to build and manipulate DocumentNode of a Supergraph.
 *
 * This is a low-level API that's not intended to be used directly.
 * It's primarily designed to be used by `composeServices` function as the used algorithm has some assumptions.
 */
import {
  ASTNode,
  ConstArgumentNode,
  ConstDirectiveNode,
  ConstValueNode,
  DirectiveDefinitionNode,
  DocumentNode,
  EnumTypeDefinitionNode,
  EnumValueDefinitionNode,
  FieldDefinitionNode,
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  InterfaceTypeDefinitionNode,
  Kind,
  NamedTypeNode,
  ObjectTypeDefinitionNode,
  OperationTypeDefinitionNode,
  OperationTypeNode,
  parseConstValue,
  parseType,
  ScalarTypeDefinitionNode,
  SchemaDefinitionNode,
  specifiedDirectives,
  StringValueNode,
  TypeNode,
  UnionTypeDefinitionNode,
  visit,
  visitInParallel,
} from 'graphql';
import { print } from '../../graphql/printer.js';
import { ArgumentKind } from '../../subgraph/state.js';

type inferArgument<T> = T extends (arg: infer A) => any ? A : never;

export type DirectiveAST = inferArgument<typeof createDirectiveNode>;
export type ObjectTypeAST = inferArgument<typeof createObjectTypeNode>;
export type FieldAST = inferArgument<typeof createFieldNode>;
export type FieldArgumentAST = inferArgument<typeof createFieldArgumentNode>;
export type InputFieldAST = inferArgument<typeof createInputFieldNode>;
export type EnumValueAST = inferArgument<typeof createEnumValueNode>;
export type JoinTypeAST = inferArgument<typeof createJoinTypeDirectiveNode>;
export type JoinImplementsAST = inferArgument<typeof createJoinImplementsDirectiveNode>;
export type JoinFieldAST = inferArgument<typeof createJoinFieldDirectiveNode>;
export type JoinUnionMemberAST = inferArgument<typeof createJoinUnionMemberDirectiveNode>;
export type JoinEnumValueAST = inferArgument<typeof createJoinEnumValueDirectiveNode>;
type Link = inferArgument<typeof createLinkDirectiveNode>;
type Cost = inferArgument<typeof createCostDirectiveNode>;
type ListSize = inferArgument<typeof createListSizeDirectiveNode>;
type DescriptionAST = inferArgument<typeof createDescriptionNode>;
type Deprecated = {
  reason?: string;
  deprecated: true;
};

export function createSchemaNode(schema: {
  query?: string;
  mutation?: string;
  subscription?: string;
  links?: Link[];
}): SchemaDefinitionNode {
  return {
    kind: Kind.SCHEMA_DEFINITION,
    directives: schema.links?.map(createLinkDirectiveNode),
    operationTypes: ([] as OperationTypeDefinitionNode[]).concat(
      schema.query
        ? {
            kind: Kind.OPERATION_TYPE_DEFINITION,
            operation: OperationTypeNode.QUERY,
            type: createNamedTypeNode(schema.query),
          }
        : [],
      schema.mutation
        ? {
            kind: Kind.OPERATION_TYPE_DEFINITION,
            operation: OperationTypeNode.MUTATION,
            type: createNamedTypeNode(schema.mutation),
          }
        : [],
      schema.subscription
        ? {
            kind: Kind.OPERATION_TYPE_DEFINITION,
            operation: OperationTypeNode.SUBSCRIPTION,
            type: createNamedTypeNode(schema.subscription),
          }
        : [],
    ),
  };
}

export function createDirectiveNode(directive: {
  name: string;
  tags?: string[];
  arguments: FieldArgumentAST[];
  locations: string[];
  repeatable: boolean;
}): DirectiveDefinitionNode {
  return {
    kind: Kind.DIRECTIVE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: directive.name,
    },
    locations: Array.from(directive.locations).map(location => ({
      kind: Kind.NAME,
      value: location,
    })),
    repeatable: directive.repeatable,
    arguments: directive.arguments.map(createFieldArgumentNode),
  };
}

export function createObjectTypeNode(objectType: {
  name: string;
  fields: FieldAST[];
  interfaces?: string[];
  join?: {
    type?: JoinTypeAST[];
    implements?: JoinImplementsAST[];
  };
  tags?: string[];
  inaccessible?: boolean;
  authenticated?: boolean;
  policies?: string[][];
  scopes?: string[][];
  cost: Cost | null;
  description?: DescriptionAST;
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): ObjectTypeDefinitionNode {
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: objectType.name,
    },
    directives: applyDirectives(objectType),
    fields: objectType.fields.map(createFieldNode),
    description: objectType.description ? createDescriptionNode(objectType.description) : undefined,
    interfaces: objectType.interfaces?.map(createNamedTypeNode),
  };
}

export function createInterfaceTypeNode(interfaceType: {
  name: string;
  fields: FieldAST[];
  interfaces?: string[];
  join?: {
    type?: JoinTypeAST[];
    implements?: JoinImplementsAST[];
  };
  tags?: string[];
  inaccessible?: boolean;
  authenticated?: boolean;
  policies?: string[][];
  scopes?: string[][];
  description?: DescriptionAST;
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): InterfaceTypeDefinitionNode {
  return {
    kind: Kind.INTERFACE_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: interfaceType.name,
    },
    directives: applyDirectives(interfaceType),
    description: interfaceType.description
      ? createDescriptionNode(interfaceType.description)
      : undefined,
    fields: interfaceType.fields.map(createFieldNode),
    interfaces: interfaceType.interfaces?.map(createNamedTypeNode),
  };
}

export function createInputObjectTypeNode(inputObjectType: {
  name: string;
  fields: InputFieldAST[];
  join?: {
    type?: JoinTypeAST[];
  };
  tags?: string[];
  inaccessible?: boolean;
  description?: DescriptionAST;
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): InputObjectTypeDefinitionNode {
  return {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: inputObjectType.name,
    },
    directives: applyDirectives(inputObjectType),
    fields: inputObjectType.fields.map(createInputFieldNode),
    description: inputObjectType.description
      ? createDescriptionNode(inputObjectType.description)
      : undefined,
  };
}

export function createUnionTypeNode(unionType: {
  name: string;
  join?: {
    type?: JoinTypeAST[];
    unionMember?: JoinUnionMemberAST[];
  };
  members: string[];
  inaccessible?: boolean;
  description?: DescriptionAST;
  tags?: string[];
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): UnionTypeDefinitionNode {
  return {
    kind: Kind.UNION_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: unionType.name,
    },
    directives: applyDirectives(unionType),
    description: unionType.description ? createDescriptionNode(unionType.description) : undefined,
    types: unionType.members.map(member => ({
      kind: Kind.NAMED_TYPE,
      name: {
        kind: Kind.NAME,
        value: member,
      },
    })),
  };
}

export function createEnumTypeNode(enumType: {
  name: string;
  join?: {
    type?: JoinTypeAST[];
  };
  tags?: string[];
  inaccessible?: boolean;
  authenticated?: boolean;
  policies?: string[][];
  scopes?: string[][];
  cost: Cost | null;
  description?: DescriptionAST;
  values: EnumValueAST[];
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): EnumTypeDefinitionNode {
  return {
    kind: Kind.ENUM_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: enumType.name,
    },
    directives: applyDirectives(enumType),
    description: enumType.description ? createDescriptionNode(enumType.description) : undefined,
    values: enumType.values.map(createEnumValueNode),
  };
}

export function createScalarTypeNode(scalarType: {
  name: string;
  join?: {
    type?: JoinTypeAST[];
  };
  tags?: string[];
  inaccessible?: boolean;
  authenticated?: boolean;
  policies?: string[][];
  scopes?: string[][];
  cost: Cost | null;
  description?: DescriptionAST;
  specifiedBy?: string;
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): ScalarTypeDefinitionNode {
  return {
    kind: Kind.SCALAR_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: scalarType.name,
    },
    description: scalarType.description ? createDescriptionNode(scalarType.description) : undefined,
    directives: applyDirectives(scalarType),
  };
}

export function createJoinGraphEnumTypeNode(
  graphs: Array<{
    name: string;
    enumValue: string;
    url?: string;
  }>,
) {
  return createEnumTypeNode({
    name: 'join__Graph',
    cost: null,
    values: graphs.map(graph => ({
      name: graph.enumValue,
      ast: {
        directives: [createJoinGraphDirectiveNode(graph)],
      },
    })),
  });
}

function createFieldNode(field: {
  name: string;
  type: string;
  arguments?: FieldArgumentAST[];
  join?: {
    field?: JoinFieldAST[];
  };
  inaccessible?: boolean;
  cost: Cost | null;
  listSize: ListSize | null;
  tags?: string[];
  description?: DescriptionAST;
  deprecated?: Deprecated;
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): FieldDefinitionNode {
  return {
    kind: Kind.FIELD_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: field.name,
    },
    type: parseType(field.type),
    directives: applyDirectives(field),
    description: field.description ? createDescriptionNode(field.description) : undefined,
    arguments: field.arguments?.map(createFieldArgumentNode),
  };
}

function createInputFieldNode(inputField: {
  name: string;
  type: string;
  defaultValue?: string;
  tags?: string[];
  inaccessible?: boolean;
  cost: Cost | null;
  description?: DescriptionAST;
  ast?: {
    directives?: ConstDirectiveNode[];
  };
  join?: {
    field?: JoinFieldAST[];
  };
}): InputValueDefinitionNode {
  return {
    kind: Kind.INPUT_VALUE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: inputField.name,
    },
    type: parseType(inputField.type),
    directives: applyDirectives(inputField),
    description: inputField.description ? createDescriptionNode(inputField.description) : undefined,
    defaultValue:
      typeof inputField.defaultValue === 'string'
        ? parseConstValue(inputField.defaultValue)
        : undefined,
  };
}

function createEnumValueNode(enumValue: {
  name: string;
  join?: {
    enumValue?: JoinEnumValueAST[];
  };
  tags?: string[];
  inaccessible?: boolean;
  description?: DescriptionAST;
  deprecated?: Deprecated;
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): EnumValueDefinitionNode {
  return {
    kind: Kind.ENUM_VALUE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: enumValue.name,
    },
    directives: applyDirectives(enumValue),
    description: enumValue.description ? createDescriptionNode(enumValue.description) : undefined,
  };
}

function createDefaultValue(
  defaultValue: string | undefined,
  kind: ArgumentKind,
): ConstValueNode | undefined {
  if (typeof defaultValue !== 'string') {
    return undefined;
  }

  if (kind === ArgumentKind.ENUM) {
    return {
      kind: Kind.ENUM,
      value:
        defaultValue.startsWith(`"`) && defaultValue.endsWith(`"`)
          ? defaultValue.substring(1, defaultValue.length - 1)
          : defaultValue,
    };
  }

  return parseConstValue(defaultValue);
}

function createFieldArgumentNode(argument: {
  name: string;
  type: string;
  kind: ArgumentKind;
  defaultValue?: string;
  inaccessible?: boolean;
  cost: Cost | null;
  tags?: string[];
  description?: DescriptionAST;
  deprecated?: Deprecated;
  ast?: {
    directives?: ConstDirectiveNode[];
  };
}): InputValueDefinitionNode {
  return {
    kind: Kind.INPUT_VALUE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: argument.name,
    },
    defaultValue: createDefaultValue(argument.defaultValue, argument.kind),
    type: parseType(argument.type),
    directives: applyDirectives(argument),
    description: argument.description ? createDescriptionNode(argument.description) : undefined,
  };
}

function createJoinTypeDirectiveNode(join: {
  graph: string;
  key?: string;
  isInterfaceObject?: boolean;
  extension?: boolean;
  resolvable?: boolean;
}): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'join__type',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'graph',
        },
        value: {
          kind: Kind.ENUM,
          value: join.graph,
        },
      } as const,
      join.key
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'key',
            },
            value: {
              kind: Kind.STRING,
              value: join.key,
            },
          } as const)
        : null,
      join.resolvable === false
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'resolvable',
            },
            value: {
              kind: Kind.BOOLEAN,
              value: false,
            },
          } as const)
        : null,
      join.isInterfaceObject
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'isInterfaceObject',
            },
            value: {
              kind: Kind.BOOLEAN,
              value: true,
            },
          } as const)
        : null,
      join.extension
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'extension',
            },
            value: {
              kind: Kind.BOOLEAN,
              value: true,
            },
          } as const)
        : null,
    ].filter(nonEmpty),
  };
}

function createJoinImplementsDirectiveNode(join: {
  graph: string;
  interface: string;
}): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'join__implements',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'graph',
        },
        value: {
          kind: Kind.ENUM,
          value: join.graph,
        },
      },
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'interface',
        },
        value: {
          kind: Kind.STRING,
          value: join.interface,
        },
      },
    ],
  };
}

function createJoinFieldDirectiveNode(join: {
  graph?: string;
  type?: string;
  override?: string;
  usedOverridden?: boolean;
  external?: boolean;
  provides?: string;
  requires?: string;
}): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'join__field',
    },
    arguments: [
      join.graph
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'graph',
            },
            value: {
              kind: Kind.ENUM,
              value: join.graph,
            },
          } as const)
        : null,
      join.type
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'type',
            },
            value: {
              kind: Kind.STRING,
              value: join.type,
            },
          } as const)
        : null,
      join.override
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'override',
            },
            value: {
              kind: Kind.STRING,
              value: join.override,
            },
          } as const)
        : null,
      join.usedOverridden
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'usedOverridden',
            },
            value: {
              kind: Kind.BOOLEAN,
              value: true,
            },
          } as const)
        : null,
      join.external
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'external',
            },
            value: {
              kind: Kind.BOOLEAN,
              value: true,
            },
          } as const)
        : null,
      join.provides
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'provides',
            },
            value: {
              kind: Kind.STRING,
              value: join.provides,
            },
          } as const)
        : null,
      join.requires
        ? ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: 'requires',
            },
            value: {
              kind: Kind.STRING,
              value: join.requires,
            },
          } as const)
        : null,
    ].filter(nonEmpty),
  };
}

function createJoinUnionMemberDirectiveNode(join: {
  graph: string;
  member: string;
}): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'join__unionMember',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'graph',
        },
        value: {
          kind: Kind.ENUM,
          value: join.graph,
        },
      },
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'member',
        },
        value: {
          kind: Kind.STRING,
          value: join.member,
        },
      },
    ],
  };
}

function createJoinEnumValueDirectiveNode(join: { graph: string }): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'join__enumValue',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'graph',
        },
        value: {
          kind: Kind.ENUM,
          value: join.graph,
        },
      },
    ],
  };
}

function createInaccessibleDirectiveNode(): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'inaccessible',
    },
    arguments: [],
  };
}

function createAuthenticatedDirectiveNode(): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'authenticated',
    },
    arguments: [],
  };
}

function deduplicatePoliciesOrScopes(items: string[][]) {
  const stringified = items.map(group => group.sort().join('ɵ'));
  const indexesToRemove: number[] = [];

  for (let index = 0; index < stringified.length; index++) {
    if (stringified.indexOf(stringified[index]) !== index) {
      indexesToRemove.push(index);
    }
  }
  return items.filter((_, index) => !indexesToRemove.includes(index));
}

function createPolicyDirectiveNode(policies: string[][]): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'policy',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'policies',
        },
        value: {
          kind: Kind.LIST,
          values: deduplicatePoliciesOrScopes(policies).map(
            group =>
              ({
                kind: Kind.LIST,
                values: group.map(
                  policy =>
                    ({
                      kind: Kind.STRING,
                      value: policy,
                    }) as ConstValueNode,
                ),
              }) as ConstValueNode,
          ),
        },
      },
    ],
  };
}

function createRequiresScopesDirectiveNode(scopes: string[][]): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'requiresScopes',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'scopes',
        },
        value: {
          kind: Kind.LIST,
          values: deduplicatePoliciesOrScopes(scopes).map(
            group =>
              ({
                kind: Kind.LIST,
                values: group.map(
                  scope =>
                    ({
                      kind: Kind.STRING,
                      value: scope,
                    }) as ConstValueNode,
                ),
              }) as ConstValueNode,
          ),
        },
      },
    ],
  };
}

function createTagDirectiveNode(name: string): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'tag',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'name',
        },
        value: {
          kind: Kind.STRING,
          value: name,
        },
      },
    ],
  };
}

function createJoinGraphDirectiveNode(join: { name: string; url?: string }): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'join__graph',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'name',
        },
        value: {
          kind: Kind.STRING,
          value: join.name,
        },
      },
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'url',
        },
        value: {
          kind: Kind.STRING,
          value: join.url ?? '',
        },
      },
    ],
  };
}

function createDescriptionNode(description: { value: string; block: boolean }): StringValueNode {
  return {
    kind: Kind.STRING,
    value: description.value,
    block: true, // use `true` instead of the value of `description.block`, because the supergraph sdl produced by @apollo/composition has always `block: true`
  };
}

function createDeprecatedDirectiveNode(deprecated: Deprecated): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'deprecated',
    },
    arguments:
      typeof deprecated.reason === 'string'
        ? [
            {
              kind: Kind.ARGUMENT,
              name: {
                kind: Kind.NAME,
                value: 'reason',
              },
              value: {
                kind: Kind.STRING,
                value: deprecated.reason,
              },
            },
          ]
        : [],
  };
}

function createSpecifiedByDirectiveNode(url: string): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'specifiedBy',
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'url',
        },
        value: {
          kind: Kind.STRING,
          value: url,
        },
      },
    ],
  };
}

function createCostDirectiveNode(input: {
  cost: number;
  directiveName: string;
}): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: input.directiveName,
    },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'weight',
        },
        value: {
          kind: Kind.INT,
          value: String(input.cost),
        },
      } as const,
    ],
  };
}

function createListSizeDirectiveNode(input: {
  assumedSize: number | null;
  slicingArguments: string[] | null;
  sizedFields: string[] | null;
  requireOneSlicingArgument: boolean;
  directiveName: string;
}): ConstDirectiveNode {
  const args: ConstArgumentNode[] = [];

  if (input.requireOneSlicingArgument === false) {
    args.push({
      kind: Kind.ARGUMENT,
      name: {
        kind: Kind.NAME,
        value: 'requireOneSlicingArgument',
      },
      value: {
        kind: Kind.BOOLEAN,
        value: false,
      },
    });
  }

  if (typeof input.assumedSize === 'number') {
    args.push({
      kind: Kind.ARGUMENT,
      name: {
        kind: Kind.NAME,
        value: 'assumedSize',
      },
      value: {
        kind: Kind.INT,
        value: String(input.assumedSize),
      },
    });
  }

  if (Array.isArray(input.slicingArguments)) {
    args.push({
      kind: Kind.ARGUMENT,
      name: {
        kind: Kind.NAME,
        value: 'slicingArguments',
      },
      value: {
        kind: Kind.LIST,
        values: input.slicingArguments.map(arg => ({
          kind: Kind.STRING,
          value: arg,
        })),
      },
    });
  }

  if (Array.isArray(input.sizedFields)) {
    args.push({
      kind: Kind.ARGUMENT,
      name: {
        kind: Kind.NAME,
        value: 'sizedFields',
      },
      value: {
        kind: Kind.LIST,
        values: input.sizedFields.map(arg => ({
          kind: Kind.STRING,
          value: arg,
          block: false,
        })),
      },
    });
  }

  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: input.directiveName,
    },
    arguments: args,
  };
}

function createLinkDirectiveNode(link: {
  url: string;
  import?: Array<{
    name: string;
    alias?: string;
  }>;
  for?: string;
}): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: 'link',
    },
    arguments: ([] as ConstArgumentNode[]).concat(
      [
        {
          kind: Kind.ARGUMENT,
          name: {
            kind: Kind.NAME,
            value: 'url',
          },
          value: {
            kind: Kind.STRING,
            value: link.url,
          },
        },
      ],
      link.for
        ? [
            {
              kind: Kind.ARGUMENT,
              name: {
                kind: Kind.NAME,
                value: 'for',
              },
              value: {
                kind: Kind.ENUM,
                value: link.for,
              },
            },
          ]
        : [],
      link.import
        ? [
            {
              kind: Kind.ARGUMENT,
              name: {
                kind: Kind.NAME,
                value: 'import',
              },
              value: {
                kind: Kind.LIST,
                values: link.import.map(imported => {
                  if (imported.alias) {
                    return {
                      kind: Kind.OBJECT,
                      fields: [
                        {
                          kind: Kind.OBJECT_FIELD,
                          name: {
                            kind: Kind.NAME,
                            value: 'name',
                          },
                          value: {
                            kind: Kind.STRING,
                            value: imported.name,
                          },
                        },
                      ],
                    };
                  }

                  return {
                    kind: Kind.STRING,
                    value: imported.name,
                  };
                }),
              },
            },
          ]
        : [],
    ),
  };
}

function createNamedTypeNode(name: string): NamedTypeNode {
  return {
    kind: Kind.NAMED_TYPE,
    name: {
      kind: Kind.NAME,
      value: name,
    },
  };
}

function applyDirectives(common: {
  ast?: {
    directives?: ConstDirectiveNode[];
  };
  join?: {
    type?: JoinTypeAST[];
    implements?: JoinImplementsAST[];
    field?: JoinFieldAST[];
    unionMember?: JoinUnionMemberAST[];
    enumValue?: JoinEnumValueAST[];
  };
  deprecated?: Deprecated;
  specifiedBy?: string;
  tags?: string[];
  inaccessible?: boolean;
  authenticated?: boolean;
  policies?: string[][];
  scopes?: string[][];
  cost?: Cost | null;
  listSize?: ListSize | null;
}) {
  const deduplicatedDirectives = (common.ast?.directives ?? [])
    .map(directive => {
      return {
        ast: directive,
        string: print(directive),
      };
    })
    .filter((directive, index, all) => all.findIndex(d => d.string === directive.string) === index)
    .map(d => d.ast);

  return ([] as ConstDirectiveNode[]).concat(
    deduplicatedDirectives,
    common.join?.type?.map(createJoinTypeDirectiveNode) ?? [],
    common.join?.implements?.map(createJoinImplementsDirectiveNode) ?? [],
    common.join?.field?.map(createJoinFieldDirectiveNode) ?? [],
    common.join?.unionMember?.map(createJoinUnionMemberDirectiveNode) ?? [],
    common.join?.enumValue?.map(createJoinEnumValueDirectiveNode) ?? [],
    common.tags?.map(createTagDirectiveNode) ?? [],
    common.inaccessible ? [createInaccessibleDirectiveNode()] : [],
    common.authenticated ? [createAuthenticatedDirectiveNode()] : [],
    common.policies?.length ? [createPolicyDirectiveNode(common.policies)] : [],
    common.scopes?.length ? [createRequiresScopesDirectiveNode(common.scopes)] : [],
    common.cost ? [createCostDirectiveNode(common.cost)] : [],
    common.listSize ? [createListSizeDirectiveNode(common.listSize)] : [],
    common.deprecated ? [createDeprecatedDirectiveNode(common.deprecated)] : [],
    common.specifiedBy ? [createSpecifiedByDirectiveNode(common.specifiedBy)] : [],
  );
}

function nonEmpty<T>(value: T | null | undefined): value is T {
  return value != null;
}

const buildInDirectives = new Set(specifiedDirectives.map(directive => directive.name));

function isBuiltInDirective(directiveName: string) {
  return buildInDirectives.has(directiveName);
}

function isFederationDirective(name: string) {
  return (
    name === 'tag' || name === 'link' || name.startsWith('join__') || name.startsWith('link__')
  );
}

function isFederationEnum(name: string) {
  return name.startsWith('join__') || name.startsWith('link__');
}

function isFederationScalar(name: string) {
  return name.startsWith('join__') || name.startsWith('link__');
}

export function schemaCoordinate(
  paths: readonly (string | number)[],
  nodes: readonly (ASTNode | readonly ASTNode[])[],
): string {
  let coordinate = '';
  for (let i = 0; i < Math.max(paths.length, nodes.length); i++) {
    const prop = paths[i];
    const current = nodes[i];

    if (typeof prop === 'number' && Array.isArray(current)) {
      const node = current[prop];

      if (coordinate.length > 0) {
        coordinate = coordinate + '.' + node.name.value;
      } else {
        coordinate = node.name.value;
      }
    }
  }

  return coordinate;
}

// Removes Federation stuff from the supergraph
// It's safe to look for link__ and join__ prefixes as Federation v2 does not allow to define type names that start with these prefixes
export function stripFederation(supergraph: DocumentNode): DocumentNode {
  const inaccessible = new Set<string>();
  const documentWithoutFederation = visit(
    supergraph,
    visitInParallel([
      {
        DirectiveDefinition(node) {
          if (isBuiltInDirective(node.name.value) || isFederationDirective(node.name.value)) {
            return null;
          }
        },
        Directive(node) {
          if (isBuiltInDirective(node.name.value) || isFederationDirective(node.name.value)) {
            return null;
          }
        },
        EnumTypeDefinition(node) {
          if (isFederationEnum(node.name.value)) {
            return null;
          }
        },
        ScalarTypeDefinition(node) {
          if (isFederationScalar(node.name.value)) {
            return null;
          }
        },
      },
      {
        Directive(directive, _, __, paths, nodes) {
          if (directive.name.value === 'inaccessible') {
            inaccessible.add(schemaCoordinate(paths, nodes));
          }
        },
      },
    ]),
  );

  // No need to remove inaccessible types as they are not included in the schema
  if (inaccessible.size === 0) {
    return documentWithoutFederation;
  }

  function hideByNodeName(node: {
    name: {
      value: string;
    };
  }) {
    if (inaccessible.has(node.name.value)) {
      return null;
    }
  }

  function hideObjectOrInterface<
    T extends {
      name: {
        value: string;
      };
      interfaces?: ReadonlyArray<{
        name: {
          value: string;
        };
      }>;
    },
  >(node: T): T | null | void {
    if (inaccessible.has(node.name.value)) {
      return null;
    }

    const inaccessibleInterfaces = node.interfaces?.filter(i => inaccessible.has(i.name.value));

    if (inaccessibleInterfaces?.length) {
      return {
        ...node,
        interfaces: node.interfaces?.filter(i => !inaccessible.has(i.name.value)),
      };
    }
  }

  function hideField(
    node: FieldDefinitionNode | InputValueDefinitionNode,
    _: unknown,
    __: unknown,
    paths: ReadonlyArray<string | number>,
    nodes: readonly (ASTNode | readonly ASTNode[])[],
  ) {
    if (
      // TODO: check why we need to add `node.name.value` here
      inaccessible.has(schemaCoordinate(paths, nodes) + '.' + node.name.value)
    ) {
      return null;
    }

    if (inaccessible.has(namedTypeFromTypeNode(node.type).name.value)) {
      return null;
    }
  }

  // Remove inaccessible parts of schema.
  // This is done in two phases:
  // - the first phase detects @inaccessible directives and creates a set of schema coordinates (already done at this point).
  // - the second phase removes inaccessible bits from the schema
  //
  // This algorithm assumes that a type with all its fields inaccessible is annotated with the @inaccessible directive (this needs to be enforced by the supergraph composition logic),
  // otherwise some pieces of the schema may be left behind.
  return visit(documentWithoutFederation, {
    // Type definitions
    ObjectTypeDefinition: hideObjectOrInterface,
    InterfaceTypeDefinition: hideObjectOrInterface,
    InputObjectTypeDefinition: hideByNodeName,
    EnumTypeDefinition: hideByNodeName,
    UnionTypeDefinition: hideByNodeName,
    ScalarTypeDefinition: hideByNodeName,
    FieldDefinition: hideField,
    InputValueDefinition: hideField,
    EnumValueDefinition(node, _, __, paths, nodes) {
      if (inaccessible.has(schemaCoordinate(paths, nodes) + '.' + node.name.value)) {
        return null;
      }
    },
  });
}

function namedTypeFromTypeNode(type: TypeNode): NamedTypeNode {
  if (type.kind === Kind.NAMED_TYPE) {
    return type;
  }

  if (type.kind === Kind.LIST_TYPE) {
    return namedTypeFromTypeNode(type.type);
  }

  if (type.kind === Kind.NON_NULL_TYPE) {
    return namedTypeFromTypeNode(type.type);
  }

  throw new Error('Unknown type node: ' + type);
}
