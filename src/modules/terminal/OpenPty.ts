// The shared openpty resource. Both roles use the same generator: the integrated terminal owns the
// master and gives a shell the slave, while the byte-level harness owns the master and gives Invar
// the slave. Child selection stays outside this class; allocation, sizing, byte transport, and
// descriptor ownership stay here.
//
// invariant: One openpty allocator serves both PTY roles (src/modules/terminal/terminal.invariants.md)
import { dlopen, FFIType, ptr } from 'bun:ffi';
import { closeSync, createReadStream, type ReadStream } from 'node:fs';

class $OpenPty {
  private readonly masterFileDescriptor: number;
  private slaveFileDescriptorValue: number;
  private readStream: ReadStream | null = null;
  private closed = false;

  constructor(columns = 80, rows = 24) {
    const masterFileDescriptor = new Int32Array(1);
    const slaveFileDescriptor = new Int32Array(1);
    const openResult = openPtyLibrary.openpty(
      ptr(masterFileDescriptor),
      ptr(slaveFileDescriptor),
      null,
      null,
      null,
    );
    if (openResult !== 0) throw new Error(`openpty failed (result=${openResult})`);
    this.masterFileDescriptor = masterFileDescriptor[0] ?? -1;
    this.slaveFileDescriptorValue = slaveFileDescriptor[0] ?? -1;
    this.resize(columns, rows);
  }

  get slaveFileDescriptor(): number {
    if (this.slaveFileDescriptorValue < 0) {
      throw new Error('OpenPty slave file descriptor has already been released');
    }
    return this.slaveFileDescriptorValue;
  }

  /** Start the single async master read path. Register before spawning when no startup bytes may drop. */
  onData(callback: (bytes: Uint8Array) => void): void {
    if (this.closed) return;
    if (this.readStream) throw new Error('OpenPty data callback may only be registered once');
    this.readStream = createReadStream('', {
      fd: this.masterFileDescriptor,
      autoClose: false,
    });
    this.readStream.on('data', (chunk: Buffer) => callback(new Uint8Array(chunk)));
    this.readStream.on('error', () => {
      // Closing the master tears down the stream with an expected error.
    });
  }

  write(data: string | Uint8Array): void {
    if (this.closed) return;
    const buffer = typeof data === 'string'
      ? Buffer.from(data, 'utf8')
      : Buffer.from(data);
    if (buffer.length === 0) return;
    terminalControlLibrary.symbols.write(
      this.masterFileDescriptor,
      ptr(buffer),
      BigInt(buffer.length),
    );
  }

  resize(columns: number, rows: number): void {
    if (this.closed) return;
    const windowSize = new Uint16Array([
      Math.max(1, rows),
      Math.max(1, columns),
      0,
      0,
    ]);
    terminalControlLibrary.symbols.ioctl(
      this.masterFileDescriptor,
      terminalWindowSizeRequest,
      ptr(windowSize),
    );
  }

  /** The child inherited the slave; close only the parent's copy so master EOF remains meaningful. */
  releaseSlaveFileDescriptor(): void {
    if (this.slaveFileDescriptorValue < 0) return;
    try {
      closeSync(this.slaveFileDescriptorValue);
    } catch {
      // The runtime may already have closed its copy after spawn.
    }
    this.slaveFileDescriptorValue = -1;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.readStream?.destroy();
    } catch {
      // The stream is already gone.
    }
    this.releaseSlaveFileDescriptor();
    try {
      closeSync(this.masterFileDescriptor);
    } catch {
      // The master is already closed.
    }
  }
}

export namespace OpenPty {
  export const $Class = $OpenPty;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

const terminalWindowSizeRequest = 0x5414n;
const openPtyLibrary = loadOpenPtyLibrary();
const terminalControlLibrary = dlopen('libc.so.6', {
  ioctl: { args: [FFIType.int, FFIType.u64, FFIType.ptr], returns: FFIType.int },
  write: { args: [FFIType.int, FFIType.ptr, FFIType.u64], returns: FFIType.i64 },
});

function loadOpenPtyLibrary(): {
  openpty: (
    master: unknown,
    slave: unknown,
    name: unknown,
    terminalAttributes: unknown,
    windowSize: unknown,
  ) => number;
} {
  const openPtySymbol = {
    openpty: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.int,
    },
  } as const;
  for (const libraryName of ['libc.so.6', 'libutil.so.1', 'libutil.so']) {
    try {
      const library = dlopen(libraryName, openPtySymbol);
      return library.symbols as never;
    } catch {
      // Try the next platform library.
    }
  }
  throw new Error('openpty not found in libc or libutil');
}
