import { expect, test } from 'vitest';
import { graphql, testVersions } from '../../shared/testkit.js';

testVersions((api, version) => {
  test('DEFAULT_VALUE_USES_INACCESSIBLE', () => {
    expect(
      api.composeServices([
        {
          name: 'users',
          typeDefs: graphql`
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/${version}"
                import: ["@key", "@inaccessible"]
              )

            type Query {
              users: [User!]!
            }

            type User @key(fields: "id") {
              id: ID
              friends(type: FriendType = FAMILY): [User!]!
            }

            enum FriendType {
              FAMILY @inaccessible
              FRIEND
            }
          `,
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              `Enum value "FriendType.FAMILY" is @inaccessible but is used in the default value of "User.friends(type:)", which is in the API schema.`,
            ),
            extensions: expect.objectContaining({
              code: 'DEFAULT_VALUE_USES_INACCESSIBLE',
            }),
          }),
        ]),
      }),
    );
  });
});
