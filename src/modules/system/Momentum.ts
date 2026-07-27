// Shared momentum physics for smooth scrolling on a CELL GRID. A terminal cannot render sub-row
// positions, so "smooth" means regular ROW-crossings at a steady cadence (the reparameterized
// crossing-regularity invariant: device-pixel → cell-row). We model velocity (rows/sec) that
// decays over time; a constant velocity emits row-crossings at a constant frame interval (regular),
// and we HALT below a threshold rather than creep the last rows slowly (sub-row ticking is
// impossible per the invariant — don't chase it). Frame time and impulse time are injectable, so
// the physics remain unit-testable with no renderer. Input queues plain impulses here; one animation
// tick drains them and publishes momentum once, so a trackpad burst cannot synchronously repaint per
// event.
//
// Stateless capability (project.conventions.md new-file rule): the physics are statics published
// through the Static() seam like ScrollbarGeometry; the momentum VALUE (ScrollMomentum), including
// its plain pending-input queue, is data each caller owns.
import { Static } from 'ivue/extras';

// invariant: Same-direction notches accumulate until the glide ceiling (src/modules/ui/ui.invariants.md)
class $Momentum {
  protected static get $defaultOptions(): MomentumOptions {
    const defaultOptions: MomentumOptions = {
      impulse: 22,
      max: 80,
      decayPerSec: 0.015,
      stopVelocity: 3,
      maximumGlideDurationMilliseconds: 900,
    };
    Object.defineProperty(this, '$defaultOptions', {
      configurable: true,
      value: defaultOptions,
    });
    return defaultOptions;
  }

  // Vertical axis wants a HIGHER fast-scroll ceiling than horizontal: a hard fling should cover a long
  // file/tree quickly. Same decay curve + stop threshold (so a gentle wheel is still precise and the
  // One-Writer halt behaviour is unchanged) — only the top speed and per-notch gain are raised.
  protected static get $verticalOptions(): MomentumOptions {
    const verticalOptions: MomentumOptions = {
      impulse: 34,
      max: 220,
      decayPerSec: 0.015,
      stopVelocity: 3,
      maximumGlideDurationMilliseconds: 900,
    };
    Object.defineProperty(this, '$verticalOptions', {
      configurable: true,
      value: verticalOptions,
    });
    return verticalOptions;
  }

  static get atRest(): ScrollMomentum {
    return {
      velocity: 0,
      residual: 0,
      restEquivalentGestureVelocity: 0,
      restEquivalentGestureImpulseUnits: 0,
      restEquivalentGestureImpulseCount: 0,
      ceilingSustainingVelocity: 0,
      millisecondsSinceLastImpulse: 0,
      pendingImpulses: [],
    };
  }

  static get defaultOptions(): MomentumOptions {
    return this.$defaultOptions;
  }

  static get verticalOptions(): MomentumOptions {
    return this.$verticalOptions;
  }

  /** Queue an input impulse without publishing reactive momentum state. The animation tick drains
   *  every event in order and becomes the sole reactive writer for the regime. */
  static queueImpulse(
    momentum: ScrollMomentum,
    deltaRows: number,
    currentTimestampMilliseconds = performance.now(),
  ): void {
    (momentum.pendingImpulses ??= []).push({
      deltaRows,
      timestampMilliseconds: currentTimestampMilliseconds,
    });
  }

  /** Fraction of the impulse gain a notch lands with when the regime is AT REST. A lone notch is a
   *  precision move — it must travel a row or two, not a fling's opening jump. */
  protected static get initialGainFraction(): number {
    return 0.3;
  }

  /** How many notches' worth of velocity would saturate the gain ramp. Scaling by the profile's
   *  impulse keeps acceleration identical across ceilings, while the span leaves room for separate
   *  flicks to accumulate before physical velocity reaches its ceiling. */
  protected static get gainRampNotchSpan(): number {
    return 20;
  }

  /** The driven hard-flick shape is twelve unit impulses in one PTY write. The first such flick
   *  reserves headroom for this many later hard flicks, regardless of the configured ceiling. */
  protected static get hardFlickImpulseUnits(): number {
    return 12;
  }

