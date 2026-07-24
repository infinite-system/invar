// DEC private mode 2026 is OpenTUI's transaction boundary: bytes between BSU and ESU form one frame.
// This scanner runs on raw PTY chunks before emulation and preserves partial markers across chunks.
//
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
interface FrameWaiter {
  targetCompletedFrameCount: number;
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

class $SynchronizedOutputQuiescence {
  private matchedPrefixByteCount = 0;
  private synchronizedFrameDepth = 0;
  private completedFrameCountValue = 0;
  private readonly waiters: FrameWaiter[] = [];
  private failure: Error | null = null;

  get completedFrameCount(): number {
    return this.completedFrameCountValue;
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

  awaitCompletedFrame(
    targetCompletedFrameCount: number,
    timeoutMilliseconds = 10_000,
  ): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.completedFrameCountValue >= targetCompletedFrameCount) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter: FrameWaiter = {
        targetCompletedFrameCount,
        resolve,
        reject,
        timeoutHandle: setTimeout(() => {
          const waiterIndex = this.waiters.indexOf(waiter);
          if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
          reject(new Error(
            `Timed out waiting for synchronized frame ${targetCompletedFrameCount} `
            + `(completed ${this.completedFrameCountValue})`,
          ));
        }, timeoutMilliseconds),
      };
      this.waiters.push(waiter);
    });
  }

  fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeoutHandle);
      waiter.reject(error);
    }
  }

  private observeByte(observedByte: number): void {
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
    this.resolveSatisfiedWaiters();
  }

  private resolveSatisfiedWaiters(): void {
    for (let waiterIndex = this.waiters.length - 1; waiterIndex >= 0; waiterIndex--) {
      const waiter = this.waiters[waiterIndex];
      if (!waiter || waiter.targetCompletedFrameCount > this.completedFrameCountValue) continue;
      this.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeoutHandle);
      waiter.resolve();
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
