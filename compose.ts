import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DocumentNode, parse, print, Source, visit } from 'graphql';
import { composeServices as apolloComposeServices } from '@apollo/composition';
import { getSubgraphs as getDGS } from './__tests__/fixtures/dgs/index.js';
import { getSubgraphs as getHuge } from './__tests__/fixtures/huge-schema/index.js';
import { composeServices as guildComposeServices } from './src/index.js';

const args = process.argv.slice(2);
const isApollo = args.includes('apollo');
const composeServices = isApollo ? apolloComposeServices : guildComposeServices;

function fromJsonFile(filepath: string) {
  const raw = readFileSync(filepath, 'utf-8');

  const data = JSON.parse(raw) as Array<{
    name: string;
    sdl: string;
  }>;

  return data.map(d => {
    return {
      name: d.name,
      typeDefs: parse(d.sdl),
    };
  });
}

function fromDirectory(directoryName: string) {
  const filepaths = readdirSync(directoryName);
  return filepaths
    .filter(f => f.endsWith('.graphql'))
    .map(f => {
      const originalNameSourceFile = join(directoryName, f.replace('.graphql', '.log'));
      let name = basename(f).replace('.graphql', '').replace('_', '-');

      if (existsSync(originalNameSourceFile)) {
        name = readFileSync(originalNameSourceFile, 'utf-8');
      }

      const typeDefs = visit(parse(new Source(readFileSync(join(directoryName, f), 'utf-8'), f)), {
        enter(node) {
          if ('description' in node) {
            return {
              ...node,
              description: undefined,
            };
          }
        },
      });

      writeFileSync(join(directoryName, f), print(typeDefs));

      return {
        name,
        typeDefs,
      };
    });
}

let services: Array<{
  typeDefs: DocumentNode;
  name: string;
}> = [];
// services = await getDGS();
// services = await getHuge();
services = fromDirectory('./temp');

if (typeof gc === 'function') {
  gc();
}

debugger;

console.time('Total');
console.log(
  'Composing',
  services.length,
  'services using',
  isApollo ? 'Apollo' : 'Guild',
  'composition',
);
const result = composeServices(services);
console.timeEnd('Total');

debugger;

const memoryAfter = process.memoryUsage().heapUsed;

console.log('Memory:', memoryAfter / 1024 / 1024, 'MB');
const hasErrors = 'errors' in result && result.errors && result.errors.length;
console.log(hasErrors ? '❌ Failed' : '✅ Succeeded');

if (hasErrors) {
  console.log(result.errors.map(e => (e.extensions.code ?? '') + ' ' + e.message).join('\n\n'));
} else if (args.includes('--print-supergraph')) {
  console.log(result.supergraphSdl);
}
