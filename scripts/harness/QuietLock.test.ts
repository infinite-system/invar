import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QuietLock } from './QuietLock';

const quietLockScriptPath = join(import.meta.dir, '..', 'quiet-lock.sh');

test('quiet-exclusive waits for a loud-shared holder to release', async () => {
  const testDirectory = mkdtempSync(join(tmpdir(), 'invar-quiet-lock-block-'));
  const lockFilePath = join(testDirectory, 'lock');
  const journalPath = join(testDirectory, 'journal');
  const loudReadyPath = join(testDirectory, 'loud-ready');
  const secondLoudRanPath = join(testDirectory, 'second-loud-ran');
  const quietRanPath = join(testDirectory, 'quiet-ran');

  try {
    const loudProcess = spawnLockHolder(
      'loud-shared',
      'positive-control loud holder',
      2,
      lockFilePath,
      journalPath,
      [
        'bash',
        '-c',
        'printf ready >"$1"; sleep 0.5',
        'loud-command',
        loudReadyPath,
      ],
    );
    await waitForPath(loudReadyPath);

    const secondLoudProcess = spawnLockHolder(
      'loud-shared',
      'second positive-control loud holder',
      2,
      lockFilePath,
      journalPath,
      [
        'bash',
        '-c',
        'printf ran >"$1"',
        'second-loud-command',
        secondLoudRanPath,
      ],
    );
    expect(await secondLoudProcess.exited).toBe(0);
    expect(readFileSync(secondLoudRanPath, 'utf8')).toBe('ran');
    expect(loudProcess.exitCode).toBeNull();

    const quietProcess = spawnLockHolder(
      'quiet-exclusive',
      'positive-control quiet holder',
      2,
      lockFilePath,
      journalPath,
      ['bash', '-c', 'printf ran >"$1"', 'quiet-command', quietRanPath],
    );
    await Bun.sleep(100);
    expect(quietProcess.exitCode).toBeNull();
    expect(existsSync(quietRanPath)).toBe(false);

    expect(await loudProcess.exited).toBe(0);
    expect(await quietProcess.exited).toBe(0);
    expect(readFileSync(quietRanPath, 'utf8')).toBe('ran');

    const journal = readFileSync(journalPath, 'utf8');
    expect(journal.indexOf('\treleased\t')).toBeLessThan(
      journal.lastIndexOf('\tacquired\t'),
    );
  } finally {
    rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('quiet-exclusive warns and proceeds after its bounded wait', async () => {
  const testDirectory = mkdtempSync(
    join(tmpdir(), 'invar-quiet-lock-degrade-'),
  );
  const lockFilePath = join(testDirectory, 'lock');
  const journalPath = join(testDirectory, 'journal');
  const loudReadyPath = join(testDirectory, 'loud-ready');
  const quietRanPath = join(testDirectory, 'quiet-ran');
  const degradationEnvironmentPath = join(
    testDirectory,
    'degradation-environment',
  );

  try {
    const loudProcess = spawnLockHolder(
      'loud-shared',
      'holder that never releases',
      2,
      lockFilePath,
      journalPath,
      [
        'bash',
        '-c',
        'printf ready >"$1"; sleep 10',
        'loud-command',
        loudReadyPath,
      ],
    );
    await waitForPath(loudReadyPath);

    const quietProcess = spawnLockHolder(
      'quiet-exclusive',
      'degraded quiet holder',
      0.1,
      lockFilePath,
      journalPath,
      [
        'bash',
        '-c',
        'printf ran >"$1"; ' +
          'printf "%s\\n%s\\n%s\\n%s" ' +
          '"$INVAR_QUIET_LOCK_DEGRADED_REASON" ' +
          '"$INVAR_QUIET_LOCK_WAIT_SECONDS" ' +
          '"$INVAR_QUIET_LOCK_WAIT_MILLISECONDS" ' +
          '"$INVAR_QUIET_LOCK_HOLDERS" >"$2"',
        'quiet-command',
        quietRanPath,
        degradationEnvironmentPath,
      ],
    );
    expect(await quietProcess.exited).toBe(0);
    expect(readFileSync(quietRanPath, 'utf8')).toBe('ran');
    const standardError = await new Response(quietProcess.stderr).text();
    expect(standardError).toContain('QUIET-LOCK WARNING');
    expect(standardError).toContain('holder that never releases');
    const [
      degradedReason,
      maximumWaitSeconds,
      actualWaitMilliseconds,
      holderNames,
    ] = readFileSync(degradationEnvironmentPath, 'utf8').split('\n');
    expect(degradedReason).toBe('timeout');
    expect(maximumWaitSeconds).toBe('0.1');
    expect(Number(actualWaitMilliseconds)).toBeGreaterThanOrEqual(100);
    expect(holderNames).toContain('holder that never releases');

    loudProcess.kill(9);
    await loudProcess.exited;
    const afterCrashProcess = spawnLockHolder(
      'quiet-exclusive',
      'post-crash quiet holder',
      1,
      lockFilePath,
      journalPath,
      ['true'],
    );
    expect(await afterCrashProcess.exited).toBe(0);
  } finally {
    rmSync(testDirectory, { recursive: true, force: true });
  }
});

test('quiet-lock degradation is absent from an acquired environment', () => {
  expect(
    QuietLock.Class.degradation({
      INVAR_QUIET_LOCK_STATE: 'acquired',
    }),
  ).toBeNull();
});

test('quiet-lock degradation preserves timeout evidence', () => {
  expect(
    QuietLock.Class.degradation({
      INVAR_QUIET_LOCK_STATE: 'degraded',
      INVAR_QUIET_LOCK_DEGRADED_REASON: 'timeout',
      INVAR_QUIET_LOCK_WAIT_SECONDS: '120',
      INVAR_QUIET_LOCK_WAIT_MILLISECONDS: '120007',
      INVAR_QUIET_LOCK_HOLDERS: 'other gate (pid 123, quiet-exclusive)',
    }),
  ).toEqual({
    reason: 'timeout',
    maximumWaitSeconds: '120',
    actualWaitMilliseconds: '120007',
    holderNames: 'other gate (pid 123, quiet-exclusive)',
  });
});

test('quiet-lock degradation does not invent a missing cause', () => {
  expect(
    QuietLock.Class.degradation({
      INVAR_QUIET_LOCK_STATE: 'degraded',
    }),
  ).toEqual({ reason: 'unknown' });
});

function spawnLockHolder(
  lockMode: 'quiet-exclusive' | 'loud-shared',
  holderName: string,
  maximumWaitSeconds: number,
  lockFilePath: string,
  journalPath: string,
  commandArguments: readonly string[],
): Bun.Subprocess<'ignore', 'ignore', 'pipe'> {
  const environment = { ...process.env };
  delete environment.INVAR_QUIET_LOCK_MODE;
  delete environment.INVAR_QUIET_LOCK_HOLDER_NAME;
  delete environment.INVAR_QUIET_LOCK_STATE;
  return Bun.spawn(
    [
      'bash',
      '-c',
      'source "$1"; shift; quiet_lock_run_with_paths "$@"',
      'quiet-lock-test',
      quietLockScriptPath,
      lockMode,
      holderName,
      maximumWaitSeconds.toString(),
      lockFilePath,
      journalPath,
      ...commandArguments,
    ],
    {
      env: environment,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
    },
  );
}

async function waitForPath(path: string): Promise<void> {
  const deadline = performance.now() + 2_000;
  while (performance.now() < deadline) {
    if (existsSync(path)) return;
    await Bun.sleep(5);
  }
  throw new Error(`Timed out waiting for ${path}`);
}
