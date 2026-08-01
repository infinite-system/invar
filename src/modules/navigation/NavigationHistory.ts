import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';

// Browser-style navigation history (VS Code "Go Back / Go Forward"): an ordered list of opaque
// view states plus a cursor into it. View contributors own capture, restore, and same-place
// identity. This class owns only sequence mechanics and replay suppression.
// invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
// invariant: Seams are drawn at the shared generator (project.invariants.md)
class $NavigationHistory {
  /** The largest number of entries retained; recording past it drops the oldest. */
  protected static get MAXIMUM_ENTRY_COUNT(): number {
    return 100;
  }

  get entries() {
    return shallowRef<NavigationHistoryEntry[]>([]);
  }
  get currentIndex() {
    return ref(-1);
  }
  protected readonly contributors = new Map<
    string,
    NavigationHistoryContributor
  >();
  protected recordingSuppressionDepth = 0;

  get currentEntry(): NavigationHistoryEntry | null {
    const index = this.currentIndex.value;
    return index >= 0 ? (this.entries.value[index] ?? null) : null;
  }

  get canGoBack(): boolean {
    return this.currentIndex.value > 0;
  }
  get canGoForward(): boolean {
    return this.currentIndex.value < this.entries.value.length - 1;
  }
  get size(): number {
    return this.entries.value.length;
  }

  /** Register one view-state owner. Identifiers are unique within a history. */
  register(contributor: NavigationHistoryContributor): () => void {
    if (this.contributors.has(contributor.identifier)) {
      throw new Error(
        `Navigation history contributor '${contributor.identifier}' is already registered`,
      );
    }
    this.contributors.set(contributor.identifier, contributor);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      if (this.contributors.get(contributor.identifier) === contributor) {
        this.contributors.delete(contributor.identifier);
      }
    };
  }

  /** Capture the current state from the first contributor that has one. */
  recordCurrentState(): void {
    if (this.recordingSuppressionDepth > 0) return;
    for (const contributor of this.contributors.values()) {
      const payload = contributor.captureCurrentState();
      if (payload === null) continue;
      this.record({ contributorIdentifier: contributor.identifier, payload });
      return;
    }
  }

  /** Suppress every contributor's recording while a programmatic navigation is in progress. */
  runWithoutRecording<Result>(action: () => Result): Result {
    this.recordingSuppressionDepth += 1;
    try {
      return action();
    } finally {
      this.recordingSuppressionDepth -= 1;
    }
  }

  protected record(entry: NavigationHistoryEntry): void {
    const current = this.currentEntry;
    if (current?.contributorIdentifier === entry.contributorIdentifier) {
      const contributor = this.contributors.get(entry.contributorIdentifier);
      if (contributor?.samePlace(current.payload, entry.payload)) {
        if (current.payload === entry.payload) return;
        const collapsedEntries = this.entries.value.slice();
        collapsedEntries[this.currentIndex.value] = entry;
        this.entries.value = collapsedEntries;
        return;
      }
    }

    const retainedEntries = this.entries.value.slice(
      0,
      this.currentIndex.value + 1,
    );
    retainedEntries.push(entry);
    const navigationHistoryClass = this
      .constructor as typeof $NavigationHistory;
    while (
      retainedEntries.length > navigationHistoryClass.MAXIMUM_ENTRY_COUNT
    ) {
      retainedEntries.shift();
    }
    this.entries.value = retainedEntries;
    this.currentIndex.value = retainedEntries.length - 1;
  }

  /** Restore the previous usable entry. Unrestorable entries are removed from the trail. */
  back(): boolean {
    return this.navigate(-1);
  }

  /** Restore the next usable entry. Unrestorable entries are removed from the trail. */
  forward(): boolean {
    return this.navigate(1);
  }

  protected navigate(direction: -1 | 1): boolean {
    while (true) {
      const candidateIndex = this.currentIndex.value + direction;
      if (candidateIndex < 0 || candidateIndex >= this.entries.value.length) {
        return false;
      }
      const candidate = this.entries.value[candidateIndex];
      if (!candidate) return false;
      const contributor = this.contributors.get(
        candidate.contributorIdentifier,
      );
      const restored =
        contributor !== undefined &&
        this.runWithoutRecording(() =>
          contributor.restoreState(candidate.payload),
        );
      if (restored) {
        this.currentIndex.value = candidateIndex;
        return true;
      }
      this.dropEntry(candidateIndex);
    }
  }

  protected dropEntry(entryIndex: number): void {
    const retainedEntries = this.entries.value.slice();
    retainedEntries.splice(entryIndex, 1);
    this.entries.value = retainedEntries;
    if (entryIndex < this.currentIndex.value) this.currentIndex.value -= 1;
    if (retainedEntries.length === 0) this.currentIndex.value = -1;
  }

  clear(): void {
    this.entries.value = [];
    this.currentIndex.value = -1;
  }
}

export namespace NavigationHistory {
  export const $Class = Static($NavigationHistory);
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

/** One view's contribution to the shared history trail. */
export interface NavigationHistoryContributor {
  readonly identifier: string;
  captureCurrentState(): unknown | null;
  restoreState(payload: unknown): boolean;
  samePlace(previousPayload: unknown, nextPayload: unknown): boolean;
}

/** One opaque state captured from its identified contributor. */
export interface NavigationHistoryEntry {
  readonly contributorIdentifier: string;
  readonly payload: unknown;
}
