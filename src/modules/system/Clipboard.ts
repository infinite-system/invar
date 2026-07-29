// Clipboard capability with a remote-first copy path: OSC 52 is emitted through the renderer-owned
// terminal writer so the terminal outside SSH/VM/cmux owns the user's clipboard without competing
// with frame output. Local tools remain a best-effort companion and the internal buffer preserves
// in-app paste.
import { Static } from 'ivue/extras';
import { createHash } from 'node:crypto';
import { Processes } from './Processes';

// invariant: Copy reaches the host terminal (src/modules/system/system.invariants.md)
// invariant: Clipboard emissions flush at frame boundaries (system.invariants.md)

class $Clipboard {
  protected static detectedTool: ClipboardTool | null | undefined = undefined;
  protected static osc52Emitter: ClipboardOsc52Emitter | null = null;
  protected static internalBuffer = '';

  /** Which delivery worked on the last copy: the tool name, 'osc52', or null before any copy. */
  static lastBackend: string | null = null;
  /** SHA-256 of the exact bytes offered to the last copy backend (observability without text leak). */
  static lastCopiedTextHash: string | null = null;

  /** Bind OSC 52 to the active renderer's serialized terminal writer. */
  static setOsc52Emitter(emitter: ClipboardOsc52Emitter | null): () => void {
    this.osc52Emitter = emitter;
    return () => {
      if (this.osc52Emitter === emitter) this.osc52Emitter = null;
    };
  }

  /** Copy text to the host terminal with OSC 52, plus a local system tool when one is available. */
  static async copy(text: string): Promise<boolean> {
    this.internalBuffer = text;
    this.lastCopiedTextHash = createHash('sha256')
      .update(text, 'utf8')
      .digest('hex');
    let emittedOsc52 = false;
    try {
      const base64Payload = Buffer.from(text, 'utf8').toString('base64');
      emittedOsc52 =
        this.osc52Emitter?.(`\x1b]52;c;${base64Payload}\x07`) ?? false;
      if (emittedOsc52) this.lastBackend = 'osc52';
    } catch {
      /* a local tool below remains available */
    }
    const tool = await this.detectTool();
    if (tool) {
      try {
        const subprocess = Processes.Class.spawn(tool.copy, {
          stdin: 'pipe',
          stdout: 'ignore',
          stderr: 'ignore',
        });
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
    const tool = await this.detectTool();
    if (!tool) return this.internalBuffer;
    try {
      const subprocess = Processes.Class.spawn(tool.paste, {
        stdout: 'pipe',
        stderr: 'ignore',
      });
      const output = await new Response(subprocess.stdout).text();
      await subprocess.exited;
      return output;
    } catch {
      return this.internalBuffer;
    }
  }

  /** Test seam: force the detected tool (null → force the OSC 52 / empty-read fallback). */
  static setToolForTest(tool: ClipboardTool | null): void {
    this.detectedTool = tool;
  }

  protected static async detectTool(): Promise<ClipboardTool | null> {
    if (this.detectedTool !== undefined) return this.detectedTool;
    const candidates: Array<{ probe: string; tool: ClipboardTool }> = [
      {
        probe: 'wl-copy',
        tool: { copy: ['wl-copy'], paste: ['wl-paste', '--no-newline'] },
      },
      {
        probe: 'xclip',
        tool: {
          copy: ['xclip', '-selection', 'clipboard'],
          paste: ['xclip', '-selection', 'clipboard', '-o'],
        },
      },
      {
        probe: 'xsel',
        tool: {
          copy: ['xsel', '--clipboard', '--input'],
          paste: ['xsel', '--clipboard', '--output'],
        },
      },
      { probe: 'pbcopy', tool: { copy: ['pbcopy'], paste: ['pbpaste'] } },
    ];
    for (const candidate of candidates) {
      if (await this.commandExists(candidate.probe)) {
        this.detectedTool = candidate.tool;
        return candidate.tool;
      }
    }
    this.detectedTool = null;
    return null;
  }

  protected static async commandExists(command: string): Promise<boolean> {
    try {
      const subprocess = Processes.Class.spawn(['which', command], {
        stdout: 'ignore',
        stderr: 'ignore',
      });
      return (await subprocess.exited) === 0;
    } catch {
      return false;
    }
  }
}

export namespace Clipboard {
  export const $Class = Static($Clipboard);
  export let Class = $Class;
}

export interface ClipboardTool {
  copy: string[];
  paste: string[];
}

export type ClipboardOsc52Emitter = (sequence: string) => boolean;
