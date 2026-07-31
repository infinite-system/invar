/**
 * Serve the Invariance Field as a standalone local development tool.
 *
 * Run: bun tools/invariant-field-v2/server.ts
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
import { CodeLens } from './CodeLens';
import { DesignTokens } from './DesignTokens';
import { VueSingleFileComponentPlugin } from './VueSingleFileComponentPlugin';
import type { InvariantFieldStore } from './types';

const repositoryRoot = repositoryRootFromCurrentDirectory(process.cwd());
const toolRoot = join(repositoryRoot, 'tools/invariant-field-v2');
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
const allowedCodeLensCommits = new Set(
  store.snapshots.map((snapshot) => snapshot.commit),
);
const currentCommit = store.snapshots.at(-1)?.commit;
if (!currentCommit) {
  throw new Error('The Invariant Field store contains no snapshots.');
}
const frontendBuild = await Bun.build({
  entrypoints: [join(toolRoot, 'app.ts')],
  target: 'browser',
  format: 'esm',
  minify: false,
  sourcemap: 'inline',
  plugins: [VueSingleFileComponentPlugin.Class.create()],
});
if (!frontendBuild.success) {
  throw new Error(
    `The Invariant Field frontend build failed:\n${frontendBuild.logs.map(String).join('\n')}`,
  );
}
const frontendJavascript = frontendBuild.outputs.find((output) =>
  output.path.endsWith('.js'),
);
if (!frontendJavascript) {
  throw new Error('The Invariant Field frontend build emitted no JavaScript.');
}
const frontendStylesheet =
  DesignTokens.Class.stylesheet() +
  readFileSync(join(toolRoot, 'styles.css'), 'utf8');
const invariantFieldPage = readFileSync(join(toolRoot, 'index.html'), 'utf8');
const portArgument = process.argv.find((argument) =>
  argument.startsWith('--port='),
);
const port = Number(portArgument?.slice('--port='.length) ?? 4314);

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

const hostArgument = process.argv.find((argument) =>
  argument.startsWith('--host='),
);
const hostname = hostArgument
  ? hostArgument.slice('--host='.length)
  : 'localhost';

const server = Bun.serve({
  port,
  hostname,
  routes: {
    '/': () =>
      new Response(invariantFieldPage, {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
        },
      }),
    '/assets/invariant-field.js': () =>
      new Response(frontendJavascript, {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/javascript; charset=utf-8',
        },
      }),
    '/assets/styles.css': () =>
      new Response(frontendStylesheet, {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/css; charset=utf-8',
        },
      }),
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
    if (url.pathname === '/api/code') {
      return CodeLens.Class.response(request, {
        repositoryRoot,
        currentCommit,
        allowedCommits: allowedCodeLensCommits,
      });
    }
    const snapshotMatch = /^\/api\/snapshots\/(\d+)$/.exec(url.pathname);
    if (snapshotMatch) return snapshotResponse(Number(snapshotMatch[1]));
    return new Response('File not found.', { status: 404 });
  },
});

console.log(`Invariant Field: ${server.url}`);
