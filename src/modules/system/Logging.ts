import { Static } from 'ivue/extras';
// File logger — the TUI owns the terminal, so logs must never touch stdout/stderr.
// Writes to artifacts/tui.log by default. Static capability.
//
// TWO INSTANCES, TWO IDENTITIES. artifacts/tui.log is one repository-relative path, so every
// Invar process launched from the same working tree appends to the same file. A reader that
// tails that file cannot tell its own instance's lines from a concurrent instance's lines, nor
// from a previous run's leftovers. Both are observable: a stale line satisfied a harness read
// before any boot, and two concurrent boots interleaved indistinguishable scrollbar geometry
// (measured 2026-07-30, task 90). The fix has two halves and needs both. TUI_LOG_PATH gives a
// run its own file, and the instance stamp lets a reader reject a line that is not its own even
// when the path is shared.
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

class $Logging {
  protected static prepared = false;

  protected static resolvedInstance = '';

  protected static get DEFAULT_LOG_PATH(): string {
    return 'artifacts/tui.log';
  }

  protected static get logPath(): string {
    return process.env.TUI_LOG_PATH || this.DEFAULT_LOG_PATH;
  }

  /** Stable for the life of the process: a caller-declared identity, or a generated one. */
  protected static get instanceIdentity(): string {
    if (!this.resolvedInstance) {
      this.resolvedInstance =
        process.env.TUI_LOG_INSTANCE ||
        `${process.pid}-${randomBytes(4).toString('hex')}`;
    }
    return this.resolvedInstance;
  }

  static get path(): string {
    return this.logPath;
  }

  static get instance(): string {
    return this.instanceIdentity;
  }

  static write(level: string, message: string): void {
    const path = this.logPath;
    if (!this.prepared) {
      try {
        mkdirSync(dirname(path), { recursive: true });
      } catch {
        /* ignore */
      }
      this.prepared = true;
    }
    const line = `${new Date().toISOString()} [${level}] [instance=${this.instanceIdentity}] ${message}\n`;
    try {
      appendFileSync(path, line);
    } catch {
      /* logging must never crash the app */
    }
  }

  static info(message: string): void {
    this.write('info', message);
  }

  static error(message: string): void {
    this.write('error', message);
  }
}

export namespace Logging {
  export const $Class = Static($Logging);
  export let Class = $Class;
}
