import { describe, expect, test } from 'bun:test';
import { ref } from 'vue';
import { AgentSpinner, type SpinnerScheduler } from './AgentSpinner';
import { AgentSpinnerFrames } from './AgentSpinnerFrames';

/** A controllable clock: capture the interval callback so a test can tick it deterministically. */
function fakeScheduler(): {
  scheduler: SpinnerScheduler;
  tick: () => void;
  armed: () => boolean;
  advance: (milliseconds: number) => void;
} {
  let callback: (() => void) | null = null;
  let clockMilliseconds = 0;
  return {
    scheduler: {
      setInterval: (intervalCallback) => {
        callback = intervalCallback;
        return 1;
      },
      clearInterval: () => {
        callback = null;
      },
      now: () => clockMilliseconds,
    },
    tick: () => callback?.(),
    armed: () => callback !== null,
    advance: (milliseconds: number) => {
      clockMilliseconds += milliseconds;
    },
  };
}

describe('AgentSpinnerFrames', () => {
  test('the braille cycle advances and wraps by frame index (unicode tier)', () => {
    const first = AgentSpinnerFrames.Class.glyphFor(0, 'unicode');
    const second = AgentSpinnerFrames.Class.glyphFor(1, 'unicode');
    expect(first).not.toBe(second);
    expect(AgentSpinnerFrames.Class.glyphFor(8, 'unicode')).toBe(first); // 8-frame cycle wraps
  });

  test('the ascii tier animates with a rotating bar (no braille)', () => {
    const frames = [0, 1, 2, 3].map((index) =>
      AgentSpinnerFrames.Class.glyphFor(index, 'ascii'),
    );
    expect(frames).toEqual(['|', '/', '-', '\\']);
    expect(AgentSpinnerFrames.Class.glyphFor(4, 'ascii')).toBe('|'); // 4-frame cycle wraps
  });

  test('the label is "Thinking…" while streaming and "Running <tool>…" while a tool runs', () => {
    expect(
      AgentSpinnerFrames.Class.labelFor('streaming', null, 'unicode'),
    ).toBe('Thinking…');
    expect(
      AgentSpinnerFrames.Class.labelFor('awaiting-tool', 'Bash', 'unicode'),
    ).toBe('Running Bash…');
    expect(
      AgentSpinnerFrames.Class.labelFor('awaiting-tool', null, 'unicode'),
    ).toBe('Running…');
    expect(AgentSpinnerFrames.Class.labelFor('streaming', null, 'ascii')).toBe(
      'Thinking...',
    );
  });
});

describe('AgentSpinner (injected clock)', () => {
  test('the derived running source arms and disarms the timer', () => {
    const clock = fakeScheduler();
    const turnVisibleAndInFlight = ref(false);
    const spinner = new AgentSpinner.Class(
      () => turnVisibleAndInFlight.value,
      clock.scheduler,
    );

    expect(spinner.running).toBe(false);
    expect(clock.armed()).toBe(false);

    turnVisibleAndInFlight.value = true;
    expect(spinner.running).toBe(true);
    expect(clock.armed()).toBe(true);

    clock.tick();
    clock.tick();
    expect(spinner.frame.value).toBe(2);

    turnVisibleAndInFlight.value = false;
    expect(spinner.running).toBe(false);
    expect(clock.armed()).toBe(false);
    expect(spinner.frame.value).toBe(0); // reset so the next busy spell starts clean
  });

  test('an unchanged derived source cannot arm a second timer', () => {
    const clock = fakeScheduler();
    const turnVisibleAndInFlight = ref(false);
    const spinner = new AgentSpinner.Class(
      () => turnVisibleAndInFlight.value,
      clock.scheduler,
    );
    turnVisibleAndInFlight.value = true;
    turnVisibleAndInFlight.value = true;
    clock.tick();
    expect(spinner.frame.value).toBe(1);
    turnVisibleAndInFlight.value = false;
    turnVisibleAndInFlight.value = false;
    expect(spinner.running).toBe(false);
  });

  test('dispose stops the timer (no ticking at rest)', () => {
    const clock = fakeScheduler();
    const turnVisibleAndInFlight = ref(true);
    const spinner = new AgentSpinner.Class(
      () => turnVisibleAndInFlight.value,
      clock.scheduler,
    );
    spinner.dispose();
    expect(clock.armed()).toBe(false);
    expect(spinner.running).toBe(false);
  });

  test('elapsedSeconds counts whole seconds since start; 0 at rest', () => {
    const clock = fakeScheduler();
    const turnVisibleAndInFlight = ref(false);
    const spinner = new AgentSpinner.Class(
      () => turnVisibleAndInFlight.value,
      clock.scheduler,
    );
    expect(spinner.elapsedSeconds()).toBe(0); // at rest
    turnVisibleAndInFlight.value = true;
    clock.advance(2500);
    expect(spinner.elapsedSeconds()).toBe(2);
    clock.advance(1000);
    expect(spinner.elapsedSeconds()).toBe(3);
    turnVisibleAndInFlight.value = false;
    expect(spinner.elapsedSeconds()).toBe(0); // torn down at rest
  });
});
