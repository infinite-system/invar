import { expect, test } from 'bun:test';
import { VideoFrameStream } from './VideoFrameStream';
import type { VideoFrameSource } from './VideoFrameSource.interface';

class RecordingFrameSource implements VideoFrameSource {
  readCount = 0;
  disposed = false;
  releaseRead: (() => void) | null = null;

  async readFrameInto(target: Uint8Array): Promise<boolean> {
    this.readCount += 1;
    if (this.releaseRead === null && this.readCount === 1) {
      await new Promise<void>((resolve) => {
        this.releaseRead = resolve;
      });
    }
    target.fill(this.readCount);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.releaseRead?.();
  }
}

test('stream holds exactly two stable buffers and drops by overwrite', async () => {
  const source = new RecordingFrameSource();
  source.releaseRead = () => {};
  const stream = new VideoFrameStream.Class(source, 4, 2);
  const originalIdentities = [...stream.bufferIdentities];

  expect(await stream.pullFrame(0)).toBe(true);
  expect(await stream.pullFrame(5)).toBe(true);

  expect(stream.residentBufferCount).toBe(2);
  expect(stream.workingSetBytes).toBe(4 * 2 * 4 * 2);
  expect(
    new Set([...stream.bufferIdentities, ...originalIdentities]).size,
  ).toBe(2);
  expect(stream.decodedFrameCount).toBe(6);
  expect(stream.droppedFrameCount).toBe(4);
  expect(stream.showingFrame[0]).toBe(6);
});

test('an in-flight pull applies backpressure to another request', async () => {
  const source = new RecordingFrameSource();
  const stream = new VideoFrameStream.Class(source, 2, 2);

  const firstPull = stream.pullFrame(0);
  expect(await stream.pullFrame(1)).toBe(false);
  expect(source.readCount).toBe(1);
  source.releaseRead?.();
  expect(await firstPull).toBe(true);
  expect(source.readCount).toBe(1);

  stream.dispose();
  expect(source.disposed).toBe(true);
});
