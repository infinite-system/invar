// Movement/scroll feel — the HAND-TUNED product values, curves, and terminal-repeat run inference
// that deliver them.

// invariant: Held key movement accelerates within a ceiling (project.invariants.md)
import { Static } from 'ivue/extras';
class $ScrollPhysics {
  /** Key repeats within this window continue an acceleration run; a gap resets it. */
  static readonly KEY_RUN_WINDOW_MS = 150;

  /** Held-arrow ramp: near-immediate onset, steep build (user-tuned 2026-07-21: the ramp kicks in
   *  after ~2 fast repeats and climbs hard — holding feels fast almost immediately, while a single
   *  press or slow taps still move exactly 1 row). */
  static readonly KEY_ACCEL_START_RUN = 2; // presses before any acceleration (was 3)
  static readonly KEY_ACCEL_QUADRATIC = 0.4; // rows += this * (run - start)^2 (was 0.15)
  static readonly KEY_ACCEL_CAP_ROWS = 50; // max rows per repeat (was 45)

  /** Ctrl+Up/Down big-jump traversal: a screenful-ish stride that also ramps. Hand-tuned. */
  static readonly JUMP_BASE_ROWS = 15;
  static readonly JUMP_RAMP_ROWS = 5; // + per repeat in a run
  static readonly JUMP_CAP_ROWS = 120;

  protected accelerationDirection = '';
  protected accelerationRunLength = 0;
  protected accelerationLastTimestampMilliseconds = 0;

  /**
   * Rows a plain held arrow moves on the `runLength`-th repeat: 1 while tapping, then a
   * noticeably building quadratic ramp up to the cap.
   */
  static keyAcceleration(runLength: number): number {
    if (runLength < this.KEY_ACCEL_START_RUN) return 1;
    const ramp =
      this.KEY_ACCEL_QUADRATIC *
      (runLength - this.KEY_ACCEL_START_RUN + 1) ** 2;
    return Math.min(this.KEY_ACCEL_CAP_ROWS, Math.floor(1 + ramp));
  }

  /** Rows a Ctrl+arrow big jump moves on the `runLength`-th repeat. */
  static jumpRows(runLength: number): number {
    return Math.min(
      this.JUMP_CAP_ROWS,
      this.JUMP_BASE_ROWS + this.JUMP_RAMP_ROWS * runLength,
    );
  }

  keyAccelerationFor(
    direction: string,
    currentTimestampMilliseconds = Date.now(),
  ): number {
    return $ScrollPhysics.keyAcceleration(
      this.keyRunLength(direction, currentTimestampMilliseconds),
    );
  }

  jumpRowsFor(
    direction: string,
    currentTimestampMilliseconds = Date.now(),
  ): number {
    return $ScrollPhysics.jumpRows(
      this.keyRunLength(direction, currentTimestampMilliseconds),
    );
  }

  protected keyRunLength(
    direction: string,
    currentTimestampMilliseconds: number,
  ): number {
    const elapsedMilliseconds =
      currentTimestampMilliseconds - this.accelerationLastTimestampMilliseconds;
    if (
      direction === this.accelerationDirection &&
      elapsedMilliseconds >= 0 &&
      elapsedMilliseconds < $ScrollPhysics.KEY_RUN_WINDOW_MS
    ) {
      this.accelerationRunLength++;
    } else {
      this.accelerationRunLength = 0;
    }
    this.accelerationDirection = direction;
    this.accelerationLastTimestampMilliseconds = currentTimestampMilliseconds;
    return this.accelerationRunLength;
  }
}

export namespace ScrollPhysics {
  export const $Class = Static($ScrollPhysics);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
