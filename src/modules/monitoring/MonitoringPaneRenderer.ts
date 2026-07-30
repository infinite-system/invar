// The monitoring pane's paint: a pure projection from stats to cells. No clocks, no reads, no
// state — hand it the same numbers twice and it paints the same rows twice, which is what makes it
// testable without a terminal.
//
// NARROW FIRST. The pane's home is a dock about 26 columns wide, so every fact owns its own row and
// every row is clipped to the pane width. A wider dock simply leaves space to the right; nothing
// reflows, so a drag of the dock divider can never hide a number behind a wrap.
//
// Every colour comes from the palette the host supplies. The renderer names no colour of its own.
//
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
// invariant: The monitor names its own cost and pays it only when observed (src/modules/monitoring/monitoring.invariants.md)
import type { StyledText, TextChunk } from '@opentui/core';
import { StyledText as OpenTuiStyledText, fg } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { RenderLoadEntry } from '../system/RenderLoadLedger';
import type { MonitoredDocumentRow } from './MonitoringStats';

class $MonitoringPaneRenderer {
  protected static get BYTES_PER_MEGABYTE(): number {
    return 1_048_576;
  }

  /** Document rows painted before the section states its remainder. */
  protected static get MAXIMUM_DOCUMENT_ROWS(): number {
    return 6;
  }

  protected static get MAXIMUM_RENDER_LOAD_ROWS(): number {
    return 5;
  }

  /** Left margin, in cells, shared by every row so the sections line up. */
  protected static get INDENT(): string {
    return ' ';
  }

  static megabytes(bytes: number): string {
    return (bytes / this.BYTES_PER_MEGABYTE).toFixed(1);
  }

  /** Clip to the pane width. A dock this narrow must never wrap a number onto a second row. */
  static clip(text: string, width: number): string {
    if (width <= 1) return '';
    if (text.length <= width) return text;
    return `${text.slice(0, width - 1)}…`;
  }

  /** The last path segment. A full path never fits a 26-column dock, and the tail is what names it. */
  static fileName(path: string): string {
    const separatorIndex = path.lastIndexOf('/');
    return separatorIndex < 0 ? path : path.slice(separatorIndex + 1);
  }

  static render(state: MonitoringRenderState): StyledText {
    const chunks: TextChunk[] = [];
    this.push(chunks, state, state.palette.fg, 'Invar Monitoring');
    this.push(chunks, state, state.palette.dim, '');
    this.renderProcessRows(chunks, state);
    this.renderMemoryRows(chunks, state);
    this.renderDocumentRows(chunks, state);
    this.renderRenderLoadRows(chunks, state);
    this.renderCostRows(chunks, state);
    return new OpenTuiStyledText(chunks);
  }

  /** One clipped, indented, newline-terminated row in one palette colour. */
  protected static push(
    chunks: TextChunk[],
    state: MonitoringRenderState,
    color: string,
    text: string,
  ): void {
    chunks.push(
      fg(color)(`${this.clip(`${this.INDENT}${text}`, state.width)}\n`),
    );
  }

  protected static renderProcessRows(
    chunks: TextChunk[],
    state: MonitoringRenderState,
  ): void {
    if (state.sample === null) {
      this.push(chunks, state, state.palette.dim, 'No sample yet.');
      this.push(chunks, state, state.palette.dim, 'Open me to measure.');
      this.push(chunks, state, state.palette.dim, '');
      return;
    }
    this.push(
      chunks,
      state,
      state.palette.fg,
      `cpu  ${state.processorPercent.toFixed(1)}% of one core`,
    );
    this.push(
      chunks,
      state,
      state.palette.dim,
      `delta over ${state.sampleIntervalSeconds}s, pid ${state.sample.processId}`,
    );
    this.push(chunks, state, state.palette.dim, '');
  }

  protected static renderMemoryRows(
    chunks: TextChunk[],
    state: MonitoringRenderState,
  ): void {
    if (state.sample !== null) {
      this.push(
        chunks,
        state,
        state.palette.fg,
        `rss  ${this.megabytes(state.sample.residentSetBytes)} MB`,
      );
      this.push(
        chunks,
        state,
        state.palette.fg,
        `heap ${this.megabytes(state.sample.heapUsedBytes)} MB used`,
      );
      this.push(
        chunks,
        state,
        state.palette.dim,
        `     ${this.megabytes(state.sample.heapTotalBytes)} MB total`,
      );
    }
    if (state.census === null) {
      this.push(chunks, state, state.palette.dim, 'heap-used moves at GC.');
      this.push(chunks, state, state.palette.dim, 'Press c for a census.');
      this.push(chunks, state, state.palette.dim, '');
      return;
    }
    const reclaimedBytes = Math.max(
      0,
      state.census.residentSetBeforeBytes - state.census.residentSetAfterBytes,
    );
    this.push(
      chunks,
      state,
      state.palette.accent,
      `live ${this.megabytes(state.census.liveHeapBytes)} MB after GC`,
    );
    this.push(
      chunks,
      state,
      state.palette.dim,
      `cap  ${this.megabytes(state.census.heapCapacityBytes)} MB`,
    );
    this.push(
      chunks,
      state,
      state.palette.dim,
      `objs ${state.census.liveObjectCount}`,
    );
    this.push(
      chunks,
      state,
      state.palette.dim,
      `freed ${this.megabytes(reclaimedBytes)} MB rss`,
    );
    this.push(
      chunks,
      state,
      state.palette.dim,
      `census cost ${state.census.costMilliseconds.toFixed(0)} ms`,
    );
    this.push(chunks, state, state.palette.dim, '');
  }

