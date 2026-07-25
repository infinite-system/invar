// Clipboard capability with a remote-first copy path: OSC 52 is emitted through the app's stdout so
// the terminal outside SSH/VM/cmux owns the user's clipboard. Local system tools remain a best-effort
// companion/fallback and the internal buffer preserves in-app paste.
import { Static } from 'ivue/extras';
import { createHash } from 'node:crypto';
import { Processes } from './Processes';

// invariant: Copy reaches the host terminal (src/modules/terminal/terminal.invariants.md)
export interface ClipboardTool {
  copy: string[];
  paste: string[];
}

let detected: ClipboardTool | null | undefined = undefined;

async function which(command: string): Promise<boolean> {
  try {
    const subprocess = Processes.Class.spawn(['which', command], { stdout: 'ignore', stderr: 'ignore' });
    return (await subprocess.exited) === 0;
  } catch {
    return false;
  }
}

async function detectTool(): Promise<ClipboardTool | null> {
  if (detected !== undefined) return detected;
  const candidates: Array<{ probe: string; tool: ClipboardTool }> = [
    { probe: 'wl-copy', tool: { copy: ['wl-copy'], paste: ['wl-paste', '--no-newline'] } },
    {
      probe: 'xclip',
      tool: {
        copy: ['xclip', '-selection', 'clipboard'],
        paste: ['xclip', '-selection', 'clipboard', '-o'],
      },
    },
    {
      probe: 'xsel',
      tool: { copy: ['xsel', '--clipboard', '--input'], paste: ['xsel', '--clipboard', '--output'] },
    },
    { probe: 'pbcopy', tool: { copy: ['pbcopy'], paste: ['pbpaste'] } },
  ];
  for (const candidate of candidates) {
    if (await which(candidate.probe)) {
      detected = candidate.tool;
      return candidate.tool;
    }
  }
  detected = null;
  return null;
}

class $Clipboard {
  /** Which delivery worked on the last copy: the tool name, 'osc52', or null before any copy. */
  static lastBackend: string | null = null;
  /** SHA-256 of the exact bytes offered to the last copy backend (observability without text leak). */
  static lastCopiedTextHash: string | null = null;

  // In-app clipboard buffer: paste ALWAYS works in-app after an in-app copy, even on machines with
  // no clipboard tool and a write-only OSC 52 (this VM: no xclip/xsel/wl-copy, no DISPLAY).
  private static internalBuffer = '';

  /** Copy text to the host terminal with OSC 52, plus a local system tool when one is available. */
  static async copy(text: string): Promise<boolean> {
    this.internalBuffer = text;
    this.lastCopiedTextHash = createHash('sha256').update(text, 'utf8').digest('hex');
    let emittedOsc52 = false;
    try {
      const base64 = Buffer.from(text, 'utf-8').toString('base64');
      process.stdout.write(`\x1b]52;c;${base64}\x07`);
      emittedOsc52 = true;
      this.lastBackend = 'osc52';
    } catch {
      /* a local tool below remains available */
    }
    const tool = await detectTool();
    if (tool) {
      try {
        const subprocess = Processes.Class.spawn(tool.copy, { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });
        subprocess.stdin.write(text);
        await subprocess.stdin.end();
        if ((await subprocess.exited) === 0) {
          const toolName = tool.copy[0] ?? 'tool';
          this.lastBackend = emittedOsc52 ? `osc52+${toolName}` : toolName;
          return true;
        }
      } catch {
        /* OSC 52 may already have delivered remotely */
      }
    }
    if (!emittedOsc52) {
      this.lastBackend = null;
      return false;
    }
    return true;
  }

  /** Read the clipboard: system tool if present, else the in-app buffer (OSC 52 is write-only). */
  static async paste(): Promise<string> {
    const tool = await detectTool();
    if (!tool) return this.internalBuffer;
    try {
      const subprocess = Processes.Class.spawn(tool.paste, { stdout: 'pipe', stderr: 'ignore' });
      const output = await new Response(subprocess.stdout).text();
      await subprocess.exited;
      return output;
    } catch {
      return this.internalBuffer;
    }
  }

  /** Test seam: force the detected tool (null → force the OSC 52 / empty-read fallback). */
  static setToolForTest(tool: ClipboardTool | null): void {
    detected = tool;
  }
}

export namespace Clipboard {
  export const $Class = $Clipboard;
  export let Class = Static($Class);
}
