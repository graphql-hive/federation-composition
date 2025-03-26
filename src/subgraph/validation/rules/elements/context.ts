import { ASTVisitor, GraphQLError } from 'graphql';
import type { SubgraphValidationContext } from '../../validation-context.js';

export function ContextDirectiveRules(context: SubgraphValidationContext): ASTVisitor {
  if (context.satisfiesVersionRange('>= v2.8')) {
    if (context.federationImports.some(i => i.name === '@context' && i.kind === 'directive')) {
      context.reportError(
        new GraphQLError('@context directive is not yet supported.', {
          extensions: {
            code: 'UNSUPPORTED_FEATURE',
          },
        }),
      );
    }
  }

  return {};
}
