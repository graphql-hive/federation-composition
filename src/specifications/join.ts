import { satisfiesVersionRange } from '../utils/version.js';
import type { FederationVersion } from './federation.js';

export const sdl = (version: FederationVersion) => {
  const joinField = /* GraphQL */ `
      directive @join__field(
        graph: join__Graph
        requires: join__FieldSet
        provides: join__FieldSet
        type: String
        external: Boolean
        override: String
        usedOverridden: Boolean
        ${satisfiesVersionRange(version, '>= v2.7') ? 'overrideLabel: String' : ''}
        ${satisfiesVersionRange(version, '>= v2.8') ? 'contextArguments: [join__ContextArgument!]' : ''}
      ) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
    `;

  const joinContextArgument = satisfiesVersionRange(version, '>= v2.8')
    ? /* GraphQL */ `
        input join__ContextArgument {
          name: String!
          type: String!
          context: String!
          selection: join__FieldValue!
        }
      `
    : '';

  const joinFieldValue = satisfiesVersionRange(version, '>= v2.8')
    ? /* GraphQL */ `
        scalar join__FieldValue
      `
    : '';

  return /* GraphQL */ `
    directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

    directive @join__graph(name: String!, url: String!) on ENUM_VALUE

    ${joinField}
    ${joinContextArgument}

    directive @join__implements(
      graph: join__Graph!
      interface: String!
    ) repeatable on OBJECT | INTERFACE

    directive @join__type(
      graph: join__Graph!
      key: join__FieldSet
      extension: Boolean! = false
      resolvable: Boolean! = true
      isInterfaceObject: Boolean! = false
    ) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

    directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

    scalar join__FieldSet
    ${joinFieldValue}
  `;
};
