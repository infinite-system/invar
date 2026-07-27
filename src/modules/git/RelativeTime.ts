// A pure, dependency-free "N units ago" formatter — the GitLens-style relative date the blame part
// shows. It takes an explicit `nowMs` so it is deterministic and unit-testable (no ambient clock). The
// thresholds mirror the familiar coarse buckets (just now → minutes → hours → days → weeks → months →
// years); precision beyond the largest fitting unit is noise for a status-bar hint.
//
// invariant: A relative time reads in the largest fitting unit (src/modules/git/git.invariants.md)
import { Static } from 'ivue/extras';

class $RelativeTime {
  protected static get SECOND_MILLISECONDS(): number {
    return 1000;
  }

  protected static get minuteMilliseconds(): number {
    return 60 * this.SECOND_MILLISECONDS;
  }

  protected static get hourMilliseconds(): number {
    return 60 * this.minuteMilliseconds;
  }

  protected static get dayMilliseconds(): number {
    return 24 * this.hourMilliseconds;
  }

  protected static get weekMilliseconds(): number {
    return 7 * this.dayMilliseconds;
  }

  protected static get monthMilliseconds(): number {
    return 30 * this.dayMilliseconds;
  }

  protected static get yearMilliseconds(): number {
    return 365 * this.dayMilliseconds;
  }

  protected static agoPhrase(
    elapsedMilliseconds: number,
    unitName: string,
  ): string {
    const unitValue = Math.max(1, Math.round(elapsedMilliseconds));
    return `${unitValue} ${unitName}${unitValue === 1 ? '' : 's'} ago`;
  }

  /** Format the gap between `fromMs` and `nowMs` in the largest fitting unit. A future or equal
   * instant reads "just now" (a clock skew never produces a negative age). */
  static format(fromMs: number, nowMs: number): string {
    const elapsedMilliseconds = nowMs - fromMs;
    if (elapsedMilliseconds < 45 * this.SECOND_MILLISECONDS) {
      return 'just now';
    }
    if (elapsedMilliseconds < 45 * this.minuteMilliseconds) {
      return this.agoPhrase(
        elapsedMilliseconds / this.minuteMilliseconds,
        'minute',
      );
    }
    if (elapsedMilliseconds < 24 * this.hourMilliseconds) {
      return this.agoPhrase(
        elapsedMilliseconds / this.hourMilliseconds,
        'hour',
      );
    }
    if (elapsedMilliseconds < 7 * this.dayMilliseconds) {
      return this.agoPhrase(elapsedMilliseconds / this.dayMilliseconds, 'day');
    }
    if (elapsedMilliseconds < 30 * this.dayMilliseconds) {
      return this.agoPhrase(
        elapsedMilliseconds / this.weekMilliseconds,
        'week',
      );
    }
    if (elapsedMilliseconds < 365 * this.dayMilliseconds) {
      return this.agoPhrase(
        elapsedMilliseconds / this.monthMilliseconds,
        'month',
      );
    }
    return this.agoPhrase(elapsedMilliseconds / this.yearMilliseconds, 'year');
  }
}

export namespace RelativeTime {
  export const $Class = $RelativeTime;
  export const Class = Static($RelativeTime);
}
