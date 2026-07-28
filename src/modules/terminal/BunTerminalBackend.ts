// The macOS terminal backend: a shell running in Bun's native pseudo-terminal (`Bun.Terminal`).
//
// Why a second backend instead of `OpenPtyBackend` everywhere: `OpenPtyBackend` allocates the PTY
// through `bun:ffi` (`OpenPty`), and two of the libc calls it needs — `fcntl` (O_NONBLOCK) and
// `ioctl` (TIOCSWINSZ) — are variadic. Bun's FFI (1.3.14) cannot pass variadic arguments on the
// macOS arm64 ABI: `fcntl` silently fails to apply the flag and `ioctl` segfaults the process. So the
// FFI allocator cannot work on macOS at all. `Bun.Terminal` is Bun's native PTY (no FFI, no variadic
// calls) and owns the child spawn itself via `Bun.spawn(cmd, { terminal })`. Linux keeps
// `OpenPtyBackend`/`OpenPty` unchanged; `TerminalFactory` selects this backend only on darwin.
//
// Job control needs a controlling tty; macOS has no `setsid`, so job control is absent here for
// tier S (baseline interactivity + resize still work), matching the existing non-Linux caveat in
// `OpenPtyBackend`. A tier-M follow-up (a `login_tty` helper) closes that gap.
//
// invariant: Terminal bytes cross exactly one backend seam (src/modules/terminal/terminal.invariants.md)
// invariant: External tools share one launch policy (src/modules/system/system.invariants.md)
import { Environment } from '../system/Environment';
import { Logging } from '../system/Logging';
import type { TerminalBackend } from './TerminalBackend.interface';
import { TerminalRcfile, type TerminalRcfileHandle } from './TerminalRcfile';

class $BunTerminalBackend implements TerminalBackend {
  protected readonly terminal: Bun.Terminal;
  protected readonly child: ReturnType<typeof Bun.spawn>;
  protected readonly promptRcfile: TerminalRcfileHandle | null;
  protected dataCallback: ((bytes: Uint8Array) => void) | null = null;
  protected pendingData: Uint8Array[] = [];
  protected exitCallback: ((exitCode: number | null) => void) | null = null;
  protected killed = false;
  // Bytes accepted by `write` but not yet taken by the PTY, kept byte-accurate so a partial native
  // write never loses or reorders the remainder. The head's already-written prefix is `writeHeadOffset`.
  protected readonly writeQueue: Uint8Array[] = [];
  protected writeHeadOffset = 0;
  protected readonly textEncoder = new TextEncoder();
  readonly title: string;
  readonly cwd: string;

  constructor(
    options: {
      columns?: number;
      rows?: number;
      shell?: string;
      cwd?: string;
      command?: string;
      arguments?: readonly string[];
      environment?: Readonly<Record<string, string>>;
      cleanPrompt?: boolean;
      promptColor?: string;
    } = {},
  ) {
    const columns = options.columns ?? 80;
    const rows = options.rows ?? 24;
    const shell = options.shell ?? Environment.Class.env('SHELL') ?? 'bash';
    this.cwd = options.cwd ?? Environment.Class.cwd;
    this.title =
      options.command?.split(/\s+/, 1)[0]?.split('/').pop() ??
      shell.split('/').pop() ??
      'shell';

    // The native PTY reads from the child immediately; bytes that arrive before TerminalInstance
    // registers `onData` are buffered in `pendingData`, exactly as the openpty backend buffers them.
    this.terminal = new Bun.Terminal({
      cols: columns,
      rows,
      name: 'xterm-256color',
      data: (_terminal, bytes) => {
        if (this.dataCallback) {
          this.dataCallback(bytes);
        } else {
          this.pendingData.push(bytes.slice());
        }
      },
      drain: () => this.drainWriteQueue(),
    });

    // Mirror OpenPtyBackend's launch policy (clean prompt rcfile, login command form, full user
    // environment) minus the Linux-only `setsid --ctty` wrapper, since this backend is darwin-only.
    this.promptRcfile =
      options.command || options.cleanPrompt === false
        ? null
        : TerminalRcfile.Class.create(shell, options.promptColor ?? '');
    const command = options.command
      ? [
          shell,
          '-lc',
          [
            options.command,
            ...(options.arguments ?? []).map((argument) =>
              this.shellArgument(argument),
            ),
          ].join(' '),
        ]
      : (this.promptRcfile?.command ?? [shell, '-i']);
    // invariant: Task launch accepts process contributions (src/modules/tasks/tasks.invariants.md)
    this.child = Bun.spawn(command, {
      cwd: this.cwd,
      terminal: this.terminal,
      env: {
        ...process.env,
        ...options.environment,
        ...this.promptRcfile?.environment,
        TERM: 'xterm-256color',
      },
    });

    void this.child.exited.then((exitCode) => {
      this.promptRcfile?.dispose();
      if (!this.killed) this.exitCallback?.(exitCode ?? null);
    });
  }

  protected shellArgument(argument: string): string {
    return `'${argument.replaceAll("'", "'\"'\"'")}'`;
  }

  write(data: string): void {
    if (this.killed) return;
    const bytes = this.textEncoder.encode(data);
    if (bytes.length === 0) return;
    this.writeQueue.push(bytes);
    this.drainWriteQueue();
  }

  // Push queued bytes into the native PTY without blocking. `Bun.Terminal.write` returns the byte
  // count it accepted; a short count means the descriptor is full, so we keep the remainder and wait
  // for the `drain` callback rather than spinning — the large-paste analogue of OpenPty's O_NONBLOCK
  // write path, satisfied natively here.
  protected drainWriteQueue(): void {
    if (this.killed) return;
    while (this.writeQueue.length > 0) {
      const head = this.writeQueue[0]!;
      const remaining =
        this.writeHeadOffset === 0 ? head : head.subarray(this.writeHeadOffset);
      let acceptedByteCount: number;
      try {
        acceptedByteCount = this.terminal.write(remaining);
      } catch {
        // The terminal closed underneath us; nothing more can be written.
        return;
      }
      if (acceptedByteCount <= 0) {
        // Descriptor full — the `drain` callback resumes this loop.
        return;
      }
      if (acceptedByteCount >= remaining.length) {
        this.writeQueue.shift();
        this.writeHeadOffset = 0;
      } else {
        this.writeHeadOffset += acceptedByteCount;
        return;
      }
    }
  }

  onData(callback: (bytes: Uint8Array) => void): void {
    this.dataCallback = callback;
    for (const bytes of this.pendingData) callback(bytes);
    this.pendingData = [];
  }

  onExit(callback: (exitCode: number | null) => void): void {
    this.exitCallback = callback;
  }

  resize(columns: number, rows: number): void {
    if (this.killed) return;
    try {
      this.terminal.resize(columns, rows);
    } catch {
      // A resize after the terminal has closed is a no-op.
    }
  }

  kill(): void {
    if (this.killed) return;
    this.killed = true;
    this.writeQueue.length = 0;
    this.writeHeadOffset = 0;
    try {
      this.child.kill();
    } catch {
      /* already exited */
    }
    try {
      this.terminal.close();
    } catch {
      /* already closed */
    }
    this.promptRcfile?.dispose();
    Logging.Class.info('BunTerminalBackend killed');
  }
}

export namespace BunTerminalBackend {
  export const $Class = $BunTerminalBackend;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
