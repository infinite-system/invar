import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type {
  InvariantFieldMetadata,
  InvariantSnapshot,
  RankedRecord,
} from '../types';

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

  async loadSnapshot(snapshotIndex: number) {
    const response = await fetch(`/api/snapshots/${snapshotIndex}`);
    if (!response.ok) throw new Error('The snapshot request failed.');
    this.snapshot.value = (await response.json()) as InvariantSnapshot;
    this.snapshotIndex.value = snapshotIndex;
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

  selectRecord(recordIdentifier: string) {
    this.selectedRecordIdentifier.value = recordIdentifier;
  }

  clearSelection() {
    this.selectedRecordIdentifier.value = null;
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
}
