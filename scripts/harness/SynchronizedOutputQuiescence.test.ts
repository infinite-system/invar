import { describe, expect, test } from 'bun:test';
import { SynchronizedOutputQuiescence } from './SynchronizedOutputQuiescence';

const beginSynchronizedOutput = '\x1b[?2026h';
const endSynchronizedOutput = '\x1b[?2026l';

describe('SynchronizedOutputQuiescence', () => {
  test('counts only complete paired frames from a recorded output shape', async () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    const completedFrame = quiescence.awaitCompletedFrame(1);
    quiescence.observe(`terminal setup${endSynchronizedOutput}`);
    expect(quiescence.completedFrameCount).toBe(0);
    quiescence.observe(`${beginSynchronizedOutput}frame body`);
    expect(quiescence.isFrameOpen).toBe(true);
    quiescence.observe(`${endSynchronizedOutput}terminal tail`);
    await completedFrame;
    expect(quiescence.completedFrameCount).toBe(1);
    expect(quiescence.isFrameOpen).toBe(false);
  });

  test('recognizes markers split at every PTY chunk boundary', async () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    const recordedFrame = `${beginSynchronizedOutput}paint${endSynchronizedOutput}`;
    const completedFrame = quiescence.awaitCompletedFrame(1);
    for (const recordedByte of new TextEncoder().encode(recordedFrame)) {
      quiescence.observe(new Uint8Array([recordedByte]));
    }
    await completedFrame;
    expect(quiescence.completedFrameCount).toBe(1);
  });

  test('does not complete until a nested synchronized frame closes', async () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    quiescence.observe(`${beginSynchronizedOutput}${beginSynchronizedOutput}`);
    quiescence.observe(endSynchronizedOutput);
    expect(quiescence.completedFrameCount).toBe(0);
    quiescence.observe(endSynchronizedOutput);
    await quiescence.awaitCompletedFrame(1);
    expect(quiescence.completedFrameCount).toBe(1);
  });
});