  protected static get followOnHardFlicksWithReservedHeadroom(): number {
    return 2;
  }

  /** Wheel impulses inside this interval belong to one physical gesture. Terminal input has no
   *  gesture-end event, so cadence supplies the same boundary that key repeat inference uses. */
  protected static get gestureContinuationWindowMilliseconds(): number {
    return 150;
  }

  /** Add a wheel/flick impulse in the direction of `deltaRows`; same-direction impulses accumulate.
   *  Gain is PROGRESSIVE: a notch from rest lands small (precise single-step feel) and a sustained
   *  gesture compounds toward the cap. The gain curve reads the current
   *  motion's rest-equivalent velocity; physical velocity still composes
   *  with the live glide. A
   *  from-rest notch is floored at the velocity that glides ONE full row before the halt threshold
   *  eats it — a wheel notch that visibly does nothing is not precision, it is a dead input. */
  static addImpulse(
    momentum: ScrollMomentum,
    deltaRows: number,
    options: MomentumOptions = this.defaultOptions,
    currentTimestampMilliseconds = performance.now(),
  ): ScrollMomentum {
    // A notch AGAINST the current glide is a precision intent — stop and turn. Under ramped gain a
    // low-velocity reversal notch only subtracts a fraction of the impulse, so whether the sign
    // flips would depend on how much glide remains: a timing-dependent, sometimes-dead reversal.
    // Halting and stepping from rest makes reversal deterministic and immediate.
    if (
      momentum.velocity !== 0 &&
      deltaRows !== 0 &&
      Math.sign(deltaRows) !== Math.sign(momentum.velocity)
    ) {
      return this.addImpulse(
        this.atRest,
        deltaRows,
        options,
        currentTimestampMilliseconds,
      );
    }
    const gainRampCeiling = options.impulse * this.gainRampNotchSpan;
    const elapsedSincePreviousImpulseMilliseconds =
      currentTimestampMilliseconds -
      (momentum.lastImpulseTimestampMilliseconds ?? Number.NEGATIVE_INFINITY);
    const liveGlideContinues =
      Math.abs(momentum.velocity) >= options.stopVelocity;
    const inputCadenceContinues =
      elapsedSincePreviousImpulseMilliseconds >= 0 &&
      elapsedSincePreviousImpulseMilliseconds <
        this.gestureContinuationWindowMilliseconds;
    const gestureContinues = liveGlideContinues || inputCadenceContinues;
    const restEquivalentGestureVelocity = gestureContinues
      ? (momentum.restEquivalentGestureVelocity ?? 0)
      : 0;
    const restEquivalentGestureImpulseUnits = gestureContinues
      ? (momentum.restEquivalentGestureImpulseUnits ?? 0)
      : 0;
    const restEquivalentGestureImpulseCount = gestureContinues
      ? (momentum.restEquivalentGestureImpulseCount ?? 0)
      : 0;
    const gainScale =
      this.initialGainFraction +
      (1 - this.initialGainFraction) *
        Math.min(1, Math.abs(restEquivalentGestureVelocity) / gainRampCeiling);
    const curveGainedVelocity = deltaRows * options.impulse * gainScale;
    let restEquivalentGestureVelocityAfterImpulse =
      restEquivalentGestureVelocity + curveGainedVelocity;
    if (!gestureContinues && deltaRows !== 0) {
      // Distance to halt from v0 is (v0 - stopVelocity) / -ln(decayPerSec); require >= 1 row.
      const decayRatePerSecond = -Math.log(options.decayPerSec);
      const singleRowVelocity = options.stopVelocity + decayRatePerSecond;
      if (
        Math.abs(restEquivalentGestureVelocityAfterImpulse) < singleRowVelocity
      ) {
        restEquivalentGestureVelocityAfterImpulse =
          Math.sign(deltaRows) * singleRowVelocity;
      }
    }
    const gainedPhysicalVelocity =
      restEquivalentGestureVelocityAfterImpulse - restEquivalentGestureVelocity;
    const restEquivalentGestureImpulseUnitsAfterImpulse =
      restEquivalentGestureImpulseUnits + Math.abs(deltaRows);
    const restEquivalentGestureImpulseCountAfterImpulse =
      restEquivalentGestureImpulseCount + (deltaRows === 0 ? 0 : 1);
    const velocityBeforeCeiling =
      momentum.velocity +
      (momentum.ceilingSustainingVelocity ?? 0) +
      gainedPhysicalVelocity;
    const physicalVelocityCeiling = this.physicalVelocityCeiling(
      restEquivalentGestureImpulseUnitsAfterImpulse,
      options,
    );
    const velocity =
      Math.sign(velocityBeforeCeiling) *
      Math.min(Math.abs(velocityBeforeCeiling), physicalVelocityCeiling);
    const configuredCeilingWasAlreadyReached =
      restEquivalentGestureImpulseCount >=
      this.hardFlickImpulseUnits *
        (this.followOnHardFlicksWithReservedHeadroom + 1);
    const ceilingSustainingVelocity = configuredCeilingWasAlreadyReached
      ? velocityBeforeCeiling - velocity
      : 0;
    return {
      velocity,
      residual: momentum.residual,
      restEquivalentGestureVelocity: restEquivalentGestureVelocityAfterImpulse,
      restEquivalentGestureImpulseUnits:
        restEquivalentGestureImpulseUnitsAfterImpulse,
      restEquivalentGestureImpulseCount:
        restEquivalentGestureImpulseCountAfterImpulse,
      ceilingSustainingVelocity,
      millisecondsSinceLastImpulse: 0,
      pendingImpulses: momentum.pendingImpulses ?? [],
      lastImpulseTimestampMilliseconds: currentTimestampMilliseconds,
    };
  }

