import {
  DirectiveDefinitionNode,
  DocumentNode,
  GraphQLError,
  Kind,
  NameNode,
  parse,
  specifiedDirectives,
  specifiedScalarTypes,
  TypeDefinitionNode,
  TypeNode,
} from 'graphql';
import { print } from '../graphql/printer.js';
import { directive as inaccessibleDirective } from './inaccessible.js';
import { Link, LinkImport, parseLink } from './link.js';
import { directive as tagDirective } from './tag.js';

export type FederationVersion = keyof typeof federationSpecFactory;
// new type for imports (trkohler)
export type FederationImports = readonly LinkImport[];

export function isFederationVersion(version: string): version is FederationVersion {
  return version in federationSpecFactory;
}

export function createSpecSchema<T extends FederationVersion & string>(
  version: T,
  imports?: readonly LinkImport[],
) {
  if (!isFederationVersion(version)) {
    throw new GraphQLError(
      `Invalid version ${version} for the federation feature in @link directive on schema`,
      {
        extensions: {
          code: 'UNKNOWN_FEDERATION_LINK_VERSION',
        },
      },
    );
  }

  if (version !== 'v1.0') {
    const spec = federationSpecFactory[version]('', imports);
    const namespacedSpec = federationSpecFactory[version]('federation__');

    return {
      directives: spec.directives.concat(namespacedSpec.directives),
      types: spec.types.concat(namespacedSpec.types),
    };
  }

  const spec = federationSpecFactory[version]('');

  return {
    directives: spec.directives.concat([tagDirective, inaccessibleDirective]),
    types: spec.types,
  };
}

