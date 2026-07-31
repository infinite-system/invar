import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type {
  InvariantFieldMetadata,
  InvariantSnapshot,
  RankedRecord,
  TimelineTransition,
} from '../types';
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

  selectComposition(compositionIdentifier: string) {
    this.selectedCompositionIdentifier.value = compositionIdentifier;
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
