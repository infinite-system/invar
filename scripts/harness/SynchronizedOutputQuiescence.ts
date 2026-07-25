// DEC private mode 2026 is OpenTUI's transaction boundary: bytes between BSU and ESU form one frame.
// This scanner runs on raw PTY chunks before emulation and preserves partial markers across chunks.
//
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
interface FrameWaiter {
  resolve: (completedFrame: CompletedSynchronizedFrame) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

interface FrameSilenceWaiter {
  startingCompletedFrameCount: number;
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export interface CompletedSynchronizedFrame {
  completedFrameCount: number;
  byteArrivalTimestampMilliseconds: number;
  observedByteCount: number;
}

class $SynchronizedOutputQuiescence {
  private matchedPrefixByteCount = 0;
  private synchronizedFrameDepth = 0;
  private completedFrameCountValue = 0;
  private observedByteCountValue = 0;
  private lastCompletedFrameValue: CompletedSynchronizedFrame | null = null;
  private readonly waiters: FrameWaiter[] = [];
  private readonly silenceWaiters: FrameSilenceWaiter[] = [];
  private failure: Error | null = null;

  constructor(
    private readonly currentTimestampMilliseconds: () => number = () => performance.now(),
  ) {}

  get completedFrameCount(): number {
    return this.completedFrameCountValue;
  }

  get lastCompletedFrame(): CompletedSynchronizedFrame | null {
    return this.lastCompletedFrameValue;
  }

  get isFrameOpen(): boolean {
    return this.synchronizedFrameDepth > 0;
  }

  observe(bytes: Uint8Array | string): void {
    const observedBytes = typeof bytes === 'string'
      ? new TextEncoder().encode(bytes)
      : bytes;
    for (const observedByte of observedBytes) this.observeByte(observedByte);
  }

  awaitNextCompletedFrame(
    timeoutMilliseconds = 30_000,
  ): Promise<CompletedSynchronizedFrame> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const waiter: FrameWaiter = {
        resolve,
        reject,
        timeoutHandle: setTimeout(() => {
          const waiterIndex = this.waiters.indexOf(waiter);
          if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
          reject(new Error(
            'Timed out waiting for the next complete synchronized frame '
            + `(completed frames observed: ${this.completedFrameCountValue})`,
          ));
        }, timeoutMilliseconds),
      };
      this.waiters.push(waiter);
    });
  }

  assertNoCompletedFrameFor(durationMilliseconds: number): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const silenceWaiter: FrameSilenceWaiter = {
        startingCompletedFrameCount: this.completedFrameCountValue,
        resolve,
        reject,
        timeoutHandle: setTimeout(() => {
          const waiterIndex = this.silenceWaiters.indexOf(silenceWaiter);
          if (waiterIndex >= 0) this.silenceWaiters.splice(waiterIndex, 1);
          resolve();
        }, durationMilliseconds),
      };
      this.silenceWaiters.push(silenceWaiter);
    });
  }

  fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeoutHandle);
      waiter.reject(error);
    }
    for (const silenceWaiter of this.silenceWaiters.splice(0)) {
      clearTimeout(silenceWaiter.timeoutHandle);
      silenceWaiter.reject(error);
    }
  }

  private observeByte(observedByte: number): void {
    this.observedByteCountValue++;
    if (this.matchedPrefixByteCount < synchronizedOutputMarkerPrefix.length) {
      const expectedByte = synchronizedOutputMarkerPrefix[this.matchedPrefixByteCount];
      if (observedByte === expectedByte) {
        this.matchedPrefixByteCount++;
      } else {
        this.matchedPrefixByteCount = observedByte === synchronizedOutputMarkerPrefix[0] ? 1 : 0;
      }
      return;
    }

    this.matchedPrefixByteCount = observedByte === synchronizedOutputMarkerPrefix[0] ? 1 : 0;
    if (observedByte === synchronizedOutputBeginFinalByte) {
      this.synchronizedFrameDepth++;
      return;
    }
    if (observedByte !== synchronizedOutputEndFinalByte || this.synchronizedFrameDepth === 0) return;
    this.synchronizedFrameDepth--;
    if (this.synchronizedFrameDepth > 0) return;
    this.completedFrameCountValue++;
    const completedFrame: CompletedSynchronizedFrame = {
      completedFrameCount: this.completedFrameCountValue,
      byteArrivalTimestampMilliseconds: this.currentTimestampMilliseconds(),
      observedByteCount: this.observedByteCountValue,
    };
    this.lastCompletedFrameValue = completedFrame;
    this.rejectBrokenSilenceWaiters(completedFrame);
    this.resolveSatisfiedWaiters(completedFrame);
  }

  private rejectBrokenSilenceWaiters(completedFrame: CompletedSynchronizedFrame): void {
    for (const silenceWaiter of this.silenceWaiters.splice(0)) {
      clearTimeout(silenceWaiter.timeoutHandle);
      silenceWaiter.reject(new Error(
        `Expected no complete synchronized frame for the requested interval, but frame `
        + `${completedFrame.completedFrameCount} followed frame `
        + `${silenceWaiter.startingCompletedFrameCount}`,
      ));
    }
  }

  private resolveSatisfiedWaiters(completedFrame: CompletedSynchronizedFrame): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeoutHandle);
      waiter.resolve(completedFrame);
    }
  }
}

export namespace SynchronizedOutputQuiescence {
  export const $Class = $SynchronizedOutputQuiescence;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

const synchronizedOutputMarkerPrefix = [27, 91, 63, 50, 48, 50, 54] as const;
const synchronizedOutputBeginFinalByte = 104;
const synchronizedOutputEndFinalByte = 108;
