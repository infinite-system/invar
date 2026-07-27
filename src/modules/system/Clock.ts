import { Static } from 'ivue/extras';
// Time capability. Isolated so tests can inject deterministic time and undo-coalescing is
// reproducible. Static.

class $Clock {
  protected static timeSourceOverride: (() => number) | null = null;

  static now(): number {
    return this.timeSourceOverride ? this.timeSourceOverride() : Date.now();
  }

  /** Test hook: force `now()` to return a fixed/scripted value. */
  static freeze(timeSource: (() => number) | null): void {
    this.timeSourceOverride = timeSource;
  }
}

export namespace Clock {
  export const $Class = $Clock;
  export let Class = Static($Clock);
}
