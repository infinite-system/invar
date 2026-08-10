// The macOS terminal backend: a shell running in Bun's native pseudo-terminal, composed from the
// shared `NativeTerminalPty` allocator exactly as `OpenPtyBackend` composes `OpenPty` on Linux.
//
// Why a second backend instead of `OpenPtyBackend` everywhere: `OpenPtyBackend` allocates the PTY
// through `bun:ffi` (`OpenPty`), and two of the libc calls it needs — `fcntl` (O_NONBLOCK) and
// `ioctl` (TIOCSWINSZ) — are variadic. Bun's FFI (1.3.14) cannot pass variadic arguments on the
// macOS arm64 ABI: `fcntl` silently fails to apply the flag and `ioctl` segfaults the process. So
// the FFI allocator cannot work on macOS at all. `NativeTerminalPty` (over `Bun.Terminal`) makes
// those calls in Bun's C++ layer with no FFI; `TerminalFactory` selects this backend only on darwin.
// Linux keeps `OpenPtyBackend`/`OpenPty` unchanged.
//
// Job control needs a controlling tty; macOS has no `setsid`, so job control is absent here for
// tier S (baseline interactivity + resize still work), matching the existing non-Linux caveat in
// `OpenPtyBackend`. A tier-M follow-up (a `login_tty` helper) closes that gap.
//
// invariant: Terminal bytes cross exactly one backend seam (src/modules/terminal/terminal.invariants.md)
// invariant: External tools share one launch policy (src/modules/system/system.invariants.md)
// invariant: One openpty allocator serves both PTY roles (src/modules/terminal/terminal.invariants.md)
import { Environment } from '../system/Environment';
import { Logging } from '../system/Logging';
import { NativeTerminalPty } from '../system/NativeTerminalPty';
import type { TerminalBackend } from './TerminalBackend.interface';
import { TerminalRcfile, type TerminalRcfileHandle } from './TerminalRcfile';

class $BunTerminalBackend implements TerminalBackend {
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

    this.nativePty = new NativeTerminalPty.Class(columns, rows);

    // Mirror OpenPtyBackend's launch policy (clean prompt rcfile, login command form, full user
    // environment) minus the Linux-only `setsid --ctty` wrapper, since this backend is darwin-only.
    // This interactive PTY deliberately bypasses Processes.spawn: its child needs the complete user
    // environment, while external tools need the hermetic policy.
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
      terminal: this.nativePty.terminal,
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

  protected readonly nativePty: NativeTerminalPty.Model;
  protected readonly child: ReturnType<typeof Bun.spawn>;
  protected readonly promptRcfile: TerminalRcfileHandle | null;
  protected exitCallback: ((exitCode: number | null) => void) | null = null;
  protected killed = false;
  readonly title: string;
  readonly cwd: string;

  protected shellArgument(argument: string): string {
    return `'${argument.replaceAll("'", "'\"'\"'")}'`;
  }

  write(data: string): void {
    if (this.killed) return;
    this.nativePty.write(data);
  }

  onData(callback: (bytes: Uint8Array) => void): void {
    this.nativePty.onData(callback);
  }

  onExit(callback: (exitCode: number | null) => void): void {
    this.exitCallback = callback;
  }

  resize(columns: number, rows: number): void {
    if (this.killed) return;
    this.nativePty.resize(columns, rows);
    // Bun's native PTY updates the winsize but does not raise SIGWINCH on the child (unlike Linux's
    // ioctl(TIOCSWINSZ), which the kernel signals automatically). Without it the shell never
    // reflows when Invar's window resizes on macOS — deliver it explicitly, as SshClient does.
    try {
      this.child.kill('SIGWINCH');
    } catch {
      // The child has already exited.
    }
  }

  kill(): void {
    if (this.killed) return;
    this.killed = true;
    try {
      this.child.kill();
    } catch {
      /* already exited */
    }
    this.nativePty.close();
    this.promptRcfile?.dispose();
    Logging.Class.info('BunTerminalBackend killed');
  }
}

export namespace BunTerminalBackend {
  export const $Class = $BunTerminalBackend;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
