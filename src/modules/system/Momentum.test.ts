import { test, expect, describe } from 'bun:test';
import {
  Momentum,
  type MomentumOptions,
  type ScrollMomentum,
} from './Momentum';

// No-decay options: isolate the crossing-regularity property from the decay curve.
const NO_DECAY: MomentumOptions = {
  impulse: 10,
  max: 100,
  decayPerSec: 1,
  stopVelocity: 0.0001,
};

describe('scroll-momentum', () => {
  test('the tuned default and vertical physics values remain exact', () => {
    expect(Momentum.Class.defaultOptions).toEqual({
      impulse: 22,
      max: 80,
      decayPerSec: 0.015,
      stopVelocity: 3,
      maximumGlideDurationMilliseconds: 900,
    });
    expect(Momentum.Class.verticalOptions).toEqual({
      impulse: 34,
      max: 220,
      decayPerSec: 0.015,
      stopVelocity: 3,
      maximumGlideDurationMilliseconds: 900,
    });
  });

  test('at rest emits no rows', () => {
    expect(
      Momentum.Class.stepMomentum(Momentum.Class.AT_REST, 1 / 30).rows,
    ).toBe(0);
    expect(Momentum.Class.isMoving(Momentum.Class.AT_REST)).toBe(false);
  });

  test('real-rate input queues every impulse for one animation write', () => {
    const momentum = Momentum.Class.AT_REST;
    for (let eventIndex = 0; eventIndex < 150; eventIndex++) {
      Momentum.Class.queueImpulse(momentum, 1, eventIndex * 7);
    }

    expect(momentum.velocity).toBe(0);
    expect(Momentum.Class.isMoving(momentum)).toBe(true);
    const stepped = Momentum.Class.stepMomentum(
      momentum,
      1 / 30,
      Momentum.Class.verticalOptions,
    );
    expect(stepped.momentum.restEquivalentGestureImpulseCount).toBe(150);
    expect(stepped.momentum.pendingImpulses).toEqual([]);
    expect(stepped.momentum.velocity).toBe(220);
  });

  test('the configured glide duration bounds the tail after input', () => {
    const momentum = Momentum.Class.AT_REST;
    for (let eventIndex = 0; eventIndex < 150; eventIndex++) {
      Momentum.Class.queueImpulse(momentum, 1, eventIndex * 7);
    }
    let currentMomentum = momentum;
    let frameCount = 0;
    let rowsTravelled = 0;
    while (Momentum.Class.isMoving(currentMomentum) && frameCount < 100) {
      const stepped = Momentum.Class.stepMomentum(
        currentMomentum,
        1 / 30,
        Momentum.Class.verticalOptions,
      );
      currentMomentum = stepped.momentum;
      rowsTravelled += stepped.rows;
      frameCount++;
    }

    expect(frameCount).toBe(27);
    expect(rowsTravelled).toBe(164);
    expect(Momentum.Class.isMoving(currentMomentum)).toBe(false);
  });

  test('the glide cap eases a ceiling velocity to zero before halting', () => {
    // Both legs PIN the easing window: this test owns the mechanism, not the
    // shipped tuning. Reading the production constant here made a feel change
    // (150ms -> 200ms) fail a test about whether easing works at all.
    class $UnsoftenedMomentum extends Momentum.$Class {
      protected static override get GLIDE_CAP_EASING_DURATION_MILLISECONDS() {
        return 0;
      }
    }
    class $EasedMomentum extends Momentum.$Class {
      protected static override get GLIDE_CAP_EASING_DURATION_MILLISECONDS() {
        return 100;
      }
    }
    // The cap must exceed the easing window, or there is no full-speed phase to
    // taper AWAY from and the shape under test never occurs.
    const cappedNoDecayOptions = {
      ...NO_DECAY,
      maximumGlideDurationMilliseconds: 300,
    };
    const rowCrossingSequence = (
      momentumClass: typeof Momentum.$Class,
    ): number[] => {
      let momentum: ScrollMomentum = {
        velocity: 100,
        residual: 0,
        millisecondsSinceLastImpulse: 0,
      };
      const rowsCrossed: number[] = [];
      while (Momentum.Class.isMoving(momentum)) {
        const stepped = momentumClass.stepMomentum(
          momentum,
          0.05,
          cappedNoDecayOptions,
        );
        momentum = stepped.momentum;
        rowsCrossed.push(stepped.rows);
      }
      return rowsCrossed;
    };
    // The property is not "every frame is smaller than the last" — a real glide
    // holds a plateau first. It is that a ceiling-speed glide does NOT end at
    // ceiling speed: the final crossing must fall below the plateau.
    const endsBelowPlateau = (rowsCrossed: readonly number[]): boolean =>
      rowsCrossed[rowsCrossed.length - 1]! < Math.max(...rowsCrossed);

    const unsoftenedRows = rowCrossingSequence($UnsoftenedMomentum);
    expect(unsoftenedRows).toEqual([5, 5, 5, 5, 5, 5]);
    expect(endsBelowPlateau(unsoftenedRows)).toBe(false);

    const easedRows = rowCrossingSequence($EasedMomentum);
    expect(easedRows).toEqual([5, 5, 5, 5, 3, 1]);
    expect(endsBelowPlateau(easedRows)).toBe(true);

    // Separately, and weakly on purpose: whatever the shipped easing is tuned
    // to, it must still produce a taper. This one survives retuning.
    expect(endsBelowPlateau(rowCrossingSequence(Momentum.Class))).toBe(true);
  });

  test('representative glide caps halt no later than their deadline', () => {
    for (const maximumGlideDurationMilliseconds of [100, 900, 2_000]) {
      const options = {
        ...Momentum.Class.verticalOptions,
        maximumGlideDurationMilliseconds,
      };
      let momentum: ScrollMomentum = {
        ...Momentum.Class.AT_REST,
        velocity: options.max,
        ceilingSustainingVelocity: options.max * 100,
      };
      while (Momentum.Class.isMoving(momentum)) {
        momentum = Momentum.Class.stepMomentum(
          momentum,
          0.01,
          options,
        ).momentum;
      }

      expect(momentum.millisecondsSinceLastImpulse).toBeLessThanOrEqual(
        maximumGlideDurationMilliseconds + Number.EPSILON,
      );
    }
  });

  test('an impulse sets velocity in the wheel direction and accumulates progressively', () => {
    // Gain ramps from 30% at rest toward full strength over twenty notches' worth of velocity:
    // the first notch is a precision step; persistence across separate flicks buys speed.
    let momentum = Momentum.Class.addImpulse(
      Momentum.Class.AT_REST,
      1,
      NO_DECAY,
    ); // +1 notch from rest
    expect(momentum.velocity).toBeCloseTo(3); // 10 * 0.3 — small first step
    momentum = Momentum.Class.addImpulse(momentum, 1, NO_DECAY); // same direction accumulates
    expect(momentum.velocity).toBeCloseTo(6.105);
    expect(momentum.velocity).toBeGreaterThan(2 * 3); // compounding beats linear
  });

  test('impulse gain reaches full strength at the ramp ceiling and is independent of the cap', () => {
    const sustainedGesture = {
      velocity: 40,
      residual: 0,
      restEquivalentGestureVelocity: 200,
      lastImpulseTimestampMilliseconds: 0,
    };
    const highCeiling = { ...NO_DECAY, max: 1000 };
    const momentum = Momentum.Class.addImpulse(
      sustainedGesture,
      1,
      highCeiling,
      1,
    );
    expect(momentum.velocity).toBeCloseTo(50); // full 10-per-notch gain

    const rampingGesture = {
      velocity: 30,
      residual: 0,
      restEquivalentGestureVelocity: 30,
      lastImpulseTimestampMilliseconds: 0,
    };
    const gainedAtDefaultCeiling =
      Momentum.Class.addImpulse(rampingGesture, 1, NO_DECAY, 1).velocity -
      rampingGesture.velocity;
    const gainedAtHighCeiling =
      Momentum.Class.addImpulse(rampingGesture, 1, highCeiling, 1).velocity -
      rampingGesture.velocity;
    expect(gainedAtHighCeiling).toBeCloseTo(gainedAtDefaultCeiling);
  });

  test('successive hard flicks retain headroom across configured ceilings', () => {
    for (const verticalFlingCeiling of [220, 320, 120, 480]) {
      const ceilingOptions = {
        ...Momentum.Class.verticalOptions,
        max: verticalFlingCeiling,
      };
      const peakVelocities: number[] = [];
      let momentum = Momentum.Class.AT_REST;
      for (let flickNumber = 0; flickNumber < 3; flickNumber++) {
        if (flickNumber > 0) {
          momentum = Momentum.Class.stepMomentum(
            momentum,
            0.2,
            ceilingOptions,
          ).momentum;
        }
        for (let notchNumber = 0; notchNumber < 12; notchNumber++) {
          const velocityBeforeNotch = momentum.velocity;
          momentum = Momentum.Class.addImpulse(
            momentum,
            1,
            ceilingOptions,
            flickNumber * 200,
          );
          expect(momentum.velocity).toBeGreaterThan(velocityBeforeNotch);
        }
        peakVelocities.push(momentum.velocity);
      }

      expect(peakVelocities[0]).toBeLessThan(verticalFlingCeiling);
      expect(peakVelocities[1]).toBeGreaterThan(peakVelocities[0]!);
      expect(peakVelocities[2]).toBeGreaterThan(peakVelocities[1]!);
    }

    const defaultCeilingOptions = Momentum.Class.verticalOptions;
    let defaultFirstFlick = Momentum.Class.AT_REST;
    for (let notchNumber = 0; notchNumber < 12; notchNumber++) {
      defaultFirstFlick = Momentum.Class.addImpulse(
        defaultFirstFlick,
        1,
        defaultCeilingOptions,
        0,
      );
    }
    expect(defaultFirstFlick.velocity).toBeCloseTo(148.94, 2);
    expect(defaultFirstFlick.ceilingSustainingVelocity).toBe(0);

    let rowScaledFlicks = Momentum.Class.AT_REST;
    for (let impulseNumber = 0; impulseNumber < 25; impulseNumber++) {
      rowScaledFlicks = Momentum.Class.addImpulse(
        rowScaledFlicks,
        3,
        defaultCeilingOptions,
        0,
      );
    }
    expect(rowScaledFlicks.ceilingSustainingVelocity).toBe(0);
  });

  test('rapid hard flicks sustain capped speed with excess impulses', () => {
    const verticalOptions = Momentum.Class.verticalOptions;
    let momentum = Momentum.Class.AT_REST;
    for (let notchNumber = 0; notchNumber < 60; notchNumber++) {
      momentum = Momentum.Class.addImpulse(momentum, 1, verticalOptions, 0);
    }

    expect(momentum.velocity).toBe(verticalOptions.max);
    expect(momentum.ceilingSustainingVelocity).toBeGreaterThan(0);

    let cappedFrameCount = 0;
    for (
      let frameNumber = 0;
      frameNumber < 300 && Momentum.Class.isMoving(momentum);
      frameNumber++
    ) {
      momentum = Momentum.Class.stepMomentum(
        momentum,
        1 / 30,
        verticalOptions,
      ).momentum;
      expect(Math.abs(momentum.velocity)).toBeLessThanOrEqual(
        verticalOptions.max,
      );
      if (momentum.velocity === verticalOptions.max) cappedFrameCount++;
    }

    expect(cappedFrameCount).toBeGreaterThanOrEqual(24);
    expect(Momentum.Class.isMoving(momentum)).toBe(false);
  });

  test('a live glide continues gain outside the input cadence window', () => {
    let previousGesture = Momentum.Class.AT_REST;
    for (let notchNumber = 0; notchNumber < 3; notchNumber++) {
      previousGesture = Momentum.Class.addImpulse(
        previousGesture,
        1,
        Momentum.Class.defaultOptions,
        notchNumber,
      );
    }
    const residualGlide = Momentum.Class.stepMomentum(
      previousGesture,
      1 / 30,
      Momentum.Class.defaultOptions,
    ).momentum;
    const followOnGesture = Momentum.Class.addImpulse(
      residualGlide,
      1,
      Momentum.Class.defaultOptions,
      500,
    );
    const uninterruptedGesture = Momentum.Class.addImpulse(
      previousGesture,
      1,
      Momentum.Class.defaultOptions,
      3,
    );
    const fromRestGesture = Momentum.Class.addImpulse(
      Momentum.Class.AT_REST,
      1,
      Momentum.Class.defaultOptions,
      500,
    );

    expect(followOnGesture.velocity - residualGlide.velocity).toBeCloseTo(
      uninterruptedGesture.velocity - previousGesture.velocity,
    );
    expect(followOnGesture.velocity - residualGlide.velocity).toBeGreaterThan(
      fromRestGesture.velocity,
    );
  });

  test('one gesture keeps its gain across an intervening frame', () => {
    const firstImpulse = Momentum.Class.addImpulse(
      Momentum.Class.AT_REST,
      1,
      NO_DECAY,
      0,
    );
    const afterFrame = Momentum.Class.stepMomentum(
      firstImpulse,
      1 / 30,
      NO_DECAY,
    ).momentum;
    const continuedGesture = Momentum.Class.addImpulse(
      afterFrame,
      1,
      NO_DECAY,
      50,
    );
    const expectedWithoutFrame = Momentum.Class.addImpulse(
      firstImpulse,
      1,
      NO_DECAY,
      50,
    );

    expect(continuedGesture.velocity - afterFrame.velocity).toBeCloseTo(
      expectedWithoutFrame.velocity - firstImpulse.velocity,
    );
  });

  test('a lone notch from rest always crosses at least one row before halting', () => {
    // Real decay profile: scaled first-notch velocity (30% of 22 = 6.6) would halt below one row;
    // the from-rest floor must lift it to a full row-crossing.
    const realistic = {
      impulse: 22,
      max: 80,
      decayPerSec: 0.015,
      stopVelocity: 3,
    };
    let momentum = Momentum.Class.addImpulse(
      Momentum.Class.AT_REST,
      1,
      realistic,
    );
    let totalRows = 0;
    for (
      let frame = 0;
      frame < 300 && Momentum.Class.isMoving(momentum);
      frame++
    ) {
      const step = Momentum.Class.stepMomentum(momentum, 1 / 60, realistic);
      momentum = step.momentum;
      totalRows += step.rows;
    }
    expect(totalRows).toBeGreaterThanOrEqual(1);
    expect(totalRows).toBeLessThanOrEqual(3); // still a precision step, not a fling
  });

  test('one queued notch crosses a row across every selectable glide cap', () => {
    for (
      let maximumGlideDurationMilliseconds = 100;
      maximumGlideDurationMilliseconds <= 2_000;
      maximumGlideDurationMilliseconds += 50
    ) {
      const options = {
        ...Momentum.Class.verticalOptions,
        maximumGlideDurationMilliseconds,
      };
      let momentum = Momentum.Class.AT_REST;
      Momentum.Class.queueImpulse(momentum, 1, 0);
      let rowsTravelled = 0;
      for (
        let frameNumber = 0;
        frameNumber < 100 && Momentum.Class.isMoving(momentum);
        frameNumber++
      ) {
        const stepped = Momentum.Class.stepMomentum(momentum, 1 / 30, options);
        momentum = stepped.momentum;
        rowsTravelled += stepped.rows;
      }

      expect(momentum.restEquivalentGestureImpulseCount).toBe(1);
      expect(rowsTravelled).toBeGreaterThanOrEqual(1);
      if (maximumGlideDurationMilliseconds === 900) {
        expect(rowsTravelled).toBe(1);
      }
    }
  });

  test('velocity is capped', () => {
    const momentum = Momentum.Class.addImpulse(
      Momentum.Class.AT_REST,
      100,
      NO_DECAY,
    );
    expect(momentum.velocity).toBe(100); // max
  });

  test('CROSSING REGULARITY: constant velocity crosses rows at a constant frame interval', () => {
    // velocity 15 rows/s, dt = 1/30 s → 0.5 rows/frame → exactly one row every 2 frames, forever.
    let momentum: ScrollMomentum = { velocity: 15, residual: 0 };
    const crossFrames: number[] = [];
    for (let frame = 1; frame <= 12; frame++) {
      const result = Momentum.Class.stepMomentum(momentum, 1 / 30, NO_DECAY);
      momentum = result.momentum;
      if (result.rows > 0) crossFrames.push(frame);
    }
    // Rows cross on frames 2,4,6,8,10,12 — a constant interval of 2 (regular, no judder).
    expect(crossFrames).toEqual([2, 4, 6, 8, 10, 12]);
  });

  test('total rows moved equals velocity*time (no rows lost or gained)', () => {
    let momentum: ScrollMomentum = { velocity: 30, residual: 0 };
    let total = 0;
    for (let index = 0; index < 30; index++) {
      const result = Momentum.Class.stepMomentum(momentum, 1 / 30, NO_DECAY); // 1s total
      momentum = result.momentum;
      total += result.rows;
    }
    expect(total).toBe(30); // 30 rows/s * 1s
  });

  test('decay glides to a halt with no slow sub-row tail', () => {
    let momentum = Momentum.Class.addImpulse(Momentum.Class.AT_REST, 3); // real decay defaults
    let frames = 0;
    while (Momentum.Class.isMoving(momentum) && frames < 1000) {
      momentum = Momentum.Class.stepMomentum(momentum, 1 / 30).momentum;
      frames++;
    }
    expect(Momentum.Class.isMoving(momentum)).toBe(false); // it stops
    expect(momentum.residual).toBe(0); // residual dropped at halt (no lingering sub-row)
    expect(frames).toBeLessThan(120); // halts within a few seconds, not forever
  });

  test('Momentum.Class.halt() immediately stops (adopt-and-stop for a programmatic jump)', () => {
    const moving = Momentum.Class.addImpulse(Momentum.Class.AT_REST, 5);
    expect(Momentum.Class.isMoving(moving)).toBe(true);
    expect(Momentum.Class.isMoving(Momentum.Class.halt())).toBe(false);
  });
});

test('a reversal notch halts the glide and steps from rest in the new direction', () => {
  // Reversal must be deterministic whatever velocity remains: stop, then a precision step back.
  const gliding = { velocity: 22, residual: 0.4 };
  const reversed = Momentum.Class.addImpulse(gliding, -1, NO_DECAY);
  expect(reversed.velocity).toBeCloseTo(-3); // from-rest gain (10 * 0.3), new direction
  const barelyGliding = { velocity: 0.5, residual: 0 };
  const reversedLow = Momentum.Class.addImpulse(barelyGliding, -1, NO_DECAY);
  expect(reversedLow.velocity).toBeCloseTo(-3); // same outcome at any residual velocity
});
