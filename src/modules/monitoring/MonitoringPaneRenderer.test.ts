import { describe, expect, test } from 'bun:test';
import { ThemePalettes } from '../theme/ThemePalettes';
import { MonitoringPaneRenderer } from './MonitoringPaneRenderer';
import type { MonitoringRenderState } from './MonitoringPaneRenderer';
import type { MonitoredDocumentRow } from './MonitoringStats';

const palette = ThemePalettes.Class.DARK;

function documentRow(
  path: string,
  hydrated: boolean,
  retainedBytes: number,
): MonitoredDocumentRow {
  return {
    path,
    hydrated,
    active: false,
    dirty: false,
    retainedTextUnits: retainedBytes / 2,
    retainedLineCount: 12,
    workspaceRoot: '/workspace',
    retainedBytes,
  };
}

function state(
  overrides: Partial<MonitoringRenderState> = {},
): MonitoringRenderState {
  return {
    palette,
    width: 26,
    height: 38,
    sample: {
      processId: 4242,
      residentSetBytes: 263 * 1024 * 1024,
      heapUsedBytes: 40 * 1024 * 1024,
      heapTotalBytes: 55 * 1024 * 1024,
    },
    processorPercent: 1.25,
    census: null,
    documentRows: [],
    retainedDocumentBytes: 0,
    renderLoadRows: [],
    renderRequestsSinceOpen: 0,
    sampleIntervalSeconds: 1,
    sampleCount: 3,
    sampleCostMilliseconds: 0.17,
    logging: false,
    logLineCount: 0,
    ...overrides,
  };
}

function paintedRows(renderState: MonitoringRenderState): string[] {
  const styled = MonitoringPaneRenderer.Class.render(
    renderState,
  ) as unknown as {
    chunks: { text: string }[];
  };
  return styled.chunks
    .map((chunk) => chunk.text)
    .join('')
    .split('\n');
}

describe('MonitoringPaneRenderer', () => {
  test('every painted row fits the pane width, so a narrow dock never wraps a number', () => {
    const rows = paintedRows(
      state({
        width: 20,
        documentRows: [
          documentRow(
            '/workspace/a/very/long/path/to/SomeModuleName.ts',
            true,
            400_000,
          ),
        ],
        retainedDocumentBytes: 400_000,
        renderLoadRows: [
          {
            ownerIdentifier: 'a-plugin-with-a-long-identifier',
            requestCount: 90,
            requestCountSinceBaseline: 90,
          },
        ],
        renderRequestsSinceOpen: 90,
      }),
    );
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(20);
    expect(rows.length).toBeGreaterThan(10);
  });

  test('the reading names its window, so nobody reads it as a lifetime average', () => {
    const painted = paintedRows(state({ sampleIntervalSeconds: 5 })).join('\n');
    expect(painted).toContain('cpu  1.3% of one core');
    expect(painted).toContain('delta over 5s');
    expect(painted).toContain('pid 4242');
  });

  test('without a census the pane states why heap-used is not the retained truth', () => {
    const painted = paintedRows(state()).join('\n');
    expect(painted).toContain('rss  263.0 MB');
    expect(painted).toContain('heap-used moves at GC.');
    expect(painted).toContain('Press c for a census.');
    expect(painted).not.toContain('after GC');
  });

  test('a census paints the retained heap, the capacity above it, and its own price', () => {
    const painted = paintedRows(
      state({
        census: {
          liveHeapBytes: 28 * 1024 * 1024,
          heapCapacityBytes: 41 * 1024 * 1024,
          liveObjectCount: 512_345,
          residentSetBeforeBytes: 263 * 1024 * 1024,
          residentSetAfterBytes: 250 * 1024 * 1024,
          costMilliseconds: 19.4,
        },
      }),
    ).join('\n');
    expect(painted).toContain('live 28.0 MB after GC');
    expect(painted).toContain('cap  41.0 MB');
    expect(painted).toContain('objs 512345');
    expect(painted).toContain('freed 13.0 MB rss');
    expect(painted).toContain('census cost 19 ms');
  });

  test('the file ledger separates live documents from cold tabs', () => {
    const painted = paintedRows(
      state({
        documentRows: [
          documentRow('/workspace/live-one.ts', true, 260_000),
          documentRow('/workspace/cold-one.ts', false, 0),
          documentRow('/workspace/cold-two.ts', false, 0),
        ],
        retainedDocumentBytes: 260_000,
      }),
    ).join('\n');
    expect(painted).toContain('files 3 open, 1 live');
    expect(painted).toContain('held  0.2 MB');
    expect(painted).toContain('live 0.2 live-one.ts');
    expect(painted).toContain('cold 0.0 cold-one.ts');
  });

  test('an empty ledger states that no file is open rather than painting nothing', () => {
    expect(paintedRows(state()).join('\n')).toContain('No file is open.');
  });

  test('render load sorts the heaviest plugin first, which is the stray lens', () => {
    const painted = paintedRows(
      state({
        renderRequestsSinceOpen: 143,
        renderLoadRows: [
          {
            ownerIdentifier: 'noisy',
            requestCount: 900,
            requestCountSinceBaseline: 140,
          },
          {
            ownerIdentifier: 'quiet',
            requestCount: 12,
            requestCountSinceBaseline: 3,
          },
          {
            ownerIdentifier: 'silent',
            requestCount: 12,
            requestCountSinceBaseline: 0,
          },
        ],
      }),
    ).join('\n');
    expect(painted).toContain('paints 143 since open');
    expect(painted.indexOf('noisy')).toBeLessThan(painted.indexOf('quiet'));
    // A plugin that raised nothing while watching is not a suspect, so it is not listed.
    expect(painted).not.toContain('silent');
  });

  test('the pane names its own cost every paint', () => {
    const painted = paintedRows(state()).join('\n');
    expect(painted).toContain('my cost 0.17 ms/sample');
    expect(painted).toContain('samples 3');
    expect(painted).toContain('logging off (press l)');
  });

  test('logging on names how many lines it has written', () => {
    const painted = paintedRows(
      state({ logging: true, logLineCount: 41 }),
    ).join('\n');
    expect(painted).toContain('logging on, 41 lines');
  });

  test('before the first sample the pane states that it measures only while open', () => {
    const painted = paintedRows(state({ sample: null })).join('\n');
    expect(painted).toContain('No sample yet.');
    expect(painted).toContain('Open me to measure.');
    expect(painted).not.toContain('rss');
  });
});
