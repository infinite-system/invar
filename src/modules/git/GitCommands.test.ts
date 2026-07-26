import { beforeEach, expect, test } from 'bun:test';
import { GitCommands } from './GitCommands';
import { GitParsers } from './GitParsers';

interface CommandInvocation {
  workingDirectory: string;
  commandArguments: string[];
}

let commandInvocations: CommandInvocation[] = [];

class TestGitCommands extends GitCommands.$Class {
  static override async run(
    workingDirectory: string,
    commandArguments: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    commandInvocations.push({
      workingDirectory,
      commandArguments: [...commandArguments],
    });
    return { code: 0, stdout: '', stderr: '' };
  }
}

beforeEach(() => {
  commandInvocations = [];
});

test('statusPorcelainV2Branch assembles stable porcelain-v2 args', async () => {
  await TestGitCommands.statusPorcelainV2Branch('/tmp/repo');
  expect(commandInvocations).toEqual([
    {
      workingDirectory: '/tmp/repo',
      commandArguments: [
        '-c',
        'core.quotepath=false',
        'status',
        '--porcelain=v2',
        '--branch',
      ],
    },
  ]);
});

test('log clamps count, supports skip paging, and passes the branch ref', async () => {
  await TestGitCommands.log({
    cwd: '/tmp/repo',
    skip: 5,
    branch: 'feature/log',
    limit: 500,
  });
  expect(commandInvocations).toEqual([
    {
      workingDirectory: '/tmp/repo',
      commandArguments: [
        'log',
        '--decorate=short',
        '--date=iso-strict',
        '--max-count=200',
        `--format=${GitParsers.Class.logFormat}`,
        '--skip=5',
        'feature/log',
      ],
    },
  ]);
});

test('log with cursor uses a single-page skip cursor form and omits branch', async () => {
  await TestGitCommands.log({ cwd: '/tmp/repo', cursor: 'cafebabe' });
  expect(commandInvocations).toEqual([
    {
      workingDirectory: '/tmp/repo',
      commandArguments: [
        'log',
        '--decorate=short',
        '--date=iso-strict',
        '--max-count=50',
        `--format=${GitParsers.Class.logFormat}`,
        '--skip=1',
        'cafebabe',
      ],
    },
  ]);
});

test('diffFile dispatches per bucket', async () => {
  await TestGitCommands.diffFile('/tmp/repo', 'foo.txt', 'staged');
  await TestGitCommands.diffFile('/tmp/repo', 'foo.txt', 'untracked');
  await TestGitCommands.diffFile('/tmp/repo', 'foo.txt', 'unstaged');
  expect(commandInvocations).toEqual([
    {
      workingDirectory: '/tmp/repo',
      commandArguments: [
        'diff',
        '--no-ext-diff',
        '--no-color',
        '--cached',
        '--',
        'foo.txt',
      ],
    },
    {
      workingDirectory: '/tmp/repo',
      commandArguments: [
        'diff',
        '--no-ext-diff',
        '--no-color',
        '--no-index',
        '--',
        '/dev/null',
        'foo.txt',
      ],
    },
    {
      workingDirectory: '/tmp/repo',
      commandArguments: [
        'diff',
        '--no-ext-diff',
        '--no-color',
        '--',
        'foo.txt',
      ],
    },
  ]);
});

test('stage and unstage with empty paths return without spawning', async () => {
  await TestGitCommands.stage('/tmp/repo', []);
  await TestGitCommands.unstage('/tmp/repo', []);
  expect(commandInvocations).toEqual([]);
});
