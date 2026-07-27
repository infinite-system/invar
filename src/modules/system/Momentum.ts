// Pure momentum physics for smooth scrolling on a CELL GRID. A terminal cannot render sub-row
// positions, so "smooth" means regular ROW-crossings at a steady cadence (the reparameterized
// crossing-regularity invariant: device-pixel → cell-row). We model velocity (rows/sec) that
// decays over time; a constant velocity emits row-crossings at a constant frame interval (regular),
// and we HALT below a threshold rather than creep the last rows slowly (sub-row ticking is
// impossible per the invariant — don't chase it). Frame time and impulse time are injectable, so
// the physics remain unit-testable with no renderer.
//
// Stateless capability (project.conventions.md new-file rule): the physics are pure statics published
// through the Static() seam like ScrollbarGeometry; the momentum VALUE (ScrollMomentum) is plain data
// each caller holds in its own reactive cell.
import { Static } from 'ivue/extras';

// invariant: A same-direction notch never slows a live glide (src/modules/ui/ui.invariants.md)
class $Momentum {
  protected static get $defaultOptions(): MomentumOptions {
    const defaultOptions: MomentumOptions = {
      impulse: 22,
      max: 80,
      decayPerSec: 0.015,
      stopVelocity: 3,
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
    };
    Object.defineProperty(this, '$verticalOptions', {
      configurable: true,
      value: verticalOptions,
    });
    return verticalOptions;
  }

  protected static get $atRest(): ScrollMomentum {
    const atRest: ScrollMomentum = {
      velocity: 0,
      residual: 0,
      restEquivalentGestureVelocity: 0,
    };
    Object.defineProperty(this, '$atRest', {
      configurable: true,
      value: atRest,
    });
    return atRest;
  }

  static get defaultOptions(): MomentumOptions {
    return this.$defaultOptions;
  }

  static get verticalOptions(): MomentumOptions {
    return this.$verticalOptions;
  }

  static get atRest(): ScrollMomentum {
    return this.$atRest;
  }

  /** Fraction of the impulse gain a notch lands with when the regime is AT REST. A lone notch is a
   *  precision move — it must travel a row or two, not a fling's opening jump. */
  protected static get initialGainFraction(): number {
    return 0.3;
  }

  /** How many notches' worth of velocity saturate the gain ramp. Scaling the ramp by the profile's
   *  own impulse keeps acceleration identical across profiles — a raised velocity CAP must make
   *  flings go farther, never make the ramp longer. */
  protected static get gainRampNotchSpan(): number {
    return 3;
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
    const velocity = momentum.velocity + gainedPhysicalVelocity;
    return {
      velocity: Math.max(-options.max, Math.min(options.max, velocity)),
      residual: momentum.residual,
      restEquivalentGestureVelocity: Math.max(
        -options.max,
        Math.min(options.max, restEquivalentGestureVelocityAfterImpulse),
      ),
      lastImpulseTimestampMilliseconds: currentTimestampMilliseconds,
    };
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
    if (momentum.velocity === 0 || dtSec <= 0) return { momentum, rows: 0 };
    const advanced = momentum.residual + momentum.velocity * dtSec;
    const rows = Math.trunc(advanced);
    let residual = advanced - rows;
    let velocity = momentum.velocity * Math.pow(options.decayPerSec, dtSec);
    if (Math.abs(velocity) < options.stopVelocity) {
      velocity = 0;
      residual = 0;
    }
    return {
      momentum: {
        velocity,
        residual,
        restEquivalentGestureVelocity: momentum.restEquivalentGestureVelocity,
        lastImpulseTimestampMilliseconds:
          momentum.lastImpulseTimestampMilliseconds,
      },
      rows,
    };
  }

  /** Immediately halt (adopt-and-stop for a programmatic jump — One-Writer-Per-Regime). */
  static halt(): ScrollMomentum {
    return this.atRest;
  }

  static isMoving(momentum: ScrollMomentum): boolean {
    return momentum.velocity !== 0;
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
  // Input cadence is the pre-motion continuation proxy. Live physical
  // motion is authoritative.
  lastImpulseTimestampMilliseconds?: number;
}

export interface MomentumOptions {
  impulse: number; // velocity (rows/sec) added per unit of wheel delta
  max: number; // velocity cap (rows/sec)
  decayPerSec: number; // velocity multiplier applied per second (0..1); lower = shorter glide
  stopVelocity: number; // halt (and discard residual) once |velocity| drops below this
}
