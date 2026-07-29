// DEC private mode 2026 is OpenTUI's transaction boundary: bytes between BSU and ESU form one frame.
// This scanner runs on raw PTY chunks before emulation and preserves partial markers across chunks.
//
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
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
  private failure: Error | null = null;

  constructor(
    private readonly currentTimestampMilliseconds: () => number = () =>
      performance.now(),
  ) {}

  get completedFrameCount(): number {
    return this.completedFrameCountValue;
  }

  get observedByteCount(): number {
    return this.observedByteCountValue;
  }

  get lastCompletedFrame(): CompletedSynchronizedFrame | null {
    return this.lastCompletedFrameValue;
  }

  get isFrameOpen(): boolean {
    return this.synchronizedFrameDepth > 0;
  }

  observe(bytes: Uint8Array | string): readonly CompletedSynchronizedFrame[] {
    const observedBytes =
      typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    const completedFrames: CompletedSynchronizedFrame[] = [];
    for (const observedByte of observedBytes) {
      const completedFrame = this.observeByte(observedByte);
      if (completedFrame) completedFrames.push(completedFrame);
    }
    return completedFrames;
  }

  fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
  }

  throwIfFailed(): void {
    if (this.failure) throw this.failure;
  }

  private observeByte(observedByte: number): CompletedSynchronizedFrame | null {
    this.observedByteCountValue++;
    if (this.matchedPrefixByteCount < synchronizedOutputMarkerPrefix.length) {
      const expectedByte =
        synchronizedOutputMarkerPrefix[this.matchedPrefixByteCount];
      if (observedByte === expectedByte) {
        this.matchedPrefixByteCount++;
      } else {
        this.matchedPrefixByteCount =
          observedByte === synchronizedOutputMarkerPrefix[0] ? 1 : 0;
      }
      return null;
    }

    this.matchedPrefixByteCount =
      observedByte === synchronizedOutputMarkerPrefix[0] ? 1 : 0;
    if (observedByte === synchronizedOutputBeginFinalByte) {
      this.synchronizedFrameDepth++;
      return null;
    }
    if (
      observedByte !== synchronizedOutputEndFinalByte ||
      this.synchronizedFrameDepth === 0
    )
      return null;
    this.synchronizedFrameDepth--;
    if (this.synchronizedFrameDepth > 0) return null;
    this.completedFrameCountValue++;
    const completedFrame: CompletedSynchronizedFrame = {
      completedFrameCount: this.completedFrameCountValue,
      byteArrivalTimestampMilliseconds: this.currentTimestampMilliseconds(),
      observedByteCount: this.observedByteCountValue,
    };
    this.lastCompletedFrameValue = completedFrame;
    return completedFrame;
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
