import { readFileSync, rmSync } from 'node:fs';
import { Static } from 'ivue/extras';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import type { HarnessSnapshot } from './HarnessSnapshot';
import type { PtyTestDriver } from './PtyTestDriver';

// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Async-published state is always awaited (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)

/** Shared generators for hermetic fixtures, status reads, and text-addressed pointer input. */
class $HarnessSmoke {
  static pass(label: string): void {
    console.log(`  PASS  ${label}`);
  }

  static requireCondition(condition: unknown, label: string): void {
    if (!condition) throw new Error(`FAIL ${label}`);
    this.pass(label);
  }

  static runGit(repositoryRoot: string, commandArguments: readonly string[]): string {
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

  static readStatus(statusPath: string): StatusSnapshot {
    return JSON.parse(readFileSync(statusPath, 'utf8')) as StatusSnapshot;
  }

  static async removeTemporaryDirectory(directoryPath: string): Promise<void> {
    try {
      rmSync(directoryPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EFAULT') throw error;
      // Bun can transiently surface EFAULT while recursive removal crosses a just-closed watcher.
      await Bun.sleep(25);
      rmSync(directoryPath, { recursive: true, force: true });
    }
  }

  static async awaitStatus(
    driver: PtyTestDriver.Model,
    statusPath: string,
    description: string,
    predicate: (status: StatusSnapshot) => boolean,
    timeoutMilliseconds = 30_000,
  ): Promise<StatusSnapshot> {
    return this.awaitStatusWithoutFrame(
      driver,
      statusPath,
      description,
      predicate,
      timeoutMilliseconds,
    );
  }

  static async awaitFrameSilence(
    driver: PtyTestDriver.Model,
    silenceMilliseconds = 150,
    timeoutMilliseconds = 30_000,
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

  static async awaitStatusWithoutFrame(
    driver: PtyTestDriver.Model,
    statusPath: string,
    description: string,
    predicate: (status: StatusSnapshot) => boolean,
    timeoutMilliseconds = 30_000,
  ): Promise<StatusSnapshot> {
    const deadline = performance.now() + timeoutMilliseconds;
    while (true) {
      try {
        const status = this.readStatus(statusPath);
        if (predicate(status)) return status;
      } catch {
        // The atomic status file has not been published yet.
      }
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) {
        throw new Error(`Timed out waiting for ${description} at ${statusPath}`);
      }
      try {
        await driver.assertNoCompleteFrameEmittedFor(Math.min(50, remainingMilliseconds));
      } catch {
        // A frame is also progress; inspect the freshly flushed status on the next iteration.
      }
    }
  }

  static clickText(
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
}

export namespace HarnessSmoke {
  export const $Class = $HarnessSmoke;
  export const Class = Static($Class);
}
