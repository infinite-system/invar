// The speech-queue bound (review perf 9): pending narration must never accumulate unbounded while
// slow playback drains — the policy is drop-OLDEST past the cap, so what eventually plays is the
// newest speech, the speech that still describes the screen. Tested through the pure static (this
// box detects no TTS engine, so the full backend is silent by construction).
import { describe, test, expect } from 'bun:test';
import { SystemTtsBackend } from './SystemTtsBackend';
import { Processes } from '../system/Processes';

class InspectableSystemTtsBackend extends SystemTtsBackend.$Class {
  static get maximumPendingUtterancesForTest(): number {
    return super.MAXIMUM_PENDING_UTTERANCES;
  }
}

describe('SystemTtsBackend.enqueueBounded', () => {
  test('under the cap everything queues in order', () => {
    const queue: string[] = [];
    for (
      let index = 0;
      index < InspectableSystemTtsBackend.maximumPendingUtterancesForTest;
      index++
    ) {
      SystemTtsBackend.Class.enqueueBounded(
        queue,
        `utterance ${index}`,
        InspectableSystemTtsBackend.maximumPendingUtterancesForTest,
      );
    }
    expect(queue.length).toBe(
      InspectableSystemTtsBackend.maximumPendingUtterancesForTest,
    );
    expect(queue[0]).toBe('utterance 0');
  });

  test('past the cap the OLDEST utterances drop and the newest survive', () => {
    const queue: string[] = [];
    for (
      let index = 0;
      index < InspectableSystemTtsBackend.maximumPendingUtterancesForTest * 3;
      index++
    ) {
      SystemTtsBackend.Class.enqueueBounded(
        queue,
        `utterance ${index}`,
        InspectableSystemTtsBackend.maximumPendingUtterancesForTest,
      );
    }
    expect(queue.length).toBe(
      InspectableSystemTtsBackend.maximumPendingUtterancesForTest,
    );
    expect(queue[0]).toBe(
      `utterance ${InspectableSystemTtsBackend.maximumPendingUtterancesForTest * 2}`,
    );
    expect(queue[queue.length - 1]).toBe(
      `utterance ${InspectableSystemTtsBackend.maximumPendingUtterancesForTest * 3 - 1}`,
    );
  });

  test('the queue length is bounded at every step, not only at the end', () => {
    const queue: string[] = [];
    for (let index = 0; index < 100; index++) {
      SystemTtsBackend.Class.enqueueBounded(queue, `utterance ${index}`, 3);
      expect(queue.length).toBeLessThanOrEqual(3);
    }
  });
});

test('live playback is serial and starts the next utterance only after the active one exits', async () => {
  const startedUtterances: string[] = [];
  const completeProcesses: Array<() => void> = [];

  class SerialTestProcesses extends Processes.$Class {
    static override spawn(
      ...spawnArguments: Parameters<typeof Processes.Class.spawn>
    ): ReturnType<typeof Processes.Class.spawn> {
      const argumentVector = spawnArguments[0];
      startedUtterances.push(
        argumentVector[argumentVector.length - 1] as string,
      );
      let completeProcess = (): void => {};
      const exited = new Promise<number>((resolveExit) => {
        completeProcess = () => resolveExit(0);
      });
      completeProcesses.push(completeProcess);
      return {
        kill: (): void => {},
        exited,
      } as ReturnType<typeof Processes.Class.spawn>;
    }
  }

  class SerialSystemTtsBackend extends SystemTtsBackend.$Class {
    protected override get Processes() {
      return SerialTestProcesses;
    }
  }

  const backend = new SerialSystemTtsBackend({
    enginePath: '/test/direct-speech-engine',
  });
  backend.speak('first utterance');
  backend.speak('second utterance');
  backend.speak('third utterance');
  expect(startedUtterances).toEqual(['first utterance']);

  completeProcesses.shift()?.();
  await Promise.resolve();
  expect(startedUtterances).toEqual(['first utterance', 'second utterance']);

  completeProcesses.shift()?.();
  await Promise.resolve();
  expect(startedUtterances).toEqual([
    'first utterance',
    'second utterance',
    'third utterance',
  ]);
  backend.dispose();
});

// The rate setting is a SPEED MULTIPLIER (higher = faster) — the user-facing axis. Each engine maps it
// to its own argument: piper's --length_scale stretches DURATION (so it inverts: 1/rate), espeak/say
// take words-per-minute (so it scales up: 175×rate). Both directions are asserted so a future
// regression cannot silently flip the axis back.
describe('SystemTtsBackend engine-argument rate mapping (speed multiplier: higher = faster)', () => {
  test('normal speed 1.0 maps to piper length_scale 1.0 and espeak 175 wpm', () => {
    expect(SystemTtsBackend.Class.toLengthScale(1.0)).toBe(1.0);
    expect(SystemTtsBackend.Class.toWordsPerMinute(1.0)).toBe(175);
  });

  test('FASTER (rate 2.0) means a LOWER piper length_scale and a HIGHER espeak wpm', () => {
    expect(SystemTtsBackend.Class.toLengthScale(2.0)).toBe(0.5);
    expect(SystemTtsBackend.Class.toWordsPerMinute(2.0)).toBe(350);
    expect(SystemTtsBackend.Class.toLengthScale(2.0)).toBeLessThan(
      SystemTtsBackend.Class.toLengthScale(1.0),
    );
    expect(SystemTtsBackend.Class.toWordsPerMinute(2.0)).toBeGreaterThan(
      SystemTtsBackend.Class.toWordsPerMinute(1.0),
    );
  });

  test('SLOWER (rate 0.5) means a HIGHER piper length_scale and a LOWER espeak wpm', () => {
    expect(SystemTtsBackend.Class.toLengthScale(0.5)).toBe(2.0);
    expect(SystemTtsBackend.Class.toWordsPerMinute(0.5)).toBe(88); // round(175 × 0.5)
    expect(SystemTtsBackend.Class.toLengthScale(0.5)).toBeGreaterThan(
      SystemTtsBackend.Class.toLengthScale(1.0),
    );
    expect(SystemTtsBackend.Class.toWordsPerMinute(0.5)).toBeLessThan(
      SystemTtsBackend.Class.toWordsPerMinute(1.0),
    );
  });

  test('extreme rates clamp to the sane band instead of exploding an engine argument', () => {
    expect(SystemTtsBackend.Class.toLengthScale(0)).toBe(5.0); // clamped to the 0.2 speed floor
    expect(SystemTtsBackend.Class.toLengthScale(1000)).toBe(0.1); // clamped to the 10 speed ceiling
    expect(SystemTtsBackend.Class.toWordsPerMinute(0)).toBe(50); // wpm floor
    expect(SystemTtsBackend.Class.toWordsPerMinute(1000)).toBe(500); // wpm ceiling
  });
});
