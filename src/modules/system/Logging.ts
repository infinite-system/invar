import { Static } from 'ivue/extras';
// File logger — the TUI owns the terminal, so logs must never touch stdout/stderr.
// Writes to artifacts/tui.log. Static capability.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

class $Logging {
  protected static prepared = false;

  protected static get LOG_PATH(): string {
    return 'artifacts/tui.log';
  }

  static get path(): string {
    return this.LOG_PATH;
  }

  static write(level: string, message: string): void {
    if (!this.prepared) {
      try {
        mkdirSync(dirname(this.LOG_PATH), { recursive: true });
      } catch {
        /* ignore */
      }
      this.prepared = true;
    }
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;
    try {
      appendFileSync(this.LOG_PATH, line);
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
