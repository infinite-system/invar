import { join } from 'node:path';
import { Static } from 'ivue/extras';

// invariant: Timing-sensitive smokes run on a machine-wide quiet lock (scripts/harness/harness.invariants.md)
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
}

export namespace QuietLock {
  export const $Class = $QuietLock;
  export const Class = Static($Class);
}
