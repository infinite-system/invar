import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type {
  InvariantFieldMetadata,
  InvariantSnapshot,
  RankedRecord,
  TimelineTransition,
} from '../types';
import { Instrument } from '../Instrument';
import { TimelinePlayout } from '../TimelinePlayout';

class $InvariantFieldApp {
  constructor() {
    void this.start();
  }

  // --- state ---
  get metadata() {
    return shallowRef<InvariantFieldMetadata | null>(null);
  }
  get snapshot() {
    return shallowRef<InvariantSnapshot | null>(null);
  }
  get snapshotIndex() {
    return ref(0);
  }
  get selectedRecordIdentifier() {
    return ref<string | null>(null);
  }
  get selectedCompositionIdentifier() {
    return ref('');
  }
  get searchQuery() {
    return ref('');
  }
  get selectedKind() {
    return ref('');
  }
  get selectedDomain() {
    return ref('');
  }
  get sortOrder() {
    return ref('rank-descending');
  }
  get errorMessage() {
    return ref('');
  }
  get isTimelinePlaying() {
    return ref(false);
  }
  get timelineTransition() {
    return shallowRef<TimelineTransition | null>(null);
  }
  get snapshotRequest() {
    return shallowRef<AbortController | null>(null);
  }
  get timelineTransitionIdentifier() {
    return ref(0);
  }

