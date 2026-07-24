import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitCommands, type GitCommandResult } from '../GitCommands';
import { GitRepository } from '../GitRepository';
import { Processes } from '../../system/Processes';

interface DeferredResult {
  promise: Promise<GitCommandResult>;
  resolve(result: GitCommandResult): void;
}

let previousGitCommandsClass: typeof GitCommands.Class;

beforeEach(() => {
  previousGitCommandsClass = GitCommands.Class;
});

afterEach(() => {
  GitCommands.Class = previousGitCommandsClass;
});

function deferredResult(): DeferredResult {
  let resolve!: (result: GitCommandResult) => void;
  const promise = new Promise<GitCommandResult>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function statusOutput(branch: string, path: string): string {
  return [
    '# branch.oid 0123456789abcdef0123456789abcdef01234567',
    `# branch.head ${branch}`,
    `1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb ${path}`,
    '',
  ].join('\n');
}

test('refresh supersedes an older completion', async () => {
  const older = deferredResult();
  const newer = deferredResult();
  const pending = [older, newer];
  let requestIndex = 0;

  class FakeGitCommands extends GitCommands.$Class {
    static override statusPorcelainV2Branch(): Promise<GitCommandResult> {
      return pending[requestIndex++]!.promise;
    }
  }
  GitCommands.Class = FakeGitCommands;

  const repository = new GitRepository.Class('/repo');
  const olderRefresh = repository.refresh();
  const newerRefresh = repository.refresh();

  newer.resolve({ code: 0, stdout: statusOutput('newer', 'newer.ts'), stderr: '' });
  await newerRefresh;
  expect(repository.branch.value).toBe('newer');
  expect(repository.unstaged.value[0]?.path).toBe('newer.ts');

  older.resolve({ code: 0, stdout: statusOutput('older', 'older.ts'), stderr: '' });
  await olderRefresh;
  expect(repository.branch.value).toBe('newer');
  expect(repository.unstaged.value[0]?.path).toBe('newer.ts');
  expect(repository.refreshing.value).toBe(false);
});

test('an unchanged background refresh preserves quiescent Git refs', async () => {
  const backgroundResult = deferredResult();
  let requestCount = 0;

  class FakeGitCommands extends GitCommands.$Class {
    static override statusPorcelainV2Branch(): Promise<GitCommandResult> {
      requestCount++;
      if (requestCount === 1) {
        return Promise.resolve({
          code: 0,
          stdout: statusOutput('main', 'same.ts'),
          stderr: '',
        });
      }
      return backgroundResult.promise;
    }
  }
  GitCommands.Class = FakeGitCommands;

  const repository = new GitRepository.Class('/repo');
  await repository.refresh();
  const stagedBeforeReconcile = repository.staged.value;
  const unstagedBeforeReconcile = repository.unstaged.value;
  const untrackedBeforeReconcile = repository.untracked.value;

  const backgroundRefresh = repository.refresh({ background: true });
  expect(repository.refreshing.value).toBe(false);
  backgroundResult.resolve({
    code: 0,
    stdout: statusOutput('main', 'same.ts'),
    stderr: '',
  });
  await backgroundRefresh;

  expect(repository.staged.value).toBe(stagedBeforeReconcile);
  expect(repository.unstaged.value).toBe(unstagedBeforeReconcile);
  expect(repository.untracked.value).toBe(untrackedBeforeReconcile);
  expect(repository.refreshing.value).toBe(false);
});

test('a failed status refresh degrades to error state', async () => {
  class FailingGitCommands extends GitCommands.$Class {
    static override async statusPorcelainV2Branch(): Promise<GitCommandResult> {
      return { code: 128, stdout: '', stderr: 'fatal: not a git repository' };
    }
  }
  GitCommands.Class = FailingGitCommands;

  const repository = new GitRepository.Class('/not-a-repository');
  await expect(repository.refresh()).resolves.toBeUndefined();
  expect(repository.error.value).toContain('not a git repository');
  expect(repository.refreshing.value).toBe(false);
  expect(repository.staged.value).toEqual([]);
});

async function runGit(workingDirectory: string, arguments_: string[]): Promise<string> {
  const result = await Processes.Class.run(['git', ...arguments_], workingDirectory);
  if (!result.ok) {
    throw new Error(result.stderr);
  }
  return result.stdout;
}

async function createRepositoryFixture(): Promise<string> {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'invar-git-'));
  await runGit(workingDirectory, ['init', '--quiet']);
  await runGit(workingDirectory, ['config', 'user.name', 'Invar Test']);
  await runGit(workingDirectory, ['config', 'user.email', 'invar@example.test']);
  writeFileSync(join(workingDirectory, 'tracked.txt'), 'original\n');
  await runGit(workingDirectory, ['add', '--', 'tracked.txt']);
  await runGit(workingDirectory, ['commit', '--quiet', '-m', 'Initial commit']);
  return workingDirectory;
}

test('stage and unstage all transition a real git fixture', async () => {
  const cwd = await createRepositoryFixture();
  try {
    writeFileSync(join(cwd, 'tracked.txt'), 'changed\n');
    writeFileSync(join(cwd, 'new file.txt'), 'new\n');

    const repository = new GitRepository.Class(cwd);
    await repository.refresh();
    expect(repository.unstaged.value.map((record) => record.path)).toEqual(['tracked.txt']);
    expect(repository.untracked.value.map((record) => record.path)).toEqual(['new file.txt']);

    expect(await repository.stageAll()).toBe(true);
    expect(repository.staged.value.map((record) => record.path).sort()).toEqual([
      'new file.txt',
      'tracked.txt',
    ]);
    expect(repository.unstaged.value).toEqual([]);
    expect(repository.untracked.value).toEqual([]);

    expect(await repository.unstageAll()).toBe(true);
    expect(repository.staged.value).toEqual([]);
    expect(repository.unstaged.value.map((record) => record.path)).toEqual(['tracked.txt']);
    expect(repository.untracked.value.map((record) => record.path)).toEqual(['new file.txt']);

    const history = await repository.loadHistory({ limit: 1 });
    expect(history).toHaveLength(1);
    expect(history[0]?.subject).toBe('Initial commit');
    expect(repository.historyPage.value).toEqual(history);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
