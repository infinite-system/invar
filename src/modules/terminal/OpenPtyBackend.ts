// The real terminal backend: a shell running in a pseudo-terminal, wired per the proven Bun path
// (project.terminal-feasibility.md). node-pty does NOT work under Bun (instant EOF); the working
// decomposition is the shared OpenPty allocator + `Bun.spawn` onto the slave fd. The harness uses
// the same allocator with the roles inverted; child selection and lifecycle remain consumer-owned.
//
// Job control needs a controlling tty: on Linux we wrap the child in `setsid --ctty` (proven). macOS
// has no setsid, so job control is absent there for tier S (baseline interactivity + resize still
// work) — a tier-M follow-up (a login_tty helper) closes that gap.
//
// invariant: Terminal bytes cross exactly one backend seam (src/modules/terminal/terminal.invariants.md)
// invariant: External tools share one launch policy (src/modules/system/system.invariants.md)
// invariant: One openpty allocator serves both PTY roles (src/modules/terminal/terminal.invariants.md)
import { Environment } from '../system/Environment';
import { Logging } from '../system/Logging';
import type { TerminalBackend } from './TerminalBackend.interface';
import { OpenPty } from './OpenPty';
import { TerminalRcfile, type TerminalRcfileHandle } from './TerminalRcfile';

class $OpenPtyBackend implements TerminalBackend {
  protected readonly openPty: OpenPty.Model;
  protected readonly child: ReturnType<typeof Bun.spawn>;
  protected readonly promptRcfile: TerminalRcfileHandle | null;
  protected dataCallback: ((bytes: Uint8Array) => void) | null = null;
  protected pendingData: Uint8Array[] = [];
  protected exitCallback: ((exitCode: number | null) => void) | null = null;
  protected killed = false;
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

    this.openPty = new OpenPty.Class(columns, rows);
    this.openPty.onData((bytes) => {
      if (this.dataCallback) {
        this.dataCallback(bytes);
      } else {
        this.pendingData.push(bytes.slice());
      }
    });

    // Linux gets a controlling tty (job control) via setsid --ctty; elsewhere spawn the shell bare.
    // This interactive PTY deliberately bypasses Processes.spawn: its child needs the complete user
    // environment plus slave-file-descriptor stdio, while external tools need the hermetic policy.
    this.promptRcfile =
      options.command || options.cleanPrompt === false
        ? null
        : TerminalRcfile.Class.create(shell, options.promptColor ?? '');
    const childCommand = options.command
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
    const command =
      process.platform === 'linux'
        ? ['setsid', '--ctty', ...childCommand]
        : childCommand;
    // invariant: Task launch accepts process contributions (src/modules/tasks/tasks.invariants.md)
    this.child = Bun.spawn(command, {
      cwd: this.cwd,
      stdio: [
        this.openPty.slaveFileDescriptor,
        this.openPty.slaveFileDescriptor,
        this.openPty.slaveFileDescriptor,
      ],
      env: {
        ...process.env,
        ...options.environment,
        ...this.promptRcfile?.environment,
        TERM: 'xterm-256color',
      },
    });
    this.openPty.releaseSlaveFileDescriptor();

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
    this.openPty.write(data);
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
    this.openPty.resize(columns, rows);
  }

  kill(): void {
    if (this.killed) return;
    this.killed = true;
    try {
      this.child.kill();
    } catch {
      /* already exited */
    }
    this.openPty.close();
    this.promptRcfile?.dispose();
    Logging.Class.info('OpenPtyBackend killed');
  }
}

export namespace OpenPtyBackend {
  export const $Class = $OpenPtyBackend;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
