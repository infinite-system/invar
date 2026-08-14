import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessGraph } from './HarnessGraph.ts';

function plantedGraph(
  fixtureRoot: string,
): InstanceType<typeof HarnessGraph.Class> {
  const taskDirectory = join(
    fixtureRoot,
    '.invar',
    'tasks',
    'active',
    '990003-planted-graph-fixture',
  );
  mkdirSync(taskDirectory, { recursive: true });
  writeFileSync(
    join(taskDirectory, 'task-990003-planted-graph-fixture.md'),
    '# 990003\n\nPriority: user-directed\nState: ACTIVE\n',
  );
  const gateLog = join(fixtureRoot, 'gate.log');
  writeFileSync(gateLog, 'GATE_EXIT=0\n');
  const registry = join(fixtureRoot, 'registry');
  writeFileSync(registry, `${gateLog}\n`);
  const heartbeat = join(fixtureRoot, 'heartbeat');
  writeFileSync(heartbeat, 'alive\n');
  return new HarnessGraph.Class({
    rootDirectory: fixtureRoot,
    gatesRegistryPath: registry,
    heartbeatPath: heartbeat,
  });
}

test('dotted paths resolve across every domain', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-graph-'));
  try {
    const graph = plantedGraph(fixtureRoot);
    expect(
      (graph.resolve('tasks.counts') as Record<string, number>)['active'],
    ).toBe(1);
    expect(
      (graph.resolve('tasks.byNumber.990003') as Record<string, unknown>)[
        'priority'
      ],
    ).toBe('user-directed');
    expect(
      (graph.resolve('gates.last') as Record<string, unknown>)['verdict'],
    ).toBe('green');
    expect(
      (graph.resolve('fleet.heartbeat') as Record<string, unknown>)['fresh'],
    ).toBe(true);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a miss is loud and names the addressable keys', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-graph-miss-'));
  try {
    const graph = plantedGraph(fixtureRoot);
    expect(() => graph.resolve('tasks.nonsense')).toThrow(/counts/);
    expect(() => graph.resolve('nowhere')).toThrow(/tasks/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('the empty path returns the root namespace', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-graph-root-'));
  try {
    const graph = plantedGraph(fixtureRoot);
    expect(graph.resolve('')).toContain('tasks');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a near-miss path suggests the intended key', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-graph-suggest-'));
  try {
    const graph = plantedGraph(fixtureRoot);
    expect(() => graph.resolve('tasks.count')).toThrow(
      /Did you mean 'tasks\.counts'\?/,
    );
    expect(() => graph.resolve('task')).toThrow(/Did you mean 'tasks'\?/);
    expect(() => graph.resolve('gates.lst')).toThrow(
      /Did you mean 'gates\.last'\?/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a far miss offers no suggestion but still lists keys', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-graph-nosuggest-'));
  try {
    const graph = plantedGraph(fixtureRoot);
    let message = '';
    try {
      graph.resolve('tasks.zzzqqq');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('Did you mean');
    expect(message).toContain('counts');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
