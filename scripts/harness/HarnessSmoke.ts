// Shared generators for byte-harness smokes: hermetic Git fixtures, status-channel reads, and
// text-addressed pointer input. Visual verdicts remain on HarnessSnapshot; status is reserved for
// genuinely semantic state.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
import { readFileSync } from 'node:fs';
import { Static } from 'ivue/extras';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import type { HarnessSnapshot } from './HarnessSnapshot';
import type { PtyTestDriver } from './PtyTestDriver';

class $HarnessSmoke {
  static pass = $pass;
  static requireCondition = $requireCondition;
  static runGit = $runGit;
  static readStatus = $readStatus;
  static awaitStatus = $awaitStatus;
  static awaitStatusWithoutFrame = $awaitStatusWithoutFrame;
  static awaitFrameSilence = $awaitFrameSilence;
  static clickText = $clickText;
}

export namespace HarnessSmoke {
  export const $Class = $HarnessSmoke;
  export const Class = Static($Class);
}

function $pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

function $requireCondition(condition: unknown, label: string): void {
  if (!condition) throw new Error(`FAIL ${label}`);
  $pass(label);
}

function $runGit(repositoryRoot: string, commandArguments: readonly string[]): string {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith('GIT_'),
    ),
  ) as Record<string, string>;
  const result = Bun.spawnSync(['git', ...commandArguments], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
    env: environment,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${commandArguments.join(' ')} failed: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function $readStatus(statusPath: string): StatusSnapshot {
  return JSON.parse(readFileSync(statusPath, 'utf8')) as StatusSnapshot;
}

async function $awaitStatus(
  driver: PtyTestDriver.Model,
  statusPath: string,
  predicate: (status: StatusSnapshot) => boolean,
  timeoutMilliseconds = 10_000,
): Promise<StatusSnapshot> {
  return $awaitStatusWithoutFrame(
    driver,
    statusPath,
    predicate,
    timeoutMilliseconds,
  );
}

async function $awaitFrameSilence(
  driver: PtyTestDriver.Model,
  silenceMilliseconds = 150,
  timeoutMilliseconds = 10_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (true) {
    await driver.awaitQuiescence(Math.max(1, deadline - performance.now()));
    try {
      await driver.assertNoCompleteFrameEmittedFor(silenceMilliseconds);
      return;
    } catch (error) {
      if (performance.now() >= deadline) throw error;
    }
  }
}

async function $awaitStatusWithoutFrame(
  driver: PtyTestDriver.Model,
  statusPath: string,
  predicate: (status: StatusSnapshot) => boolean,
  timeoutMilliseconds = 10_000,
): Promise<StatusSnapshot> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (true) {
    try {
      const status = $readStatus(statusPath);
      if (predicate(status)) return status;
    } catch {
      // The atomic status file has not been published yet.
    }
    const remainingMilliseconds = deadline - performance.now();
    if (remainingMilliseconds <= 0) {
      throw new Error(
        `Timed out waiting for status at ${statusPath} to satisfy its predicate`,
      );
    }
    try {
      await driver.assertNoCompleteFrameEmittedFor(Math.min(50, remainingMilliseconds));
    } catch {
      // A frame is also progress; inspect the freshly flushed status on the next iteration.
    }
  }
}

function $clickText(
  driver: PtyTestDriver.Model,
  snapshot: HarnessSnapshot.Model,
  marker: string,
  columnOffset = 0,
): void {
  const position = snapshot.findText(marker);
  if (!position) throw new Error(`Marker is not visible: ${marker}\n${snapshot.text()}`);
  const column = position.column + columnOffset;
  driver.sendMouse({ kind: 'press', column, row: position.row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row: position.row, button: 'left' });
}
