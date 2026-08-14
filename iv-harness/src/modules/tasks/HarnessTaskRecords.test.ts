import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessTaskRecords } from './HarnessTaskRecords.ts';

function plantedRoot(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-task-records-'));
  const taskDirectory = join(
    fixtureRoot,
    '.invar',
    'tasks',
    'in-progress',
    '901-planted-task-fixture',
  );
  mkdirSync(taskDirectory, { recursive: true });
  writeFileSync(
    join(taskDirectory, 'task-901-planted-task-fixture.md'),
    '# 901\n\nPriority: flake-evidence\nState: ACTIVE\nEngine: codex\n',
  );
  writeFileSync(join(taskDirectory, 'steers.log'), 'first steer\n');
  writeFileSync(join(taskDirectory, 'meta.json'), '{"round": 3}\n');
  return fixtureRoot;
}

test('a planted task folder becomes a full node', () => {
  const fixtureRoot = plantedRoot();
  try {
    const tasks = HarnessTaskRecords.Class.listTasks(fixtureRoot);
    expect(tasks).toHaveLength(1);
    const node = tasks[0]!;
    expect(node.number).toBe(901);
    expect(node.state).toBe('in-progress');
    expect(node.priority).toBe('flake-evidence');
    expect(node.engine).toBe('codex');
    expect(node.steerCount).toBe(1);
    expect(node.lastSteer).toBe('first steer');
    expect(node.hasReport).toBe(false);
    expect((node.meta as Record<string, unknown>)['round']).toBe(3);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('an empty root lists zero tasks without error', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'harness-task-empty-'));
  try {
    expect(HarnessTaskRecords.Class.listTasks(emptyRoot)).toHaveLength(0);
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test('a folder without a number prefix is skipped, not crashed on', () => {
  const fixtureRoot = plantedRoot();
  try {
    mkdirSync(join(fixtureRoot, '.invar', 'tasks', 'active', 'not-a-task'), {
      recursive: true,
    });
    const tasks = HarnessTaskRecords.Class.listTasks(fixtureRoot);
    expect(tasks).toHaveLength(1);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
