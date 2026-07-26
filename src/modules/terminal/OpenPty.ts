// The shared openpty resource. Both roles use the same generator: the integrated terminal owns the
// master and gives a shell the slave, while the byte-level harness owns the master and gives Invar
// the slave. Child selection stays outside this class; allocation, sizing, byte transport, and
// descriptor ownership stay here.
//
// invariant: One openpty allocator serves both PTY roles (src/modules/terminal/terminal.invariants.md)
// invariant: Bracketed paste survives stream chunking (src/modules/terminal/terminal.invariants.md)
// invariant: Shared PTY writes never block the event loop (src/modules/terminal/terminal.invariants.md)
import { dlopen, FFIType, ptr, read } from 'bun:ffi';
import { closeSync, createReadStream, type ReadStream } from 'node:fs';

class $OpenPty {
  protected static get terminalWindowSizeRequest(): bigint {
    return 0x5414n;
  }

  protected static get getFileStatusFlagsCommand(): number {
    return 3;
  }

  protected static get setFileStatusFlagsCommand(): number {
    return 4;
  }

  protected static get nonBlockingFileStatusFlag(): number {
    return 0x800;
  }

  protected static get tryAgainErrno(): number {
    return 11;
  }

  protected static get operationWouldBlockErrno(): number {
    return 11;
  }

  protected static get writeChunkByteLimit(): number {
    return 16 * 1024;
  }

  protected static get writeRetryDelayMilliseconds(): number {
    return 1;
  }

  protected static get $openPtyLibrary(): OpenPtyLibrary {
    const openPtyLibrary = this.loadOpenPtyLibrary();
    Object.defineProperty(this, '$openPtyLibrary', {
      configurable: true,
      value: openPtyLibrary,
    });
    return openPtyLibrary;
  }

  protected static get $terminalControlLibrary() {
    const terminalControlLibrary = dlopen('libc.so.6', {
      ioctl: {
        args: [FFIType.int, FFIType.u64, FFIType.ptr],
        returns: FFIType.int,
      },
      fcntl: {
        args: [FFIType.int, FFIType.int, FFIType.int],
        returns: FFIType.int,
      },
      write: {
        args: [FFIType.int, FFIType.ptr, FFIType.u64],
        returns: FFIType.i64,
      },
      __errno_location: {
        args: [],
        returns: FFIType.ptr,
      },
    });
    Object.defineProperty(this, '$terminalControlLibrary', {
      configurable: true,
      value: terminalControlLibrary,
    });
    return terminalControlLibrary;
  }