// TODO: T02 Support aliasing of Federation directives
const federationSpecFactory = {
  'v1.0': (prefix: string) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @key(
          fields: _FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
        directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
        directive @external on OBJECT | FIELD_DEFINITION
        directive @extends on OBJECT | INTERFACE
        # @override is not supported in v1 but somehow it's supported by Apollo Composition
        directive @override(from: String!) on FIELD_DEFINITION
        scalar _FieldSet
      `,
      prefix,
    ),
  'v2.0': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @external on OBJECT | FIELD_DEFINITION
        directive @shareable on FIELD_DEFINITION | OBJECT
        directive @extends on OBJECT | INTERFACE
        directive @override(from: String!) on FIELD_DEFINITION
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        scalar FieldSet
      `,
      prefix,
      imports,
    ),
  'v2.1': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @override(from: String!) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        scalar FieldSet
      `,
      prefix,
      imports,
    ),
  'v2.2': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @override(from: String!) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable repeatable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        scalar FieldSet
      `,
      prefix,
      imports,
    ),
  'v2.3': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @interfaceObject on OBJECT
        directive @override(from: String!) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable repeatable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        scalar FieldSet
      `,
      prefix,
      imports,
    ),
  'v2.4': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @interfaceObject on OBJECT
        directive @override(from: String!) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable repeatable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        scalar FieldSet
      `,
      prefix,
      imports,
    ),
  'v2.5': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @requiresScopes(
          scopes: [[Scope!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @interfaceObject on OBJECT
        directive @override(from: String!) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable repeatable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        scalar FieldSet
        scalar Scope
      `,
      prefix,
      imports,
    ),
  'v2.6': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @policy(
          policies: [[federation__Policy!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @requiresScopes(
          scopes: [[federation__Scope!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @interfaceObject on OBJECT
        directive @override(from: String!) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable repeatable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        scalar FieldSet
        scalar federation__Policy
        scalar federation__Scope
      `,
      prefix,
      imports,
    ),
  'v2.7': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @policy(
          policies: [[federation__Policy!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @requiresScopes(
          scopes: [[federation__Scope!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @interfaceObject on OBJECT
        directive @override(from: String!, label: String) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable repeatable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        scalar FieldSet
        scalar federation__Policy
        scalar federation__Scope
      `,
      prefix,
      imports,
    ),
  // TODO: Implement @context and @fromContext from v2.8
  'v2.8': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @policy(
          policies: [[federation__Policy!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @requiresScopes(
          scopes: [[federation__Scope!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @interfaceObject on OBJECT
        directive @override(from: String!, label: String) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable repeatable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        directive @cost(
          weight: Int!
        ) on ARGUMENT_DEFINITION | ENUM | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | OBJECT | SCALAR
        directive @listSize(
          assumedSize: Int
          slicingArguments: [String!]
          sizedFields: [String!]
          requireOneSlicingArgument: Boolean = true
        ) on FIELD_DEFINITION
        directive @context(name: String!) repeatable on INTERFACE | OBJECT | UNION
        directive @fromContext(field: federation__ContextFieldValue) on ARGUMENT_DEFINITION
        scalar FieldSet
        scalar federation__Policy
        scalar federation__Scope
        scalar federation__ContextFieldValue
      `,
      prefix,
      imports,
    ),
  // TODO: Add @context and @fromContext from v2.8
  'v2.9': (prefix: string, imports?: readonly LinkImport[]) =>
    createTypeDefinitions(
      /* GraphQL */ `
        directive @policy(
          policies: [[federation__Policy!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @requiresScopes(
          scopes: [[federation__Scope!]!]!
        ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
        directive @composeDirective(name: String!) repeatable on SCHEMA
        directive @extends on OBJECT | INTERFACE
        directive @external on OBJECT | FIELD_DEFINITION
        directive @key(
          fields: FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE
        directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ENUM | ENUM_VALUE | SCALAR | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ARGUMENT_DEFINITION
        directive @interfaceObject on OBJECT
        directive @override(from: String!, label: String) on FIELD_DEFINITION
        directive @provides(fields: FieldSet!) on FIELD_DEFINITION
        directive @requires(fields: FieldSet!) on FIELD_DEFINITION
        directive @shareable repeatable on FIELD_DEFINITION | OBJECT
        directive @tag(
          name: String!
        ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
        directive @cost(
          weight: Int!
        ) on ARGUMENT_DEFINITION | ENUM | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | OBJECT | SCALAR
        directive @listSize(
          assumedSize: Int
          slicingArguments: [String!]
          sizedFields: [String!]
          requireOneSlicingArgument: Boolean = true
        ) on FIELD_DEFINITION
        directive @context(name: String!) repeatable on INTERFACE | OBJECT | UNION
        directive @fromContext(field: federation__ContextFieldValue) on ARGUMENT_DEFINITION
        scalar FieldSet
        scalar federation__Policy
        scalar federation__Scope
        scalar federation__ContextFieldValue
      `,
      prefix,
      imports,
    ),
};

export function getLatestFederationVersion() {
  return Object.keys(federationSpecFactory).sort().pop() as FederationVersion;
}

// TODO: T03 support prefixes (imports could have them) of Federation directives
function createTypeDefinitions(doc: string, prefix: string, imports?: readonly LinkImport[]) {
  const shouldFilter = !!imports;
  const toInclude = new Set(imports?.map(i => i.name.replace(/^@/, '')));
  const docAST = parse(doc, {
    noLocation: true,
  });

  // TODO: this is a hack to make sure we include FieldSet if we include any of the other directives
  // we do it differently, but only in next iterations.
  if (
    !imports?.length ||
    toInclude.has('key') ||
    toInclude.has('requires') ||
    toInclude.has('provides')
  ) {
    toInclude.add('FieldSet');
    toInclude.add('federation__FieldSet');
  }

  if (toInclude.has('requiresScopes')) {
    toInclude.add('federation__Scope');
  }

  if (toInclude.has('policy')) {
    toInclude.add('federation__Policy');
  }

  const directives: DirectiveDefinitionNode[] = [];
  const types: TypeDefinitionNode[] = [];

  for (const node of docAST.definitions) {
    if (isDirectiveDefinitionNode(node)) {
      directives.push(applyPrefix(node, prefix));
    } else {
      types.push(applyPrefix(node as TypeDefinitionNode, prefix));
    }
  }

  return {
    directives: directives.filter(
      d =>
        !specifiedDirectives.some(sd => sd.name === d.name.value) &&
        (!shouldFilter || toInclude.has(d.name.value)),
    ),
    types: types.filter(t => toInclude.has(t.name.value)),
  };
}

function isDirectiveDefinitionNode(node: any): node is DirectiveDefinitionNode {
  return node.kind === Kind.DIRECTIVE_DEFINITION;
}

function applyPrefix<T extends TypeDefinitionNode | DirectiveDefinitionNode>(
  node: T,
  prefix: string,
): T {
  if (prefix.length === 0) {
    return node;
  }

  (node.name as any).value = `${prefix}${node.name.value}`;

  if (isDirectiveDefinitionNode(node)) {
    node.arguments?.forEach(arg => {
      const nameNode = resolveNamedType(arg.type);

      // apply prefix to arguments with non-standard scalars (FieldSet -> PrefixFieldSet but not String -> PrefixString)
      if (!specifiedScalarTypes.some(t => t.name === nameNode.value)) {
        (nameNode as any).value = `${prefix}${nameNode.value}`;
      }
    });
  }

  return node;
}

function resolveNamedType(node: TypeNode): NameNode {
  if (node.kind === Kind.LIST_TYPE) {
    return resolveNamedType(node.type);
  }

  if (node.kind === Kind.NON_NULL_TYPE) {
    return resolveNamedType(node.type);
  }

  return node.name;
}

export function isFederationLink(link: Link): boolean {
  return link.identity === 'https://specs.apollo.dev/federation';
}

export function detectFederationVersion(typeDefs: DocumentNode) {
  for (const definition of typeDefs.definitions) {
    if (definition.kind === Kind.SCHEMA_EXTENSION || definition.kind === Kind.SCHEMA_DEFINITION) {
      const links = definition.directives?.filter(directive => directive.name.value === 'link');

      if (links?.length) {
        const parsedLinks = links.map(l => {
          const url = l.arguments?.find(a => a.name.value === 'url');
          const importArg = l.arguments?.find(a => a.name.value === 'import');

          if (!url) {
            throw new Error('Invalid @link directive');
          }

          return parseLink(
            (url.value as any).value,
            importArg ? print(importArg.value as any) : '[]',
          );
        });

        const fedLink = parsedLinks.find(l => l.identity === 'https://specs.apollo.dev/federation');

        if (fedLink?.version) {
          if (!isFederationVersion(fedLink.version)) {
            throw new Error(`Unsupported federation version: ${fedLink.version}`);
          }

          return {
            version: fedLink.version as FederationVersion,
            imports: fedLink.imports,
          };
        }
      }
    }
  }

  return { version: 'v1.0' as FederationVersion, imports: [] };
}
