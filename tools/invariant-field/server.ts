/**
 * Serve the Invariance Field as a standalone local development tool.
 *
 * Run: bun tools/invariant-field/server.ts
 *
 * The server builds the history store when HEAD changes. It holds no watcher
 * and starts no timer. An idle server therefore adds no recurring work.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInvariantFieldStore,
  isGeneratedStoreCurrent,
  repositoryRootFromCurrentDirectory,
} from './RepositoryHistory';
import type { InvariantFieldStore } from './types';
import invariantFieldPage from './index.html';

const repositoryRoot = repositoryRootFromCurrentDirectory(process.cwd());
const toolRoot = join(repositoryRoot, 'tools/invariant-field');
const generatedStorePath = join(toolRoot, 'generated/invariant-field.json');
const rebuildRequested = process.argv.includes('--rebuild');

async function loadStore(): Promise<InvariantFieldStore> {
  if (
    rebuildRequested ||
    !isGeneratedStoreCurrent(repositoryRoot, generatedStorePath)
  ) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(toolRoot, 'generated'), { recursive: true });
    const builtStore = buildInvariantFieldStore(repositoryRoot, (message) => {
      process.stdout.write(`${message}\r`);
    });
    process.stdout.write('\n');
    writeFileSync(generatedStorePath, `${JSON.stringify(builtStore)}\n`);
    return builtStore;
  }
  return JSON.parse(
    readFileSync(generatedStorePath, 'utf8'),
  ) as InvariantFieldStore;
}

const store = await loadStore();
const portArgument = process.argv.find((argument) =>
  argument.startsWith('--port='),
);
const port = Number(portArgument?.slice('--port='.length) ?? 4313);

function jsonResponse(value: unknown): Response {
  return Response.json(value, {
    headers: { 'cache-control': 'no-store' },
  });
}

function snapshotResponse(snapshotIndex: number): Response {
  const snapshot = store.snapshots[snapshotIndex];
  if (!snapshot) return new Response('Snapshot not found.', { status: 404 });
  return jsonResponse({
    ...snapshot,
    records: snapshot.records.map((record) => ({
      ...record,
      ...store.recordVersions[record.versionIdentifier],
    })),
  });
}

const server = Bun.serve({
  port,
  routes: {
    '/': invariantFieldPage,
    '/api/meta': () =>
      jsonResponse({
        schemaVersion: store.schemaVersion,
        checkerVersion: store.checkerVersion,
        generatedAt: store.generatedAt,
        formula: store.formula,
        snapshots: store.snapshots.map((snapshot) => ({
          commit: snapshot.commit,
          shortCommit: snapshot.shortCommit,
          committedAt: snapshot.committedAt,
          subject: snapshot.subject,
          recordCount: snapshot.records.length,
          annotationCount: snapshot.annotationCount,
          orphanCount: snapshot.orphanCount,
          parseIssueCount: snapshot.parseIssues.length,
        })),
      }),
  },
  fetch(request) {
    const url = new URL(request.url);
    const snapshotMatch = /^\/api\/snapshots\/(\d+)$/.exec(url.pathname);
    if (snapshotMatch) return snapshotResponse(Number(snapshotMatch[1]));
    return new Response('File not found.', { status: 404 });
  },
});

console.log(`Invariant Field: ${server.url}`);
