import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessLanes } from './HarnessLanes.ts';

function git(repositoryDirectory: string, gitArguments: string[]): void {
  execFileSync('git', ['-C', repositoryDirectory, ...gitArguments], {
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'lanes-test',
      GIT_AUTHOR_EMAIL: 'lanes@test',
      GIT_COMMITTER_NAME: 'lanes-test',
      GIT_COMMITTER_EMAIL: 'lanes@test',
    },
  });
}

function plantedRepository(): string {
  const repositoryDirectory = mkdtempSync(join(tmpdir(), 'harness-lanes-'));
  git(repositoryDirectory, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repositoryDirectory, 'seed.txt'), 'seed\n');
  git(repositoryDirectory, ['add', 'seed.txt']);
  git(repositoryDirectory, ['commit', '-q', '-m', 'seed']);
  return repositoryDirectory;
}

test('a fleet worktree appears as a lane with its task number', () => {
  const repositoryDirectory = plantedRepository();
  try {
    const worktreeDirectory = join(repositoryDirectory, 'wt-990002');
    git(repositoryDirectory, [
      'worktree',
      'add',
      '-b',
      'fleet/990002-planted-lane-fixture',
      worktreeDirectory,
      'main',
    ]);
    writeFileSync(join(worktreeDirectory, 'dirty.txt'), 'uncommitted\n');
    const lanes = HarnessLanes.Class.listLanes(repositoryDirectory);
    expect(lanes.length).toBe(2);
    const fleetLane = lanes.find((lane) => lane.taskNumber === 990002)!;
    expect(fleetLane.branch).toBe('fleet/990002-planted-lane-fixture');
    expect(fleetLane.dirty).toBe(true);
    expect(fleetLane.commitsAheadOfMain).toBe(0);
  } finally {
    rmSync(repositoryDirectory, { recursive: true, force: true });
  }
});

test('a non-fleet branch carries no task number', () => {
  const repositoryDirectory = plantedRepository();
  try {
    const lanes = HarnessLanes.Class.listLanes(repositoryDirectory);
    expect(lanes.length).toBe(1);
    expect(lanes[0]!.taskNumber).toBeNull();
    expect(lanes[0]!.branch).toBe('main');
  } finally {
    rmSync(repositoryDirectory, { recursive: true, force: true });
  }
});

test('a non-repository root lists zero lanes without error', () => {
  const emptyDirectory = mkdtempSync(join(tmpdir(), 'harness-lanes-empty-'));
  try {
    expect(HarnessLanes.Class.listLanes(emptyDirectory)).toHaveLength(0);
  } finally {
    rmSync(emptyDirectory, { recursive: true, force: true });
  }
});
