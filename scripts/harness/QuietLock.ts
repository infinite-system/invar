import { join } from 'node:path';
import { Static } from 'ivue/extras';

// invariant: Soft duration reports use a machine-wide quiet lock (scripts/harness/harness.invariants.md)
class $QuietLock {
  protected static get shellHelperPath(): string {
    return join(import.meta.dir, '..', 'quiet-lock.sh');
  }

  static async rerunEntryPointQuietExclusive(
    holderName: string,
    entryPointPath: string,
  ): Promise<number | null> {
    if (
      process.env.INVAR_QUIET_LOCK === '0' ||
      process.env.INVAR_QUIET_LOCK_MODE === 'quiet-exclusive'
    ) {
      return null;
    }
    const childProcess = Bun.spawn(
      [
        'bash',
        this.shellHelperPath,
        'quiet-exclusive',
        holderName,
        process.execPath,
        entryPointPath,
        ...process.argv.slice(2),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );
    return childProcess.exited;
  }

  static degradation(
    environment: Readonly<Record<string, string | undefined>>,
  ): QuietLockDegradation | null {
    if (environment.INVAR_QUIET_LOCK_STATE !== 'degraded') return null;
    if (
      environment.INVAR_QUIET_LOCK_DEGRADED_REASON === 'timeout' &&
      environment.INVAR_QUIET_LOCK_WAIT_SECONDS !== undefined &&
      environment.INVAR_QUIET_LOCK_WAIT_MILLISECONDS !== undefined &&
      environment.INVAR_QUIET_LOCK_HOLDERS !== undefined
    ) {
      return {
        reason: 'timeout',
        maximumWaitSeconds: environment.INVAR_QUIET_LOCK_WAIT_SECONDS,
        actualWaitMilliseconds: environment.INVAR_QUIET_LOCK_WAIT_MILLISECONDS,
        holderNames: environment.INVAR_QUIET_LOCK_HOLDERS,
      };
    }
    if (environment.INVAR_QUIET_LOCK_DEGRADED_REASON === 'flock-unavailable') {
      return { reason: 'flock-unavailable' };
    }
    return { reason: 'unknown' };
  }
}

export namespace QuietLock {
  export const $Class = $QuietLock;
  export const Class = Static($Class);
}

export type QuietLockDegradation =
  | {
      readonly reason: 'timeout';
      readonly maximumWaitSeconds: string;
      readonly actualWaitMilliseconds: string;
      readonly holderNames: string;
    }
  | {
      readonly reason: 'flock-unavailable';
    }
  | {
      readonly reason: 'unknown';
    };
