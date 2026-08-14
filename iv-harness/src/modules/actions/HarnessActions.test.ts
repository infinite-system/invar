import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { HarnessActions } from './HarnessActions.ts';
import { HarnessVerbs } from '../verbs/HarnessVerbs.ts';

function git(repositoryDirectory: string, gitArguments: string[]): void {
  execFileSync('git', ['-C', repositoryDirectory, ...gitArguments], {
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'actions-test',
      GIT_AUTHOR_EMAIL: 'actions@test',
      GIT_COMMITTER_NAME: 'actions-test',
      GIT_COMMITTER_EMAIL: 'actions@test',
    },
  });
}

function plantedRepository(): {
  repositoryDirectory: string;
  registry: string;
} {
  const repositoryDirectory = mkdtempSync(join(tmpdir(), 'harness-actions-'));
  git(repositoryDirectory, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repositoryDirectory, 'seed.txt'), 'seed\n');
  git(repositoryDirectory, ['add', 'seed.txt']);
  git(repositoryDirectory, ['commit', '-q', '-m', 'seed']);
  const registry = join(repositoryDirectory, 'gates-registry');
  writeFileSync(registry, '');
  return { repositoryDirectory, registry };
}

test('an explicit-path commit lands and verifies its paths clean', () => {
  const { repositoryDirectory, registry } = plantedRepository();
  try {
    writeFileSync(join(repositoryDirectory, 'change.txt'), 'content\n');
    const result = HarnessActions.Class.commit(
      repositoryDirectory,
      { message: 'planted change', paths: ['change.txt'] },
      registry,
    );
    expect(result.claimedPathsClean).toBe(true);
    expect(result.commitHash.length).toBe(12);
    const events = HarnessVerbs.Class.readEvents(repositoryDirectory);
    expect(events[events.length - 1]!.verb).toBe('action.commit');
  } finally {
    rmSync(repositoryDirectory, { recursive: true, force: true });
  }
});

test('a pathless commit outside a fleet worktree is refused', () => {
  const { repositoryDirectory, registry } = plantedRepository();
  try {
    writeFileSync(join(repositoryDirectory, 'change.txt'), 'content\n');
    expect(() =>
      HarnessActions.Class.commit(
        repositoryDirectory,
        { message: 'sweep' },
        registry,
      ),
    ).toThrow(/pathless staging/);
  } finally {
    rmSync(repositoryDirectory, { recursive: true, force: true });
  }
});

test('a commit into a tree whose gate is mid-run is refused', () => {
  const { repositoryDirectory, registry } = plantedRepository();
  try {
    const runningLog = join(repositoryDirectory, 'gate-running.log');
    writeFileSync(
      runningLog,
      `GATE_TREE=${repositoryDirectory}\nGATE_TREE_TIP=abc\nsteps so far\n`,
    );
    writeFileSync(registry, runningLog + '\n');
    writeFileSync(join(repositoryDirectory, 'change.txt'), 'content\n');
    expect(() =>
      HarnessActions.Class.commit(
        repositoryDirectory,
        { message: 'mid-gate', paths: ['change.txt'] },
        registry,
      ),
    ).toThrow(/mid-run/);
    // The same tree commits fine once the gate has a verdict (silent arm).
    writeFileSync(
      runningLog,
      `GATE_TREE=${repositoryDirectory}\nGATE_EXIT=0\n`,
    );
    const result = HarnessActions.Class.commit(
      repositoryDirectory,
      { message: 'after verdict', paths: ['change.txt'] },
      registry,
    );
    expect(result.claimedPathsClean).toBe(true);
  } finally {
    rmSync(repositoryDirectory, { recursive: true, force: true });
  }
});

test('test verb parses pass and fail counts into data', () => {
  const { repositoryDirectory } = plantedRepository();
  try {
    writeFileSync(
      join(repositoryDirectory, 'green.test.ts'),
      `import { test, expect } from 'bun:test';
test('passes', () => expect(1).toBe(1));
`,
    );
    const green = HarnessActions.Class.test(
      repositoryDirectory,
      'green.test.ts',
    );
    expect(green.green).toBe(true);
    expect(green.passCount).toBe(1);
    writeFileSync(
      join(repositoryDirectory, 'red.test.ts'),
      `import { test, expect } from 'bun:test';
test('fails', () => expect(1).toBe(2));
`,
    );
    const red = HarnessActions.Class.test(repositoryDirectory, 'red.test.ts');
    expect(red.green).toBe(false);
    expect(red.failCount).toBe(1);
  } finally {
    rmSync(repositoryDirectory, { recursive: true, force: true });
  }
});

test('gate stamps tree and tip, registers the log, reads the verdict', () => {
  const { repositoryDirectory, registry } = plantedRepository();
  try {
    mkdirSync(join(repositoryDirectory, 'scripts'), { recursive: true });
    writeFileSync(
      join(repositoryDirectory, 'scripts', 'merge-gate.sh'),
      '#!/usr/bin/env bash\necho "stub gate ran"\necho "GATE_EXIT=0"\n',
    );
    const logPath = join(repositoryDirectory, 'gate-stub.log');
    const result = HarnessActions.Class.gate(
      repositoryDirectory,
      logPath,
      registry,
    );
    expect(result.verdict).toBe('green');
    const logText = require('node:fs').readFileSync(logPath, 'utf8');
    expect(logText).toContain(`GATE_TREE=${repositoryDirectory}`);
    expect(logText).toContain('GATE_TREE_TIP=');
    expect(require('node:fs').readFileSync(registry, 'utf8')).toContain(
      logPath,
    );
  } finally {
    rmSync(repositoryDirectory, { recursive: true, force: true });
  }
});
