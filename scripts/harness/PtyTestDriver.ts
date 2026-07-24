// The harness is the terminal: it gives the unmodified Invar entrypoint a real PTY slave, feeds the
// returned master bytes into the production emulator, and snapshots only after OpenTUI closes a
// synchronized-output frame.
//
// invariant: One openpty allocator serves both PTY roles (src/modules/terminal/terminal.invariants.md)
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
import { OpenPty } from '../../src/modules/terminal/OpenPty';
import { TerminalEmulator } from '../../src/modules/terminal/TerminalEmulator';
import { HarnessInput, type HarnessMouseEvent } from './HarnessInput';
import { HarnessSnapshot, type HarnessSnapshotCell } from './HarnessSnapshot';
import { SynchronizedOutputQuiescence } from './SynchronizedOutputQuiescence';

export interface PtyTestDriverOptions {
  workspaceRoot: string;
  repositoryRoot?: string;
  columns?: number;
  rows?: number;
  homeDirectory?: string;
  environment?: Record<string, string | undefined>;
  command?: string[];
}

class $PtyTestDriver {
  private readonly openPty: OpenPty.Model;
  private readonly emulator: TerminalEmulator.Model;
  private readonly quiescence = new SynchronizedOutputQuiescence.Class();
  private readonly child: ReturnType<typeof Bun.spawn>;
  private minimumCompletedFrameCount = 1;
  private disposed = false;

  constructor(private readonly options: PtyTestDriverOptions) {
    const columns = options.columns ?? 120;
    const rows = options.rows ?? 40;
    const repositoryRoot = options.repositoryRoot ?? process.cwd();
    this.openPty = new OpenPty.Class(columns, rows);
    this.emulator = new TerminalEmulator.Class(columns, rows);
    this.emulator.onReply((data) => this.openPty.write(data));
    this.openPty.onData((bytes) => {
      this.quiescence.observe(bytes);
      this.emulator.write(bytes);
    });

    const applicationCommand = options.command
      ?? [process.execPath, 'run', 'src/main.ts', options.workspaceRoot];
    const childCommand = process.platform === 'linux'
      ? ['setsid', '--ctty', ...applicationCommand]
      : applicationCommand;
    this.child = Bun.spawn(childCommand, {
      cwd: repositoryRoot,
      stdio: [
        this.openPty.slaveFileDescriptor,
        this.openPty.slaveFileDescriptor,
        this.openPty.slaveFileDescriptor,
      ],
      env: this.childEnvironment(options),
    });
    this.openPty.releaseSlaveFileDescriptor();
    void this.child.exited.then((exitCode) => {
      if (this.disposed) return;
      this.quiescence.fail(new Error(`Invar exited before the awaited frame (exit ${exitCode})`));
    });
  }

  sendKeys(...keyNames: string[]): void {
    this.expectNextFrame();
    this.openPty.write(keyNames.map((keyName) => HarnessInput.Class.key(keyName)).join(''));
  }

  sendText(text: string): void {
    if (!text) return;
    this.expectNextFrame();
    this.openPty.write(text);
  }

  sendMouse(event: HarnessMouseEvent): void {
    this.expectNextFrame();
    this.openPty.write(HarnessInput.Class.mouse(event));
  }

  sendPaste(text: string): void {
    this.expectNextFrame();
    this.openPty.write(HarnessInput.Class.paste(text));
  }

  resize(columns: number, rows: number): void {
    this.expectNextFrame();
    this.emulator.resize(columns, rows);
    this.openPty.resize(columns, rows);
  }

  async awaitQuiescence(timeoutMilliseconds = 10_000): Promise<void> {
    const targetCompletedFrameCount = this.minimumCompletedFrameCount;
    await this.quiescence.awaitCompletedFrame(targetCompletedFrameCount, timeoutMilliseconds);
    await this.emulator.flush();
    this.minimumCompletedFrameCount = this.quiescence.completedFrameCount;
  }

  async awaitSnapshot(
    predicate: (snapshot: HarnessSnapshot.Model) => boolean,
    timeoutMilliseconds = 10_000,
  ): Promise<HarnessSnapshot.Model> {
    const deadline = performance.now() + timeoutMilliseconds;
    await this.awaitQuiescence(timeoutMilliseconds);
    while (true) {
      const snapshot = this.snapshot();
      if (predicate(snapshot)) return snapshot;
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) {
        throw new Error(`Timed out waiting for a matching harness snapshot\n${snapshot.text()}`);
      }
      const nextCompletedFrameCount = this.quiescence.completedFrameCount + 1;
      await this.quiescence.awaitCompletedFrame(
        nextCompletedFrameCount,
        remainingMilliseconds,
      );
      await this.emulator.flush();
      this.minimumCompletedFrameCount = this.quiescence.completedFrameCount;
    }
  }

  snapshot(): HarnessSnapshot.Model {
    const copiedCells: HarnessSnapshotCell[] = [];
    for (let row = 0; row < this.emulator.rows; row++) {
      for (let column = 0; column < this.emulator.columns; column++) {
        const cell = this.emulator.cell(row, column);
        if (!cell) throw new Error(`Emulator cell missing at row ${row}, column ${column}`);
        copiedCells.push({ ...cell, row, column });
      }
    }
    return new HarnessSnapshot.Class(
      this.emulator.columns,
      this.emulator.rows,
      this.emulator.cursorColumn,
      this.emulator.cursorRow,
      copiedCells,
    );
  }

  async exitCode(): Promise<number> {
    return this.child.exited;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.child.kill();
    } catch {
      // The app already exited.
    }
    this.openPty.close();
    this.emulator.dispose();
  }

  private expectNextFrame(): void {
    this.minimumCompletedFrameCount = Math.max(
      this.minimumCompletedFrameCount,
      this.quiescence.completedFrameCount + 1,
    );
  }

  private childEnvironment(options: PtyTestDriverOptions): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined || key.startsWith('GIT_')) continue;
      if (['TUI_STATUS_PATH', 'TUI_FRAME_PATH', 'TUI_FRAME_DUMP', 'TUI_OBSERVE'].includes(key)) {
        continue;
      }
      environment[key] = value;
    }
    environment.TERM = 'xterm-256color';
    environment.COLORTERM = 'truecolor';
    if (options.homeDirectory) environment.HOME = options.homeDirectory;
    for (const [key, value] of Object.entries(options.environment ?? {})) {
      if (value === undefined) delete environment[key];
      else environment[key] = value;
    }
    return environment;
  }
}

export namespace PtyTestDriver {
  export const $Class = $PtyTestDriver;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
