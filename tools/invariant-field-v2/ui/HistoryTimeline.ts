import { Reactive } from 'ivue';
import type { InvariantFieldMetadata } from '../types';

class $HistoryTimeline {
  constructor(
    public props: HistoryTimelineProps,
    public emit: HistoryTimelineEmits,
  ) {}

  // --- derived ---
  get metadata() {
    return this.props.metadata;
  }
  get snapshotIndex() {
    return this.props.snapshotIndex;
  }
  get snapshot() {
    return this.metadata.snapshots[this.snapshotIndex]!;
  }
  get maximumSnapshotIndex() {
    return this.metadata.snapshots.length - 1;
  }
  get title() {
    return `${this.snapshot.shortCommit} · ${this.snapshot.subject}`;
  }
  get subtitle() {
    return (
      `${this.formattedDate} · ${this.snapshot.recordCount} records · ` +
      `${this.snapshot.annotationCount} annotations · ` +
      `${this.snapshot.orphanCount} orphans`
    );
  }
  get formattedDate() {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(this.snapshot.committedAt));
  }
  get isPreviousDisabled() {
    return this.snapshotIndex === 0;
  }
  get isNextDisabled() {
    return this.snapshotIndex === this.maximumSnapshotIndex;
  }
  get isPlaying() {
    return Boolean(this.props.isPlaying);
  }
  get playButtonLabel() {
    if (this.isPlaying) return 'Pause timeline';
    return this.isNextDisabled ? 'Replay timeline' : 'Play timeline';
  }
  get playButtonGlyph() {
    return this.isPlaying ? 'Ⅱ' : '▶';
  }
  get snapshotPositionLabel() {
    return `${this.snapshotIndex + 1} / ${this.metadata.snapshots.length}`;
  }

  // --- methods ---
  selectFromInput(event: Event) {
    const input = event.currentTarget as EventTarget & { value: string };
    this.emit('select-snapshot', Number(input.value));
  }

  selectPrevious() {
    this.emit('select-snapshot', Math.max(0, this.snapshotIndex - 1));
  }

  selectNext() {
    this.emit(
      'select-snapshot',
      Math.min(this.maximumSnapshotIndex, this.snapshotIndex + 1),
    );
  }

  toggleTimeline() {
    this.emit('toggle-timeline', this.snapshotIndex);
  }
}

export namespace HistoryTimeline {
  export const $Class = $HistoryTimeline;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface HistoryTimelineProps {
  metadata: InvariantFieldMetadata;
  snapshotIndex: number;
  isPlaying?: boolean;
}

export interface HistoryTimelineEmits {
  (event: 'select-snapshot', snapshotIndex: number): void;
  (event: 'toggle-timeline', snapshotIndex: number): void;
}