  protected static physicalVelocityCeiling(
    restEquivalentGestureImpulseUnits: number,
    options: MomentumOptions,
  ): number {
    const hardFlickCount = this.followOnHardFlicksWithReservedHeadroom + 1;
    const velocityHeadroomPerFollowOnFlick = Math.min(
      options.impulse * 0.75,
      options.max / hardFlickCount,
    );
    const hardFlickProgress =
      restEquivalentGestureImpulseUnits / this.hardFlickImpulseUnits;
    const remainingHardFlicksWithReservedHeadroom = Math.max(
      0,
      hardFlickCount - hardFlickProgress,
    );
    return Math.max(
      0,
      options.max -
        remainingHardFlicksWithReservedHeadroom *
          velocityHeadroomPerFollowOnFlick,
    );
  }

  /**
   * Advance one frame by `dtSec`. Returns the next momentum and the WHOLE number of rows to move this
   * frame (signed). Under constant velocity the row-crossings land at a constant frame interval
   * (regular cadence); velocity decays geometrically; once it falls below `stopVelocity` we halt and
   * drop the residual so there is no slow sub-row tail.
   */
  static stepMomentum(
    momentum: ScrollMomentum,
    dtSec: number,
    options: MomentumOptions = this.defaultOptions,
  ): { momentum: ScrollMomentum; rows: number } {
    const pendingImpulses = momentum.pendingImpulses ?? [];
    let currentMomentum = momentum;
    for (const pendingImpulse of pendingImpulses) {
      currentMomentum = this.addImpulse(
        currentMomentum,
        pendingImpulse.deltaRows,
        options,
        pendingImpulse.timestampMilliseconds,
      );
    }
    pendingImpulses.length = 0;
    if (currentMomentum.velocity === 0 || dtSec <= 0) {
      return { momentum: currentMomentum, rows: 0 };
    }
    const millisecondsSinceLastImpulse =
      (currentMomentum.millisecondsSinceLastImpulse ?? 0) + dtSec * 1000;
    const maximumGlideDurationMilliseconds =
      options.maximumGlideDurationMilliseconds ?? Number.POSITIVE_INFINITY;
    const availableDeltaTimeSeconds = Math.min(
      dtSec,
      Math.max(
        0,
        (maximumGlideDurationMilliseconds -
          (currentMomentum.millisecondsSinceLastImpulse ?? 0)) /
          1000,
      ),
    );
    const advanced =
      currentMomentum.residual +
      currentMomentum.velocity * availableDeltaTimeSeconds;
    const rows = Math.trunc(advanced);
    let residual = advanced - rows;
    const decayedVelocity =
      currentMomentum.velocity *
      Math.pow(options.decayPerSec, availableDeltaTimeSeconds);
    const availableCeilingSustainingVelocity =
      currentMomentum.ceilingSustainingVelocity ?? 0;
    const velocityLostToDecay = currentMomentum.velocity - decayedVelocity;
    const restoredVelocity =
      Math.sign(availableCeilingSustainingVelocity) *
      Math.min(
        Math.abs(availableCeilingSustainingVelocity),
        Math.abs(velocityLostToDecay),
      );
    let velocity = decayedVelocity + restoredVelocity;
    let ceilingSustainingVelocity =
      availableCeilingSustainingVelocity - restoredVelocity;
    if (
      Math.abs(velocity) < options.stopVelocity ||
      millisecondsSinceLastImpulse >= maximumGlideDurationMilliseconds
    ) {
      velocity = 0;
      residual = 0;
      ceilingSustainingVelocity = 0;
    }
    return {
      momentum: {
        velocity,
        residual,
        restEquivalentGestureVelocity:
          currentMomentum.restEquivalentGestureVelocity,
        restEquivalentGestureImpulseUnits:
          currentMomentum.restEquivalentGestureImpulseUnits,
        restEquivalentGestureImpulseCount:
          currentMomentum.restEquivalentGestureImpulseCount,
        ceilingSustainingVelocity,
        millisecondsSinceLastImpulse,
        pendingImpulses,
        lastImpulseTimestampMilliseconds:
          currentMomentum.lastImpulseTimestampMilliseconds,
      },
      rows,
    };
  }