  // --- derived ---
  get isReady() {
    return Boolean(this.metadata.value && this.snapshot.value);
  }
  get readyMetadata(): InvariantFieldMetadata {
    if (!this.metadata.value) {
      throw new Error('The field metadata is not ready.');
    }
    return this.metadata.value;
  }
  get readySnapshot(): InvariantSnapshot {
    if (!this.snapshot.value) {
      throw new Error('The field snapshot is not ready.');
    }
    return this.snapshot.value;
  }
  get selectedRecord(): RankedRecord | null {
    return (
      this.snapshot.value?.records.find(
        (record) =>
          record.stableIdentifier === this.selectedRecordIdentifier.value,
      ) ?? null
    );
  }
  get selectedComposition() {
    return (
      this.snapshot.value?.compositions.find(
        (composition) =>
          composition.identifier === this.selectedCompositionIdentifier.value,
      ) ?? null
    );
  }
  /**
   * The one focus fold. The field, the rail, and the lens all read this set;
   * none of them filters again on its own.
   */
  // invariant: One focus fold serves every surface (tools/invariant-field-v2/invariant-field.invariants.md)
  get focusedRecords(): RankedRecord[] {
    const query = this.searchQuery.value.toLowerCase().trim();
    const memberIdentifiers = new Set(
      this.selectedComposition?.memberIdentifiers ?? [],
    );
    const records = (this.snapshot.value?.records ?? []).filter((record) => {
      if (this.selectedKind.value && record.kind !== this.selectedKind.value) {
        return false;
      }
      if (
        this.selectedDomain.value &&
        record.contractPath !== this.selectedDomain.value
      ) {
        return false;
      }
      if (
        this.selectedComposition &&
        !memberIdentifiers.has(record.stableIdentifier)
      ) {
        return false;
      }
      if (!query) return true;
      return [record.name, record.contractPath, ...Object.values(record.fields)]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    return records.toSorted((left, right) => this.compareRecords(left, right));
  }
  get focusedRecordIdentifiers(): Set<string> {
    return new Set(
      this.focusedRecords.map((record) => record.stableIdentifier),
    );
  }
  get isFocused() {
    return (
      this.focusedRecords.length !== (this.snapshot.value?.records.length ?? 0)
    );
  }
  get contractPaths() {
    return [
      ...new Set(
        (this.snapshot.value?.records ?? []).map(
          (record) => record.contractPath,
        ),
      ),
    ].sort();
  }
  get activeFocusChips() {
    const chips: Array<{ key: string; label: string }> = [];
    if (this.searchQuery.value.trim()) {
      chips.push({
        key: 'search',
        label: `“${this.searchQuery.value.trim()}”`,
      });
    }
    if (this.selectedKind.value) {
      chips.push({
        key: 'kind',
        label: this.kindLabel(this.selectedKind.value),
      });
    }
    if (this.selectedDomain.value) {
      chips.push({ key: 'domain', label: this.selectedDomain.value });
    }
    if (this.selectedComposition) {
      chips.push({
        key: 'composition',
        label: this.selectedComposition.name,
      });
    }
    return chips;
  }
  get instrumentRecordCount() {
    const snapshotMetadata =
      this.metadata.value?.snapshots[this.snapshotIndex.value];
    return snapshotMetadata?.instrumentRecordCount ?? 0;
  }
  get instrumentBirthSnapshotIndex() {
    return (
      this.metadata.value?.snapshots.findIndex(
        (snapshotMetadata) => snapshotMetadata.instrumentRecordCount > 0,
      ) ?? -1
    );
  }
  get isInstrumentFocused() {
    return this.selectedDomain.value === Instrument.Class.CONTRACT_PATH;
  }
  get instrumentFocusLabel() {
    if (this.instrumentBirthSnapshotIndex < 0) {
      return 'The instrument has no contract yet';
    }
    return this.isInstrumentFocused
      ? 'Release the instrument'
      : 'Measure the instrument';
  }
  get headerStatistics() {
    const snapshotMetadata =
      this.metadata.value?.snapshots[this.snapshotIndex.value];
    if (!snapshotMetadata || !this.metadata.value) return [];
    return [
      { label: 'Records', value: String(snapshotMetadata.recordCount) },
      {
        label: 'Annotations',
        value: String(snapshotMetadata.annotationCount),
      },
      {
        label: 'Snapshots',
        value: String(this.metadata.value.snapshots.length),
      },
      { label: 'Checker', value: `v${this.metadata.value.checkerVersion}` },
    ];
  }

  // --- methods ---
  async start() {
    try {
      const response = await fetch('/api/meta');
      if (!response.ok) {
        throw new Error('The field metadata request failed.');
      }
      this.metadata.value = (await response.json()) as InvariantFieldMetadata;
      const requestedSnapshotParameter = new URLSearchParams(
        this.browserWindow.location.search,
      ).get('snapshot');
      const requestedSnapshot = Number(requestedSnapshotParameter);
      const latestSnapshot = this.metadata.value!.snapshots.length - 1;
      const initialSnapshot =
        requestedSnapshotParameter !== null &&
        Number.isInteger(requestedSnapshot)
          ? Math.max(0, Math.min(latestSnapshot, requestedSnapshot))
          : latestSnapshot;
      await this.loadSnapshot(initialSnapshot);
    } catch (error) {
      this.errorMessage.value =
        error instanceof Error ? error.message : String(error);
    }
  }

  async loadSnapshot(snapshotIndex: number, showTransition = false) {
    this.snapshotRequest.value?.abort();
    const snapshotRequest = new AbortController();
    this.snapshotRequest.value = snapshotRequest;
    const response = await fetch(`/api/snapshots/${snapshotIndex}`, {
      signal: snapshotRequest.signal,
    });
    if (!response.ok) throw new Error('The snapshot request failed.');
    const nextSnapshot = (await response.json()) as InvariantSnapshot;
    if (this.snapshotRequest.value !== snapshotRequest) return;
    const previousSnapshot = this.snapshot.value;
    const previousSnapshotIndex = this.snapshotIndex.value;
    this.snapshot.value = nextSnapshot;
    this.snapshotIndex.value = snapshotIndex;
    this.snapshotRequest.value = null;
    this.timelineTransition.value =
      showTransition && previousSnapshot
        ? {
            identifier: ++this.timelineTransitionIdentifier.value,
            fromSnapshotIndex: previousSnapshotIndex,
            toSnapshotIndex: snapshotIndex,
            events: TimelinePlayout.Class.eventsBetween(
              previousSnapshot,
              nextSnapshot,
            ),
          }
        : null;
    const location = new URL(this.browserWindow.location.href);
    location.searchParams.set('snapshot', String(snapshotIndex));
    this.browserWindow.history.replaceState(null, '', location);
    if (!this.selectedRecord) this.selectedRecordIdentifier.value = null;
    if (
      !this.snapshot.value!.compositions.some(
        (composition) =>
          composition.identifier === this.selectedCompositionIdentifier.value,
      )
    ) {
      this.selectedCompositionIdentifier.value = '';
    }
  }

  async selectSnapshot(snapshotIndex: number) {
    this.stopTimeline();
    await this.loadSnapshot(snapshotIndex, true);
  }

  async toggleTimeline() {
    if (this.isTimelinePlaying.value) {
      this.stopTimeline();
      return;
    }
    this.isTimelinePlaying.value = true;
    if (this.snapshotIndex.value >= this.readyMetadata.snapshots.length - 1) {
      await this.loadSnapshot(0);
    }
    await this.advanceTimeline();
  }

  stopTimeline() {
    this.isTimelinePlaying.value = false;
    this.timelineTransition.value = null;
    this.snapshotRequest.value?.abort();
    this.snapshotRequest.value = null;
  }

  async advanceTimeline() {
    if (!this.isTimelinePlaying.value || this.timelineTransition.value) return;
    const nextSnapshotIndex = this.snapshotIndex.value + 1;
    if (nextSnapshotIndex >= this.readyMetadata.snapshots.length) {
      this.isTimelinePlaying.value = false;
      return;
    }
    try {
      await this.loadSnapshot(nextSnapshotIndex, true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.isTimelinePlaying.value = false;
      this.errorMessage.value =
        error instanceof Error ? error.message : String(error);
    }
  }

  settleTimelineTransition(transitionIdentifier: number) {
    if (this.timelineTransition.value?.identifier !== transitionIdentifier) {
      return;
    }
    this.timelineTransition.value = null;
    if (this.isTimelinePlaying.value) {
      this.browserWindow.queueMicrotask(() => void this.advanceTimeline());
    }
  }

  selectRecord(recordIdentifier: string) {
    this.stopTimeline();
    this.selectedRecordIdentifier.value = recordIdentifier;
  }

  clearSelection() {
    this.stopTimeline();
    this.selectedRecordIdentifier.value = null;
  }

  selectComposition(compositionIdentifier: string) {
    this.stopTimeline();
    this.selectedCompositionIdentifier.value = compositionIdentifier;
  }

  selectSearchQuery(query: string) {
    this.searchQuery.value = query;
  }

  selectKind(kind: string) {
    this.selectedKind.value = kind;
  }

  selectDomain(contractPath: string) {
    this.selectedDomain.value = contractPath;
  }

  selectSortOrder(sortOrder: string) {
    this.sortOrder.value = sortOrder;
  }

  clearFocusChip(chipKey: string) {
    if (chipKey === 'search') this.searchQuery.value = '';
    if (chipKey === 'kind') this.selectedKind.value = '';
    if (chipKey === 'domain') this.selectedDomain.value = '';
    if (chipKey === 'composition')
      this.selectedCompositionIdentifier.value = '';
  }

  clearFocus() {
    this.searchQuery.value = '';
    this.selectedKind.value = '';
    this.selectedDomain.value = '';
    this.selectedCompositionIdentifier.value = '';
  }

  /**
   * Turn the instrument on itself: focus its own contract and rewind to the
   * snapshot that first carried it, so the playout shows the field being born
   * inside the field.
   */
  async focusInstrument() {
    this.stopTimeline();
    if (this.isInstrumentFocused) {
      this.clearFocus();
      return;
    }
    const birthSnapshotIndex = this.instrumentBirthSnapshotIndex;
    if (birthSnapshotIndex < 0) return;
    this.clearFocus();
    this.selectedDomain.value = Instrument.Class.CONTRACT_PATH;
    this.selectedRecordIdentifier.value = null;
    if (this.snapshotIndex.value !== birthSnapshotIndex) {
      await this.loadSnapshot(birthSnapshotIndex);
    }
  }

  compareRecords(left: RankedRecord, right: RankedRecord) {
    if (this.sortOrder.value === 'rank-ascending')
      return left.rank - right.rank;
    if (this.sortOrder.value === 'name') {
      return left.name.localeCompare(right.name);
    }
    if (this.sortOrder.value === 'domain') {
      return (
        left.contractPath.localeCompare(right.contractPath) ||
        left.name.localeCompare(right.name)
      );
    }
    return right.rank - left.rank;
  }

  kindLabel(kind: string) {
    if (kind === 'reality-absolute') return 'Reality · absolute';
    if (kind === 'reality-renegotiable') return 'Reality · renegotiable';
    return 'Chosen';
  }

  protected get browserWindow(): InvariantFieldBrowserWindow {
    return globalThis as unknown as InvariantFieldBrowserWindow;
  }
}

export namespace InvariantFieldApp {
  export const $Class = $InvariantFieldApp;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

interface InvariantFieldBrowserWindow {
  location: {
    href: string;
    search: string;
  };
  history: {
    replaceState(data: unknown, unused: string, url?: URL | string): void;
  };
  queueMicrotask(callback: () => void): void;
}
