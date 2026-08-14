import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessContributors } from './HarnessContributors.ts';
import { HarnessGraph } from '../graph/HarnessGraph.ts';

function plantedRoot(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-contrib-'));
  mkdirSync(join(fixtureRoot, '.invar', 'harness'), { recursive: true });
  return fixtureRoot;
}

function writeContributor(
  fixtureRoot: string,
  fileName: string,
  body: string,
): void {
  writeFileSync(join(fixtureRoot, '.invar', 'harness', fileName), body);
}

test('a valid contributor mounts and resolves through the graph', async () => {
  const fixtureRoot = plantedRoot();
  try {
    writeContributor(
      fixtureRoot,
      'cargo.harness.ts',
      `export default {
  name: 'cargo',
  contractVersion: 1,
  node: (context) => ({ crateCount: 7, root: context.rootDirectory }),
};
`,
    );
    const loaded = await HarnessContributors.Class.load(fixtureRoot, ['tasks']);
    expect(loaded.problems).toHaveLength(0);
    expect(Object.keys(loaded.mounted)).toEqual(['cargo']);
    const graph = new HarnessGraph.Class({
      rootDirectory: fixtureRoot,
      contributed: loaded.mounted,
    });
    expect(graph.resolve('cargo.crateCount')).toBe(7);
    expect(graph.rootNamespace()).toContain('cargo');
    expect(() => graph.resolve('cargo.nope')).toThrow(/crateCount/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a version-skewed contributor is skipped loudly, host survives', async () => {
  const fixtureRoot = plantedRoot();
  try {
    writeContributor(
      fixtureRoot,
      'old.harness.ts',
      `export default { name: 'old', contractVersion: 999, node: () => ({}) };
`,
    );
    const loaded = await HarnessContributors.Class.load(fixtureRoot, []);
    expect(Object.keys(loaded.mounted)).toHaveLength(0);
    expect(loaded.problems[0]).toContain('contract version 999');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a name collision with a core domain is refused loudly', async () => {
  const fixtureRoot = plantedRoot();
  try {
    writeContributor(
      fixtureRoot,
      'tasks.harness.ts',
      `export default { name: 'tasks', contractVersion: 1, node: () => ({}) };
`,
    );
    const loaded = await HarnessContributors.Class.load(fixtureRoot, ['tasks']);
    expect(Object.keys(loaded.mounted)).toHaveLength(0);
    expect(loaded.problems[0]).toContain('collides');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a broken contributor never breaks the host', async () => {
  const fixtureRoot = plantedRoot();
  try {
    writeContributor(
      fixtureRoot,
      'broken.harness.ts',
      'this is not typescript {{{',
    );
    writeContributor(
      fixtureRoot,
      'shapeless.harness.ts',
      `export default { notAContributor: true };
`,
    );
    const loaded = await HarnessContributors.Class.load(fixtureRoot, []);
    expect(Object.keys(loaded.mounted)).toHaveLength(0);
    expect(loaded.problems).toHaveLength(2);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a repo without a harness directory contributes nothing, silently', async () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'harness-contrib-empty-'));
  try {
    const loaded = await HarnessContributors.Class.load(emptyRoot, []);
    expect(Object.keys(loaded.mounted)).toHaveLength(0);
    expect(loaded.problems).toHaveLength(0);
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});
