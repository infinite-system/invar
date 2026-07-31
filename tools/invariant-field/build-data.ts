/**
 * Build the Invariance Field history store from this repository.
 *
 * Run: bun tools/invariant-field/build-data.ts
 *
 * The output file contains one ranked snapshot for each first-parent commit
 * that changed a contract or lattice. A larger snapshot count means the
 * repository has more recorded contract-layer history.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  buildInvariantFieldStore,
  repositoryRootFromCurrentDirectory,
} from './RepositoryHistory';

const repositoryRoot = repositoryRootFromCurrentDirectory(process.cwd());
const outputPath = join(
  repositoryRoot,
  'tools/invariant-field/generated/invariant-field.json',
);
mkdirSync(dirname(outputPath), { recursive: true });
const store = buildInvariantFieldStore(repositoryRoot, (message) => {
  process.stdout.write(`${message}\r`);
});
process.stdout.write('\n');
writeFileSync(outputPath, `${JSON.stringify(store)}\n`);
console.log(`Wrote ${store.snapshots.length} snapshots to ${outputPath}.`);
