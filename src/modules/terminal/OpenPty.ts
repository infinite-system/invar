// The shared openpty resource. Both roles use the same generator: the integrated terminal owns the
// master and gives a shell the slave, while the byte-level harness owns the master and gives Invar
// the slave. Child selection stays outside this class; allocation, sizing, byte transport, and
// descriptor ownership stay here.
//
// invariant: One openpty allocator serves both PTY roles (src/modules/terminal/terminal.invariants.md)
// invariant: Bracketed paste survives stream chunking (src/modules/ui/ui.invariants.md)
// invariant: Shared PTY writes never block the event loop (src/modules/terminal/terminal.invariants.md)
import { Static } from 'ivue/extras';
import { dlopen, FFIType, ptr, read } from 'bun:ffi';
import { closeSync, createReadStream, type ReadStream } from 'node:fs';

class $OpenPty {
  protected static get TERMINAL_WINDOW_SIZE_REQUEST(): bigint {
    return 0x5414n;
  }

  protected static get GET_FILE_STATUS_FLAGS_COMMAND(): number {
    return 3;
  }

  protected static get SET_FILE_STATUS_FLAGS_COMMAND(): number {
    return 4;
  }

  protected static get NON_BLOCKING_FILE_STATUS_FLAG(): number {
    return 0x800;
  }

  protected static get TRY_AGAIN_ERRNO(): number {
    return 11;
  }

  protected static get OPERATION_WOULD_BLOCK_ERRNO(): number {
    return 11;
  }

  protected static get writeChunkByteLimit(): number {
    return 16 * 1024;
  }

  protected static get WRITE_RETRY_DELAY_MILLISECONDS(): number {
    return 1;
  }