  protected static loadOpenPtyLibrary(): OpenPtyLibrary {
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

  protected readonly masterFileDescriptor: number;
  protected slaveFileDescriptorValue: number;
  protected fileStatusFlagsWithoutNonBlocking = 0;
  protected readStream: ReadStream | null = null;
  protected readStreamRestartTimer: ReturnType<typeof setTimeout> | null = null;
  protected dataCallbackRegistered = false;
  protected readonly writeQueue: QueuedPtyWrite[] = [];
  protected writeDrainTimer: ReturnType<typeof setTimeout> | null = null;
  protected closed = false;

  constructor(columns = 80, rows = 24) {
    const masterFileDescriptor = new Int32Array(1);
    const slaveFileDescriptor = new Int32Array(1);
    const openPtyClass = this.constructor as typeof $OpenPty;
    const openResult = openPtyClass.$openPtyLibrary.openpty(
      ptr(masterFileDescriptor),
      ptr(slaveFileDescriptor),
      null,
      null,
      null,
    );
    if (openResult !== 0)
      throw new Error(`openpty failed (result=${openResult})`);
    this.masterFileDescriptor = masterFileDescriptor[0] ?? -1;
    this.slaveFileDescriptorValue = slaveFileDescriptor[0] ?? -1;
    try {
      this.establishNonBlockingWrites();
      this.resize(columns, rows);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  get slaveFileDescriptor(): number {
    if (this.slaveFileDescriptorValue < 0) {
      throw new Error(
        'OpenPty slave file descriptor has already been released',
      );
    }
    return this.slaveFileDescriptorValue;
  }

  /** Start the single async master read path. Register before spawning when no startup bytes may drop. */
  onData(callback: (bytes: Uint8Array) => void): void {
    if (this.closed) return;
    if (this.dataCallbackRegistered)
      throw new Error('OpenPty data callback may only be registered once');
    this.dataCallbackRegistered = true;
    this.establishBlockingReadState();
    this.startMasterRead(callback);
  }

  protected startMasterRead(callback: (bytes: Uint8Array) => void): void {
    if (this.closed) return;
    const readStream = createReadStream('', {
      fd: this.masterFileDescriptor,
      autoClose: false,
    });
    this.readStream = readStream;
    readStream.on('data', (chunk: Buffer) => callback(new Uint8Array(chunk)));
    readStream.on('error', (error: NodeJS.ErrnoException) => {
      if (this.readStream === readStream) this.readStream = null;
      if (this.closed || error.code === 'EIO') return;
      if (error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK') {
        this.establishBlockingReadState();
        this.scheduleMasterReadRestart(callback);
        return;
      }
      setTimeout(() => {
        throw error;
      }, 0);
    });
    readStream.on('close', () => {
      if (this.readStream === readStream) {
        this.readStream = null;
      }
    });
  }

  protected scheduleMasterReadRestart(
    callback: (bytes: Uint8Array) => void,
  ): void {
    if (this.closed || this.readStreamRestartTimer) return;
    this.readStreamRestartTimer = setTimeout(() => {
      this.readStreamRestartTimer = null;
      this.startMasterRead(callback);
    }, 0);
  }

  write(data: string | Uint8Array): void {
    if (this.closed) return;
    const buffer =
      typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    if (buffer.length === 0) return;
    this.writeQueue.push({ buffer, writtenByteCount: 0 });
    this.scheduleWriteDrain();
  }

  protected establishNonBlockingWrites(): void {
    const openPtyClass = this.constructor as typeof $OpenPty;
    const currentFileStatusFlags =
      openPtyClass.$terminalControlLibrary.symbols.fcntl(
        this.masterFileDescriptor,
        openPtyClass.getFileStatusFlagsCommand,
        0,
      );
    if (currentFileStatusFlags < 0) {
      throw this.fileControlError('F_GETFL');
    }
    this.fileStatusFlagsWithoutNonBlocking =
      currentFileStatusFlags & ~openPtyClass.nonBlockingFileStatusFlag;
    this.establishNonBlockingWriteState();
  }

  protected establishNonBlockingWriteState(): void {
    const openPtyClass = this.constructor as typeof $OpenPty;
    const setFileStatusFlagsResult =
      openPtyClass.$terminalControlLibrary.symbols.fcntl(
        this.masterFileDescriptor,
        openPtyClass.setFileStatusFlagsCommand,
        this.fileStatusFlagsWithoutNonBlocking |
          openPtyClass.nonBlockingFileStatusFlag,
      );
    if (setFileStatusFlagsResult < 0) {
      throw this.fileControlError('F_SETFL');
    }
  }

  protected establishBlockingReadState(): void {
    const openPtyClass = this.constructor as typeof $OpenPty;
    const setFileStatusFlagsResult =
      openPtyClass.$terminalControlLibrary.symbols.fcntl(
        this.masterFileDescriptor,
        openPtyClass.setFileStatusFlagsCommand,
        this.fileStatusFlagsWithoutNonBlocking,
      );
    if (setFileStatusFlagsResult < 0) {
      throw this.fileControlError('F_SETFL');
    }
  }

  protected fileControlError(operationName: string): Error {
    return new Error(
      `OpenPty ${operationName} failed with errno ${this.currentErrno()}`,
    );
  }

  protected currentErrno(): number {
    const openPtyClass = this.constructor as typeof $OpenPty;
    const errnoPointer =
      openPtyClass.$terminalControlLibrary.symbols.__errno_location();
    if (!errnoPointer) {
      throw new Error('OpenPty errno pointer is unavailable');
    }
    return read.i32(errnoPointer, 0);
  }

  protected scheduleWriteDrain(delayMilliseconds = 0): void {
    if (this.closed || this.writeQueue.length === 0 || this.writeDrainTimer) {
      return;
    }
    this.writeDrainTimer = setTimeout(() => {
      this.writeDrainTimer = null;
      this.drainWriteQueue();
    }, delayMilliseconds);
  }

  protected drainWriteQueue(): void {
    if (this.closed || this.writeQueue.length === 0) return;
    const openPtyClass = this.constructor as typeof $OpenPty;
    let drainedByteCount = 0;
    let writeFailure: unknown = null;
    this.establishNonBlockingWriteState();
    try {
      while (
        this.writeQueue.length > 0 &&
        drainedByteCount < openPtyClass.writeChunkByteLimit
      ) {
        const queuedWrite = this.writeQueue[0];
        if (!queuedWrite) break;
        const remainingByteCount =
          queuedWrite.buffer.length - queuedWrite.writtenByteCount;
        const requestedByteCount = Math.min(
          remainingByteCount,
          openPtyClass.writeChunkByteLimit - drainedByteCount,
        );
        const writeResult = Number(
          openPtyClass.$terminalControlLibrary.symbols.write(
            this.masterFileDescriptor,
            ptr(queuedWrite.buffer, queuedWrite.writtenByteCount),
            BigInt(requestedByteCount),
          ),
        );
        if (writeResult < 0) {
          const errno = this.currentErrno();
          if (
            errno === openPtyClass.tryAgainErrno ||
            errno === openPtyClass.operationWouldBlockErrno
          ) {
            this.scheduleWriteDrain(openPtyClass.writeRetryDelayMilliseconds);
            return;
          }
          throw new Error(
            `PTY write failed with errno ${errno} after ` +
              `${queuedWrite.writtenByteCount} of ` +
              `${queuedWrite.buffer.length} bytes`,
          );
        }
        if (writeResult === 0) {
          throw new Error(
            `PTY write returned zero after ` +
              `${queuedWrite.writtenByteCount} of ` +
              `${queuedWrite.buffer.length} bytes`,
          );
        }
        queuedWrite.writtenByteCount += writeResult;
        drainedByteCount += writeResult;
        if (queuedWrite.writtenByteCount === queuedWrite.buffer.length) {
          this.writeQueue.shift();
        }
      }
    } catch (error) {
      writeFailure = error;
      throw error;
    } finally {
      if (this.dataCallbackRegistered && !this.closed) {
        try {
          this.establishBlockingReadState();
        } catch (error) {
          if (writeFailure === null) throw error;
        }
      }
    }
    this.scheduleWriteDrain();
  }

  resize(columns: number, rows: number): void {
    if (this.closed) return;
    const windowSize = new Uint16Array([
      Math.max(1, rows),
      Math.max(1, columns),
      0,
      0,
    ]);
    const openPtyClass = this.constructor as typeof $OpenPty;
    openPtyClass.$terminalControlLibrary.symbols.ioctl(
      this.masterFileDescriptor,
      openPtyClass.terminalWindowSizeRequest,
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
    if (this.writeDrainTimer) clearTimeout(this.writeDrainTimer);
    this.writeDrainTimer = null;
    this.writeQueue.length = 0;
    if (this.readStreamRestartTimer) {
      clearTimeout(this.readStreamRestartTimer);
    }
    this.readStreamRestartTimer = null;
    try {
      this.readStream?.destroy();
    } catch {
      // The stream is already gone.
    }
    this.readStream = null;
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

interface OpenPtyLibrary {
  openpty: (
    master: unknown,
    slave: unknown,
    name: unknown,
    terminalAttributes: unknown,
    windowSize: unknown,
  ) => number;
}

interface QueuedPtyWrite {
  buffer: Buffer;
  writtenByteCount: number;
}
