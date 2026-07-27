// Pure virtualization helpers for a windowed list (the commit log). Realizes "cost tracks the
// actively observed set": only the visible window (plus a small keep-margin) is ever materialized;
// everything outside is evicted. These are pure and deterministic — unit-testable with no git, no
// tmux — so the load-bearing virtualization logic is proven independently of I/O.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)

import { Static } from 'ivue/extras';

/** A contiguous run of indices to fetch: commits [offset, offset+length). */
class $GitWindow {
  /** One or more contiguous missing regions inside the requested window. */
  static missingRanges(
    loaded: ReadonlySet<number>,
    start: number,
    count: number,
  ): FetchRange[] {
    const from = Math.max(0, start);
    const to = from + count;
    const ranges: FetchRange[] = [];
    let runOffset = -1;
    for (let index = from; index < to; index += 1) {
      const missing = !loaded.has(index);
      if (missing && runOffset < 0) {
        runOffset = index;
      } else if (!missing && runOffset >= 0) {
        ranges.push({ offset: runOffset, length: index - runOffset });
        runOffset = -1;
      }
    }
    if (runOffset >= 0) {
      ranges.push({ offset: runOffset, length: to - runOffset });
    }
    return ranges;
  }

  /** Indices to evict when only `[keepStart, keepStart+keepCount)` is actively observed. */
  static evictable(
    loaded: Iterable<number>,
    keepStart: number,
    keepCount: number,
  ): number[] {
    const minimumKeepStart = Math.max(0, keepStart);
    const maximumKeepEnd = keepStart + keepCount;
    const evicted: number[] = [];
    for (const index of loaded) {
      if (index < minimumKeepStart || index >= maximumKeepEnd) {
        evicted.push(index);
      }
    }
    return evicted;
  }
}

export namespace GitWindow {
  export const $Class = $GitWindow;
  export const Class = Static($GitWindow);
}

export interface FetchRange {
  offset: number;
  length: number;
}