  protected static get $openPtyLibrary(): OpenPtyLibrary {
    const openPtyLibrary = this.loadOpenPtyLibrary();
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
      dup: {
        args: [FFIType.int],
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

  /** Give the read stream a duplicate, never the master. The stream closes the descriptor it holds
   *  when it is destroyed or reaches end-of-file, and it does that close from an I/O thread rather
   *  than from the turn that called `destroy()` — `autoClose: false` does not prevent it (measured
   *  on Bun 1.3.14, Linux arm64). Handing it the master gave the master two closers: the stream and
   *  `close()`. Whichever ran first freed the number, and the other one then closed whatever the
   *  process had allocated in the gap — a pty a second `OpenPty` had just opened, a file, a socket.
   *  The victim saw `EBADF` from a descriptor that had been valid one statement earlier, because the
   *  thief was not JavaScript. A private duplicate gives every descriptor exactly one closer. The
   *  duplicate shares the master's open file, so the status flags this class steers still govern it. */
  protected startMasterRead(callback: (bytes: Uint8Array) => void): void {
    if (this.closed) return;
    const readStream = createReadStream('', {
      fd: this.duplicateMasterFileDescriptor(),
      autoClose: true,
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

  protected duplicateMasterFileDescriptor(): number {
    const openPtyClass = this.constructor as typeof $OpenPty;
    const duplicateFileDescriptor =
      openPtyClass.$terminalControlLibrary.symbols.dup(
        this.masterFileDescriptor,
      );
    if (duplicateFileDescriptor < 0) {
      const failureErrno = this.currentErrno();
      throw this.fileControlError('dup', failureErrno);
    }
    return duplicateFileDescriptor;
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
    this.drainWriteQueueImmediately();
  }

  // Bytes the descriptor can accept right now must not wait for a timer turn.
  // `setTimeout(…, 0)` is clamped to a whole millisecond, and a keystroke
  // forwarded to a PTY master is a handful of bytes that the kernel buffer
  // accepts on the first try — so deferring the common case spent about a
  // millisecond of keystroke latency to serve the saturated case. Draining
  // inline stays non-blocking: `O_NONBLOCK` makes a full buffer report
  // `EAGAIN` immediately, and the queue plus its retry timer carry the
  // remainder exactly as before. A drain already scheduled owns the queue, so
  // this defers to it and preserves chunk order.
  protected drainWriteQueueImmediately(): void {
    if (this.closed || this.writeDrainTimer) return;
    try {
      this.drainWriteQueue();
    } catch (error) {
      // A genuine errno stays an asynchronous failure: it must not surface as a
      // throw out of the caller's keystroke, which never had a way to handle
      // it.
      setTimeout(() => {
        throw error;
      }, 0);
    }
  }

  protected establishNonBlockingWrites(): void {
    const openPtyClass = this.constructor as typeof $OpenPty;
    const currentFileStatusFlags =
      openPtyClass.$terminalControlLibrary.symbols.fcntl(
        this.masterFileDescriptor,
        openPtyClass.GET_FILE_STATUS_FLAGS_COMMAND,
        0,
      );
    if (currentFileStatusFlags < 0) {
      const failureErrno = this.currentErrno();
      throw this.fileControlError('F_GETFL', failureErrno);
    }
    this.fileStatusFlagsWithoutNonBlocking =
      currentFileStatusFlags & ~openPtyClass.NON_BLOCKING_FILE_STATUS_FLAG;
    this.establishNonBlockingWriteState();
  }

  protected establishNonBlockingWriteState(): void {
    const openPtyClass = this.constructor as typeof $OpenPty;
    this.applyFileStatusFlags(
      this.fileStatusFlagsWithoutNonBlocking |
        openPtyClass.NON_BLOCKING_FILE_STATUS_FLAG,
    );
  }

  protected establishBlockingReadState(): void {
    this.applyFileStatusFlags(this.fileStatusFlagsWithoutNonBlocking);
  }

  /** Set the master's status flags and prove they took. `F_SETFL` reporting success is not evidence
   *  that the requested flags are now in force: it reports on whatever descriptor the number named
   *  when the kernel ran, and a blocking-mode this class did not request is exactly the state
   *  `Shared PTY writes never block the event loop` forbids. So the flags are read back. */
  protected applyFileStatusFlags(requestedFileStatusFlags: number): void {
    const openPtyClass = this.constructor as typeof $OpenPty;
    const setFileStatusFlagsResult =
      openPtyClass.$terminalControlLibrary.symbols.fcntl(
        this.masterFileDescriptor,
        openPtyClass.SET_FILE_STATUS_FLAGS_COMMAND,
        requestedFileStatusFlags,
      );
    if (setFileStatusFlagsResult < 0) {
      // Read errno as the very first statement after the failed call. Anything interposed here —
      // a property chain that allocates, a string built for a message, a collection — can make a
      // failing syscall of its own and overwrite errno, which is how one of these failures was
      // reported as errno 11 (EAGAIN), a value `F_SETFL` cannot produce.
      const failureErrno = this.currentErrno();
      throw this.fileControlError('F_SETFL', failureErrno);
    }
    this.verifyFileStatusFlags(requestedFileStatusFlags);
  }

  /** Read the master's status flags back and require the non-blocking bit to be the requested one.
   *  Only that bit is compared because it is the only one this class steers; the kernel keeps the
   *  access mode and `O_LARGEFILE` regardless of what `F_SETFL` is handed. */
  protected verifyFileStatusFlags(requestedFileStatusFlags: number): void {
    const openPtyClass = this.constructor as typeof $OpenPty;
    const observedFileStatusFlags =
      openPtyClass.$terminalControlLibrary.symbols.fcntl(
        this.masterFileDescriptor,
        openPtyClass.GET_FILE_STATUS_FLAGS_COMMAND,
        0,
      );
    if (observedFileStatusFlags < 0) {
      const failureErrno = this.currentErrno();
      throw this.fileControlError('F_GETFL read-back', failureErrno);
    }
    const requestedNonBlocking =
      (requestedFileStatusFlags &
        openPtyClass.NON_BLOCKING_FILE_STATUS_FLAG) !==
      0;
    const observedNonBlocking =
      (observedFileStatusFlags & openPtyClass.NON_BLOCKING_FILE_STATUS_FLAG) !==
      0;
    if (requestedNonBlocking !== observedNonBlocking) {
      throw new Error(
        `OpenPty F_SETFL requested O_NONBLOCK=${requestedNonBlocking} on ` +
          `descriptor ${this.masterFileDescriptor} but it reports ` +
          `O_NONBLOCK=${observedNonBlocking} ` +
          `(requested flags 0x${requestedFileStatusFlags.toString(16)}, ` +
          `observed flags 0x${observedFileStatusFlags.toString(16)})`,
      );
    }
  }

  protected fileControlError(
    operationName: string,
    failureErrno: number,
  ): Error {
    return new Error(
      `OpenPty ${operationName} failed with errno ${failureErrno}`,
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
            errno === openPtyClass.TRY_AGAIN_ERRNO ||
            errno === openPtyClass.OPERATION_WOULD_BLOCK_ERRNO
          ) {
            this.scheduleWriteDrain(
              openPtyClass.WRITE_RETRY_DELAY_MILLISECONDS,
            );
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
      openPtyClass.TERMINAL_WINDOW_SIZE_REQUEST,
      ptr(windowSize),
    );
  }

  /** The child inherited the slave; close only the parent's copy so master EOF remains meaningful.
   *  `slaveFileDescriptorValue` is the state that says whether this copy is still ours, so it is the
   *  only guard: a close that fails while we still hold the descriptor is a second closer somewhere,
   *  which is the defect this class was just repaired for, and it must be heard. `Bun.spawn` does not
   *  take ownership of a descriptor number passed in `stdio` (measured on Bun 1.3.14, Linux arm64). */
  releaseSlaveFileDescriptor(): void {
    if (this.slaveFileDescriptorValue < 0) return;
    const releasedFileDescriptor = this.slaveFileDescriptorValue;
    this.slaveFileDescriptorValue = -1;
    closeSync(releasedFileDescriptor);
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
    // The master has exactly one closer, so this must succeed. Swallowing its failure is what let
    // the double close live: the losing close returned EBADF and nobody heard it, while the winning
    // one had already handed the number to an unrelated descriptor. `closed` is the state that says
    // whether the descriptor is still ours, and it is checked at the top of this method.
    if (this.masterFileDescriptor >= 0) {
      closeSync(this.masterFileDescriptor);
    }
  }
}

export namespace OpenPty {
  export const $Class = Static($OpenPty);
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
