// Pure momentum physics for smooth scrolling on a CELL GRID. A terminal cannot render sub-row
// positions, so "smooth" means regular ROW-crossings at a steady cadence (the reparameterized
// crossing-regularity invariant: device-pixel → cell-row). We model velocity (rows/sec) that
// decays over time; a constant velocity emits row-crossings at a constant frame interval (regular),
// and we HALT below a threshold rather than creep the last rows slowly (sub-row ticking is
// impossible per the invariant — don't chase it). Pure: dt is passed in, so it is unit-testable
// with no clock and no renderer.
//
// Stateless capability (project.conventions.md new-file rule): the physics are pure statics published
// through the Static() seam like ScrollbarGeometry; the momentum VALUE (ScrollMomentum) is plain data
// each caller holds in its own reactive cell.
import { Static } from 'ivue/extras';

export interface ScrollMomentum {
  velocity: number; // rows per second (sign = direction); 0 = at rest
  residual: number; // fractional rows carried between frames [0,1)
}

export interface MomentumOptions {
  impulse: number; // velocity (rows/sec) added per unit of wheel delta
  max: number; // velocity cap (rows/sec)
  decayPerSec: number; // velocity multiplier applied per second (0..1); lower = shorter glide
  stopVelocity: number; // halt (and discard residual) once |velocity| drops below this
}

export const DEFAULT_MOMENTUM: MomentumOptions = {
  impulse: 22,
  max: 80,
  decayPerSec: 0.015,
  stopVelocity: 3,
};

// Vertical axis wants a HIGHER fast-scroll ceiling than horizontal: a hard fling should cover a long
// file/tree quickly. Same decay curve + stop threshold (so a gentle wheel is still precise and the
// One-Writer halt behaviour is unchanged) — only the top speed and per-notch gain are raised.
export const VERTICAL_MOMENTUM: MomentumOptions = {
  impulse: 34,
  max: 220,
  decayPerSec: 0.015,
  stopVelocity: 3,
};

export const AT_REST: ScrollMomentum = { velocity: 0, residual: 0 };

class $Momentum {
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

  /** Add a wheel/flick impulse in the direction of `deltaRows`; same-direction impulses accumulate.
   *  Gain is PROGRESSIVE: a notch from rest lands small (precise single-step feel) and a sustained
   *  notch train compounds toward the cap, so fluidity is preserved while first steps stay small.
   *  A from-rest notch is floored at the velocity that glides ONE full row before the halt
   *  threshold eats it — a wheel notch that visibly does nothing is not precision, it is a dead
   *  input. */
  static addImpulse(momentum: ScrollMomentum, deltaRows: number, options: MomentumOptions = DEFAULT_MOMENTUM): ScrollMomentum {
    const gainRampCeiling = options.impulse * $Momentum.gainRampNotchSpan;
    const gainScale = $Momentum.initialGainFraction
      + (1 - $Momentum.initialGainFraction)
        * Math.min(1, Math.abs(momentum.velocity) / gainRampCeiling);
    let velocity = momentum.velocity + deltaRows * options.impulse * gainScale;
    if (momentum.velocity === 0 && deltaRows !== 0) {
      // Distance to halt from v0 is (v0 - stopVelocity) / -ln(decayPerSec); require >= 1 row.
      const decayRatePerSecond = -Math.log(options.decayPerSec);
      const singleRowVelocity = options.stopVelocity + decayRatePerSecond;
      if (Math.abs(velocity) < singleRowVelocity) {
        velocity = Math.sign(deltaRows) * singleRowVelocity;
      }
    }
    return { velocity: Math.max(-options.max, Math.min(options.max, velocity)), residual: momentum.residual };
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
    options: MomentumOptions = DEFAULT_MOMENTUM,
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
    return { momentum: { velocity, residual }, rows };
  }

  /** Immediately halt (adopt-and-stop for a programmatic jump — One-Writer-Per-Regime). */
  static halt(): ScrollMomentum {
    return AT_REST;
  }

  static isMoving(momentum: ScrollMomentum): boolean {
    return momentum.velocity !== 0;
  }
}

export namespace Momentum {
  export const $Class = $Momentum;
  export const Class = Static($Momentum);
}
