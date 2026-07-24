import { describe, expect, test } from 'bun:test';
import { SynchronizedOutputQuiescence } from './SynchronizedOutputQuiescence';

const beginSynchronizedOutput = '\x1b[?2026h';
const endSynchronizedOutput = '\x1b[?2026l';

describe('SynchronizedOutputQuiescence', () => {
  test('counts only complete paired frames from a recorded output shape', async () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    const completedFrame = quiescence.awaitNextCompletedFrame();
    quiescence.observe(`terminal setup${endSynchronizedOutput}`);
    expect(quiescence.completedFrameCount).toBe(0);
    quiescence.observe(`${beginSynchronizedOutput}frame body`);
    expect(quiescence.isFrameOpen).toBe(true);
    quiescence.observe(`${endSynchronizedOutput}terminal tail`);
    await completedFrame;
    expect(quiescence.completedFrameCount).toBe(1);
    expect(quiescence.isFrameOpen).toBe(false);
  });

  test('records byte arrival before downstream oracle work on a recorded stream', async () => {
    let currentTimestampMilliseconds = 3;
    const quiescence = new SynchronizedOutputQuiescence.Class(
      () => currentTimestampMilliseconds,
    );
    const completedFrame = quiescence.awaitNextCompletedFrame();
    quiescence.observe(`terminal setup${beginSynchronizedOutput}frame body`);
    currentTimestampMilliseconds = 7;
    quiescence.observe(endSynchronizedOutput);
    currentTimestampMilliseconds = 21;
    const observedFrame = await completedFrame;

    expect(observedFrame).toEqual({
      completedFrameCount: 1,
      byteArrivalTimestampMilliseconds: 7,
      observedByteCount: new TextEncoder().encode(
        `terminal setup${beginSynchronizedOutput}frame body${endSynchronizedOutput}`,
      ).length,
    });
    expect(quiescence.lastCompletedFrame).toEqual(observedFrame);
  });

  test('recognizes markers split at every PTY chunk boundary', async () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    const recordedFrame = `${beginSynchronizedOutput}paint${endSynchronizedOutput}`;
    const completedFrame = quiescence.awaitNextCompletedFrame();
    for (const recordedByte of new TextEncoder().encode(recordedFrame)) {
      quiescence.observe(new Uint8Array([recordedByte]));
    }
    await completedFrame;
    expect(quiescence.completedFrameCount).toBe(1);
  });

  test('does not complete until a nested synchronized frame closes', async () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    const completedFrame = quiescence.awaitNextCompletedFrame();
    quiescence.observe(`${beginSynchronizedOutput}${beginSynchronizedOutput}`);
    quiescence.observe(endSynchronizedOutput);
    expect(quiescence.completedFrameCount).toBe(0);
    quiescence.observe(endSynchronizedOutput);
    await completedFrame;
    expect(quiescence.completedFrameCount).toBe(1);
  });

  test('waits for a future completion event rather than resolving from a frame ordinal', async () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    quiescence.observe(`${beginSynchronizedOutput}first${endSynchronizedOutput}`);
    const nextCompletedFrame = quiescence.awaitNextCompletedFrame();
    quiescence.observe(`${beginSynchronizedOutput}second${endSynchronizedOutput}`);

    expect((await nextCompletedFrame).completedFrameCount).toBe(2);
  });

  test('asserts marker silence and rejects when a complete frame arrives', async () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    const quietInterval = quiescence.assertNoCompletedFrameFor(5);
    quiescence.observe('ordinary terminal bytes without a frame');
    await quietInterval;

    const brokenSilence = quiescence.assertNoCompletedFrameFor(1_000);
    quiescence.observe(`${beginSynchronizedOutput}paint${endSynchronizedOutput}`);
    await expect(brokenSilence).rejects.toThrow('Expected no complete synchronized frame');
  });
});
