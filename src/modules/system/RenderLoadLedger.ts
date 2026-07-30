// The host's render-request attribution ledger: who asked for a frame, and how often.
//
// The application already hands every contributor its own `requestRender`. That per-contributor
// closure is the ONE place a render request crosses the plugin boundary, so counting there needs no
// second render model and no cooperation from the plugin being measured. The host owns this ledger;
// it names owners by contributor identifier and knows nothing about any particular plugin.
//
// A STRAY plugin is the one whose count keeps climbing while nobody touches the keyboard. That is
// why the ledger also keeps a marked baseline: `markQuietBaseline()` stamps the current counts and
// `sinceQuietBaseline()` reports the requests raised after the stamp.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: Data flows one way (project.invariants.md)
import { Static } from 'ivue/extras';

class $RenderLoadLedger {
  /** Owner identifier to lifetime render-request count. Mutable memo table, cached per receiver. */
  protected static get $requestCountsByOwner(): Map<string, number> {
    return new Map<string, number>();
  }

  /** Owner identifier to the count captured at the last quiet baseline mark. */
  protected static get $baselineCountsByOwner(): Map<string, number> {
    return new Map<string, number>();
  }

  /** The identifier used for render requests raised by the host itself, not by a contributor. */
  protected static get HOST_OWNER_IDENTIFIER(): string {
    return 'host';
  }

  /** Record one render request raised by `ownerIdentifier`. Two map operations, no allocation. */
  static record(ownerIdentifier: string): void {
    const counts = this.$requestCountsByOwner;
    counts.set(ownerIdentifier, (counts.get(ownerIdentifier) ?? 0) + 1);
  }

  /**
   * Wrap a render-request function so every call through it is attributed to `ownerIdentifier`.
   * The host calls this once per contributor activation; the contributor sees an ordinary
   * `requestRender`.
   */
  static attribute(
    ownerIdentifier: string,
    requestRender: () => void,
  ): () => void {
    return () => {
      this.record(ownerIdentifier);
      requestRender();
    };
  }

  /** Lifetime request count for one owner. Zero for an owner that never asked. */
  static countFor(ownerIdentifier: string): number {
    return this.$requestCountsByOwner.get(ownerIdentifier) ?? 0;
  }

  /** Every owner that has ever asked for a frame, with its lifetime count, heaviest first. */
  static counts(): readonly RenderLoadEntry[] {
    return [...this.$requestCountsByOwner.entries()]
      .map(([ownerIdentifier, requestCount]) => ({
        ownerIdentifier,
        requestCount,
        requestCountSinceBaseline:
          requestCount -
          (this.$baselineCountsByOwner.get(ownerIdentifier) ?? 0),
      }))
      .sort(this.byRequestCountDescending);
  }

  protected static byRequestCountDescending(
    left: RenderLoadEntry,
    right: RenderLoadEntry,
  ): number {
    if (right.requestCount !== left.requestCount) {
      return right.requestCount - left.requestCount;
    }
    return left.ownerIdentifier.localeCompare(right.ownerIdentifier);
  }

  /** Stamp the current counts. Everything after this stamp is "raised while I was watching". */
  static markQuietBaseline(): void {
    const baselines = this.$baselineCountsByOwner;
    baselines.clear();
    for (const [ownerIdentifier, requestCount] of this.$requestCountsByOwner) {
      baselines.set(ownerIdentifier, requestCount);
    }
  }

  /** Requests raised since the last baseline mark, heaviest first, zero-count owners removed. */
  static sinceQuietBaseline(): readonly RenderLoadEntry[] {
    return this.counts().filter((entry) => entry.requestCountSinceBaseline > 0);
  }

  /** The total of every owner's requests since the baseline mark. The stray-plugin headline. */
  static totalSinceQuietBaseline(): number {
    return this.counts().reduce(
      (total, entry) => total + Math.max(0, entry.requestCountSinceBaseline),
      0,
    );
  }

  /** Drop every count. Used by tests and by a fresh process composition. */
  static reset(): void {
    this.$requestCountsByOwner.clear();
    this.$baselineCountsByOwner.clear();
  }
}

export namespace RenderLoadLedger {
  export const $Class = Static($RenderLoadLedger);
  export let Class = $Class;
}

/** One owner's render-request load. */
export interface RenderLoadEntry {
  /** The contributor identifier, or `host` for requests the application itself raised. */
  readonly ownerIdentifier: string;
  /** Requests raised over the whole process lifetime. */
  readonly requestCount: number;
  /** Requests raised after the last `markQuietBaseline()`. Negative is impossible after a mark. */
  readonly requestCountSinceBaseline: number;
}
