import type { VideoFrameSource } from './VideoFrameSource.interface';

// invariant: Video decoding never exceeds the showing and decoding frames (src/modules/media/media.invariants.md)
// invariant: Playback memory is independent of duration (src/modules/media/media.invariants.md)
class $VideoFrameStream {
  constructor(
    protected readonly source: VideoFrameSource,
    readonly width: number,
    readonly height: number,
  ) {
    const frameByteLength =
      Math.max(1, Math.floor(width)) * Math.max(2, Math.floor(height)) * 4;
    this.showingFrameStorage = new Uint8Array(frameByteLength);
    this.decodingFrameStorage = new Uint8Array(frameByteLength);
  }

  protected showingFrameStorage: Uint8Array;
  protected decodingFrameStorage: Uint8Array;
  protected pullInFlight = false;
  protected decodedFrameIndexValue = -1;
  protected decodedFrameCountValue = 0;
  protected droppedFrameCountValue = 0;
  protected disposed = false;

  get showingFrame(): Uint8Array {
    return this.showingFrameStorage;
  }

  get decodedFrameIndex(): number {
    return this.decodedFrameIndexValue;
  }

  get decodedFrameCount(): number {
    return this.decodedFrameCountValue;
  }

  get droppedFrameCount(): number {
    return this.droppedFrameCountValue;
  }

  get residentBufferCount(): number {
    return 2;
  }

  get workingSetBytes(): number {
    return (
      this.showingFrameStorage.byteLength + this.decodingFrameStorage.byteLength
    );
  }

  get bufferIdentities(): readonly Uint8Array[] {
    return [this.showingFrameStorage, this.decodingFrameStorage];
  }

  async pullFrame(targetFrameIndex: number): Promise<boolean> {
    if (this.disposed || this.pullInFlight) return false;
    const normalizedTargetFrameIndex = Math.max(
      this.decodedFrameIndexValue + 1,
      Math.floor(targetFrameIndex),
    );
    this.pullInFlight = true;
    try {
      for (
        let frameIndex = this.decodedFrameIndexValue + 1;
        frameIndex <= normalizedTargetFrameIndex;
        frameIndex++
      ) {
        const complete = await this.source.readFrameInto(
          this.decodingFrameStorage,
        );
        if (!complete) return false;
        this.decodedFrameCountValue += 1;
        if (frameIndex < normalizedTargetFrameIndex) {
          this.droppedFrameCountValue += 1;
        }
      }
      const previousShowingFrame = this.showingFrameStorage;
      this.showingFrameStorage = this.decodingFrameStorage;
      this.decodingFrameStorage = previousShowingFrame;
      this.decodedFrameIndexValue = normalizedTargetFrameIndex;
      return true;
    } finally {
      this.pullInFlight = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.source.dispose();
  }
}

export namespace VideoFrameStream {
  export const $Class = $VideoFrameStream;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