  /** Immediately halt (adopt-and-stop for a programmatic jump — One-Writer-Per-Regime). */
  static halt(): ScrollMomentum {
    return this.atRest;
  }

  static isMoving(momentum: ScrollMomentum): boolean {
    return (
      momentum.velocity !== 0 || (momentum.pendingImpulses?.length ?? 0) > 0
    );
  }
}

export namespace Momentum {
  export const $Class = $Momentum;
  export const Class = Static($Momentum);
}

export interface ScrollMomentum {
  velocity: number; // rows per second (sign = direction); 0 = at rest
  residual: number; // fractional rows carried between frames [0,1)
  // Gain-curve input accumulated from notches in the current physical gesture. Optional so external
  // plain values created before this field existed enter honestly at rest-equivalent gain.
  restEquivalentGestureVelocity?: number;
  // Absolute impulse units accumulated by the same gesture. The physical ceiling envelope uses
  // these units to reserve visible velocity headroom for two follow-on hard flicks.
  restEquivalentGestureImpulseUnits?: number;
  // Physical same-direction impulse events accumulated by the gesture. Unlike impulse units, this
  // count is independent of lines-per-notch scaling and determines when true-ceiling overflow may
  // sustain later frames.
  restEquivalentGestureImpulseCount?: number;
  // Same-direction impulse velocity received at the configured ceiling. It is spent only to replace
  // frame decay, so dense input sustains capped speed without exceeding the configured maximum.
  ceilingSustainingVelocity?: number;
  // Time since the latest input impulse. A configurable tail bound prevents banked ceiling energy
  // from gliding for seconds after the user has stopped touching the wheel.
  millisecondsSinceLastImpulse?: number;
  // Input queues here without mutating the reactive ref. The animation tick drains it in order.
  pendingImpulses?: ScrollMomentumImpulse[];
  // Input cadence is the pre-motion continuation proxy. Live physical
  // motion is authoritative.
  lastImpulseTimestampMilliseconds?: number;
}

export interface ScrollMomentumImpulse {
  deltaRows: number;
  timestampMilliseconds: number;
}

export interface MomentumOptions {
  impulse: number; // velocity (rows/sec) added per unit of wheel delta
  max: number; // velocity cap (rows/sec)
  decayPerSec: number; // velocity multiplier applied per second (0..1); lower = shorter glide
  stopVelocity: number; // halt (and discard residual) once |velocity| drops below this
  maximumGlideDurationMilliseconds?: number; // maximum animated tail after the latest impulse
}
