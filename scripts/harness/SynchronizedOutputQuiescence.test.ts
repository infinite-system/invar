import { describe, expect, test } from 'bun:test';
import {
  SynchronizedOutputQuiescence,
  type CompletedSynchronizedFrame,
} from './SynchronizedOutputQuiescence';

const beginSynchronizedOutput = '\x1b[?2026h';
const endSynchronizedOutput = '\x1b[?2026l';

describe('SynchronizedOutputQuiescence', () => {
  test('counts only complete paired frames from a recorded output shape', () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    expect(
      quiescence.observe(`terminal setup${endSynchronizedOutput}`),
    ).toEqual([]);
    expect(quiescence.completedFrameCount).toBe(0);
    expect(quiescence.observe(`${beginSynchronizedOutput}frame body`)).toEqual(
      [],
    );
    expect(quiescence.isFrameOpen).toBe(true);
    const completedFrames = quiescence.observe(
      `${endSynchronizedOutput}terminal tail`,
    );
    expect(completedFrames).toHaveLength(1);
    expect(quiescence.completedFrameCount).toBe(1);
    expect(quiescence.isFrameOpen).toBe(false);
  });

  test('records byte arrival before downstream oracle work on a recorded stream', () => {
    let currentTimestampMilliseconds = 3;
    const quiescence = new SynchronizedOutputQuiescence.Class(
      () => currentTimestampMilliseconds,
    );
    quiescence.observe(`terminal setup${beginSynchronizedOutput}frame body`);
    currentTimestampMilliseconds = 7;
    const [observedFrame] = quiescence.observe(endSynchronizedOutput);
    currentTimestampMilliseconds = 21;
    if (!observedFrame) throw new Error('expected a completed frame');

    expect(observedFrame).toEqual({
      completedFrameCount: 1,
      byteArrivalTimestampMilliseconds: 7,
      observedByteCount: new TextEncoder().encode(
        `terminal setup${beginSynchronizedOutput}frame body${endSynchronizedOutput}`,
      ).length,
    });
    expect(quiescence.lastCompletedFrame).toEqual(observedFrame);
  });

  test('recognizes markers split at every PTY chunk boundary', () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    const recordedFrame = `${beginSynchronizedOutput}paint${endSynchronizedOutput}`;
    const completedFrames: CompletedSynchronizedFrame[] = [];
    for (const recordedByte of new TextEncoder().encode(recordedFrame)) {
      completedFrames.push(
        ...quiescence.observe(new Uint8Array([recordedByte])),
      );
    }
    expect(completedFrames).toHaveLength(1);
    expect(quiescence.completedFrameCount).toBe(1);
  });

  test('does not complete until a nested synchronized frame closes', () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    expect(
      quiescence.observe(
        `${beginSynchronizedOutput}${beginSynchronizedOutput}`,
      ),
    ).toEqual([]);
    expect(quiescence.observe(endSynchronizedOutput)).toEqual([]);
    expect(quiescence.completedFrameCount).toBe(0);
    expect(quiescence.observe(endSynchronizedOutput)).toHaveLength(1);
    expect(quiescence.completedFrameCount).toBe(1);
  });

  test('returns every completed frame already observed in the supplied bytes', () => {
    const quiescence = new SynchronizedOutputQuiescence.Class();
    const completedFrames = quiescence.observe(
      `${beginSynchronizedOutput}first${endSynchronizedOutput}` +
        `${beginSynchronizedOutput}second${endSynchronizedOutput}`,
    );

    expect(completedFrames.map((frame) => frame.completedFrameCount)).toEqual([
      1, 2,
    ]);
  });
});
