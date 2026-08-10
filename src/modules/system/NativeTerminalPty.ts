// The macOS pseudo-terminal allocator: a thin resource wrapper over Bun's native PTY
// (`Bun.Terminal`), sibling to the FFI `OpenPty` allocator that serves Linux. It exists because
// `bun:ffi` (1.3.14) cannot pass the variadic arguments of `fcntl`/`ioctl` on the darwin arm64 ABI —
// `fcntl` silently fails to apply `O_NONBLOCK` and `ioctl(TIOCSWINSZ)` segfaults — so the FFI
// allocator cannot run on macOS at all. Consumers (`BunTerminalBackend` for the integrated terminal,
// `SshClient` for the `iv ssh` interactive session) compose this allocator and only choose which
// child is spawned onto it, exactly as their Linux counterparts compose `OpenPty`.
//
// One asymmetry against `OpenPty`: the native PTY owns the child spawn (`Bun.spawn(command,
// { terminal })`) instead of handing out a slave file descriptor, so this class exposes the
// `terminal` handle for the consumer's spawn call rather than a descriptor.
//
// invariant: One openpty allocator serves both PTY roles (src/modules/terminal/terminal.invariants.md)
class $NativeTerminalPty {
  constructor(columns = 80, rows = 24) {
    // The native PTY reads from the child immediately; bytes that arrive before the consumer
    // registers `onData` are buffered in `pendingData`, exactly as `OpenPty` buffers them.
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
  }

  /** The native PTY handle — pass as `Bun.spawn(command, { terminal })` to attach the child. */
  readonly terminal: Bun.Terminal;
  protected dataCallback: ((bytes: Uint8Array) => void) | null = null;
  protected pendingData: Uint8Array[] = [];
  protected closed = false;
  // Bytes accepted by `write` but not yet taken by the PTY, kept byte-accurate so a partial native
  // write never loses or reorders the remainder. The head's already-written prefix is `writeHeadOffset`.
  protected readonly writeQueue: Uint8Array[] = [];
  protected writeHeadOffset = 0;
  protected readonly textEncoder = new TextEncoder();

  /** Register the single sink for bytes coming from the child; flushes anything buffered so far. */
  onData(callback: (bytes: Uint8Array) => void): void {
    this.dataCallback = callback;
    for (const bytes of this.pendingData) callback(bytes);
    this.pendingData = [];
  }

  write(data: string | Uint8Array): void {
    if (this.closed) return;
    const bytes =
      typeof data === 'string' ? this.textEncoder.encode(data) : data;
    if (bytes.length === 0) return;
    this.writeQueue.push(bytes);
    this.drainWriteQueue();
  }

  // Push queued bytes into the native PTY without blocking. `Bun.Terminal.write` returns the byte
  // count it accepted; a short count means the descriptor is full, so we keep the remainder and wait
  // for the `drain` callback rather than spinning — the large-paste analogue of OpenPty's O_NONBLOCK
  // write path, satisfied natively here.
  protected drainWriteQueue(): void {
    if (this.closed) return;
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

  resize(columns: number, rows: number): void {
    if (this.closed) return;
    try {
      this.terminal.resize(columns, rows);
    } catch {
      // A resize after the terminal has closed is a no-op.
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.writeQueue.length = 0;
    this.writeHeadOffset = 0;
    try {
      this.terminal.close();
    } catch {
      /* already closed */
    }
  }
}

export namespace NativeTerminalPty {
  export const $Class = $NativeTerminalPty;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