  protected static renderDocumentRows(
    chunks: TextChunk[],
    state: MonitoringRenderState,
  ): void {
    const hydratedCount = state.documentRows.filter(
      (row) => row.hydrated,
    ).length;
    this.push(
      chunks,
      state,
      state.palette.fg,
      `files ${state.documentRows.length} open, ${hydratedCount} live`,
    );
    this.push(
      chunks,
      state,
      state.palette.fg,
      `held  ${this.megabytes(state.retainedDocumentBytes)} MB`,
    );
    if (state.documentRows.length === 0) {
      this.push(chunks, state, state.palette.dim, 'No file is open.');
      this.push(chunks, state, state.palette.dim, '');
      return;
    }
    const paintedRows = state.documentRows.slice(0, this.MAXIMUM_DOCUMENT_ROWS);
    for (const row of paintedRows) {
      this.push(
        chunks,
        state,
        row.hydrated ? state.palette.fg : state.palette.dim,
        `${row.hydrated ? 'live' : 'cold'} ${this.megabytes(row.retainedBytes)} ${this.fileName(row.path)}`,
      );
    }
    const remainder = state.documentRows.length - paintedRows.length;
    if (remainder > 0) {
      this.push(chunks, state, state.palette.dim, `and ${remainder} more`);
    }
    this.push(chunks, state, state.palette.dim, '');
  }

  protected static renderRenderLoadRows(
    chunks: TextChunk[],
    state: MonitoringRenderState,
  ): void {
    this.push(
      chunks,
      state,
      state.palette.fg,
      `paints ${state.renderRequestsSinceOpen} since open`,
    );
    const busyRows = state.renderLoadRows
      .filter((row) => row.requestCountSinceBaseline > 0)
      .slice(0, this.MAXIMUM_RENDER_LOAD_ROWS);
    if (busyRows.length === 0) {
      this.push(chunks, state, state.palette.dim, 'No plugin asked.');
      this.push(chunks, state, state.palette.dim, '');
      return;
    }
    for (const row of busyRows) {
      this.push(
        chunks,
        state,
        state.palette.dim,
        `${String(row.requestCountSinceBaseline).padStart(5)} ${row.ownerIdentifier}`,
      );
    }
    this.push(chunks, state, state.palette.dim, '');
  }

  protected static renderCostRows(
    chunks: TextChunk[],
    state: MonitoringRenderState,
  ): void {
    this.push(
      chunks,
      state,
      state.palette.dim,
      `my cost ${state.sampleCostMilliseconds.toFixed(2)} ms/sample`,
    );
    this.push(chunks, state, state.palette.dim, `samples ${state.sampleCount}`);
    this.push(
      chunks,
      state,
      state.palette.dim,
      state.logging
        ? `logging on, ${state.logLineCount} lines`
        : 'logging off (press l)',
    );
  }
}

export namespace MonitoringPaneRenderer {
  export const $Class = Static($MonitoringPaneRenderer);
  export let Class = $Class;
}

/** Everything the paint needs, and nothing it could read for itself. */
export interface MonitoringRenderState {
  readonly palette: Palette;
  readonly width: number;
  readonly height: number;
  readonly sample: MonitoringSampleView | null;
  readonly processorPercent: number;
  readonly census: MonitoringCensusView | null;
  readonly documentRows: readonly MonitoredDocumentRow[];
  readonly retainedDocumentBytes: number;
  readonly renderLoadRows: readonly RenderLoadEntry[];
  readonly renderRequestsSinceOpen: number;
  readonly sampleIntervalSeconds: number;
  readonly sampleCount: number;
  readonly sampleCostMilliseconds: number;
  readonly logging: boolean;
  readonly logLineCount: number;
}

/** The reading fields the paint uses. A subset of `RuntimeProcessSample`, so a test needs no clock. */
export interface MonitoringSampleView {
  readonly processId: number;
  readonly residentSetBytes: number;
  readonly heapUsedBytes: number;
  readonly heapTotalBytes: number;
}

/** The census fields the paint uses. */
export interface MonitoringCensusView {
  readonly liveHeapBytes: number;
  readonly heapCapacityBytes: number;
  readonly liveObjectCount: number;
  readonly residentSetBeforeBytes: number;
  readonly residentSetAfterBytes: number;
  readonly costMilliseconds: number;
}
