import { Static } from 'ivue/extras';

// The shared generator behind "the user clicked the same thing twice, quickly". Every pointer
// surface that gives a second click its own meaning (activate a log row, open a rendered link)
// asks the SAME question of the SAME clock, so the interval a user feels is one number in one
// place instead of a constant re-rolled per pane.
//
// invariant: Seams are drawn at the shared generator (project.invariants.md)
class $DoubleClickGesture {
  /** How long a second press on the same target still counts as one double click. */
  protected static get INTERVAL_MILLISECONDS(): number {
    return 450;
  }

  protected lastTargetIdentity: string | null = null;
  protected lastPressTimestampMilliseconds = 0;

  /**
   * Record a press on `targetIdentity` and answer whether it completes a double click — the same
   * target pressed again inside the interval. The caller passes its own timestamp so a test drives
   * the clock instead of waiting on it.
   */
  recordPressAndDetectDoubleClick(
    targetIdentity: string,
    timestampMilliseconds: number = Date.now(),
  ): boolean {
    const doubleClickGestureClass = this
      .constructor as typeof $DoubleClickGesture;
    const continuesPreviousPress =
      targetIdentity === this.lastTargetIdentity &&
      timestampMilliseconds - this.lastPressTimestampMilliseconds <
        doubleClickGestureClass.INTERVAL_MILLISECONDS;
    this.lastTargetIdentity = targetIdentity;
    this.lastPressTimestampMilliseconds = timestampMilliseconds;
    return continuesPreviousPress;
  }

  /** Forget the previous press, so the next one can never complete a double click. */
  forgetPreviousPress(): void {
    this.lastTargetIdentity = null;
    this.lastPressTimestampMilliseconds = 0;
  }
}

export namespace DoubleClickGesture {
  export const $Class = Static($DoubleClickGesture);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
