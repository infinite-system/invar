import { expect, test } from 'bun:test';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runGit(repositoryPath: string, ...argumentsForGit: string[]) {
  return Bun.spawnSync({
    cmd: ['git', ...argumentsForGit],
    cwd: repositoryPath,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function commandOutput(commandResult: ReturnType<typeof runGit>): string {
  return `${commandResult.stdout.toString()}${commandResult.stderr.toString()}`;
}

test('builder policy skips the shared gate while the primary checkout runs it', () => {
  const temporaryRepositoryPath = mkdtempSync(
    join(tmpdir(), 'invar-builder-hook-policy-test-'),
  );
  const builderWorktreePath = join(temporaryRepositoryPath, 'builder-worktree');
  const repositoryPath = join(temporaryRepositoryPath, 'repository');

  try {
    mkdirSync(repositoryPath);
    expect(runGit(repositoryPath, 'init', '-q').exitCode).toBe(0);
    expect(
      runGit(repositoryPath, 'config', 'user.name', 'Hook Policy Test')
        .exitCode,
    ).toBe(0);
    expect(
      runGit(
        repositoryPath,
        'config',
        'user.email',
        'hook-policy-test@example.invalid',
      ).exitCode,
    ).toBe(0);

    const mergeGatePath = join(repositoryPath, 'scripts', 'merge-gate.sh');
    mkdirSync(join(repositoryPath, 'scripts'), { recursive: true });
    writeFileSync(
      mergeGatePath,
      '#!/usr/bin/env bash\necho "TEST_MERGE_GATE_LAUNCHED" >&2\nexit 73\n',
    );
    chmodSync(mergeGatePath, 0o755);
    writeFileSync(join(repositoryPath, 'baseline.txt'), 'baseline\n');
    expect(runGit(repositoryPath, 'add', '.').exitCode).toBe(0);
    expect(
      runGit(repositoryPath, 'commit', '-q', '-m', 'baseline').exitCode,
    ).toBe(0);

    const installedHookPath = join(
      repositoryPath,
      '.git',
      'hooks',
      'pre-commit',
    );
    copyFileSync(new URL('./pre-commit', import.meta.url), installedHookPath);
    chmodSync(installedHookPath, 0o755);

    expect(
      runGit(
        repositoryPath,
        'worktree',
        'add',
        '-q',
        '-b',
        'builder-hook-policy-test',
        builderWorktreePath,
        'HEAD',
      ).exitCode,
    ).toBe(0);
    const markerPathResult = runGit(
      builderWorktreePath,
      'rev-parse',
      '--git-path',
      'invar-builder-hook-policy',
    );
    expect(markerPathResult.exitCode).toBe(0);
    writeFileSync(
      markerPathResult.stdout.toString().trim(),
      'skip-full-merge-gate-v1\n',
    );

    writeFileSync(join(builderWorktreePath, 'change.txt'), 'builder change\n');
    expect(runGit(builderWorktreePath, 'add', 'change.txt').exitCode).toBe(0);
    const builderCommitResult = runGit(
      builderWorktreePath,
      'commit',
      '-m',
      'builder change',
    );
    expect(builderCommitResult.exitCode).toBe(0);
    expect(commandOutput(builderCommitResult)).toContain(
      'builder hook policy skips the full merge gate',
    );
    expect(commandOutput(builderCommitResult)).not.toContain(
      'TEST_MERGE_GATE_LAUNCHED',
    );

    writeFileSync(join(repositoryPath, 'change.txt'), 'builder change\n');
    expect(runGit(repositoryPath, 'add', 'change.txt').exitCode).toBe(0);
    const primaryCommitResult = runGit(
      repositoryPath,
      'commit',
      '-m',
      'builder change',
    );
    expect(primaryCommitResult.exitCode).toBe(1);
    expect(commandOutput(primaryCommitResult)).toContain(
      'TEST_MERGE_GATE_LAUNCHED',
    );
  } finally {
    rmSync(temporaryRepositoryPath, { recursive: true, force: true });
  }
});
