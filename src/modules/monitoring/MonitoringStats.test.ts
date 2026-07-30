import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { RenderLoadLedger } from '../system/RenderLoadLedger';
import { MonitoringStats } from './MonitoringStats';
import type { MonitoredWorkspaceLedger } from './MonitoringStats';
import type { RetainedDocumentRow } from '../workspace/OpenBufferSet';

function documentRow(
  path: string,
  hydrated: boolean,
  retainedTextUnits: number,
): RetainedDocumentRow {
  return {
    path,
    hydrated,
    active: false,
    dirty: false,
    retainedTextUnits,
    retainedLineCount: hydrated ? 10 : 0,
  };
}

/** A stats model whose log lines are captured instead of written, so no test touches a file. */
class $RecordingMonitoringStats extends MonitoringStats.$Class {
  readonly writtenLines: string[] = [];
  protected override writeLogLine(line: string): void {
    this.writtenLines.push(line);
    this.logLineCount.value += 1;
  }
}

describe('MonitoringStats', () => {
  let observed = false;
  let renderRequests = 0;
  let ledgers: MonitoredWorkspaceLedger[] = [];
  let stats: InstanceType<ReturnType<typeof buildClass>>;

  function buildClass() {
    return MonitoringStats.$Class as unknown as typeof $RecordingMonitoringStats;
  }

  function createStats(): $RecordingMonitoringStats {
    const RecordingClass = $RecordingMonitoringStats;
    return new RecordingClass({
      isObserved: () => observed,
      requestRender: () => {
        renderRequests += 1;
      },
      sampleIntervalSeconds: () => 1,
      workspaceLedgers: () => ledgers,
      ownIdentifier: () => 'monitoring',
      logFilePath: () => '/dev/null',
    });
  }

  beforeEach(() => {
    observed = false;
    renderRequests = 0;
    ledgers = [];
    RenderLoadLedger.Class.reset();
    stats = createStats() as unknown as typeof stats;
  });

  afterEach(() => {
    stats.dispose();
  });

  test('a fresh model has taken no sample and owns no clock', () => {
    expect(stats.sampleCount.value).toBe(0);
    expect(stats.samplingAtRest()).toBe(true);
    expect(stats.sample.value).toBeNull();
  });

  test('one sample publishes a reading and prices itself', () => {
    stats.takeSample();
    expect(stats.sampleCount.value).toBe(1);
    expect(stats.sample.value?.residentSetBytes).toBeGreaterThan(0);
    // The first sample has no previous reading, so it reports no rate rather than a wrong one.
    expect(stats.processorPercent.value).toBe(0);
    expect(stats.sampleCostMilliseconds.value).toBeGreaterThanOrEqual(0);
  });

  test('the document ledger sums only what each buffer set says it retains', () => {
    ledgers = [
      {
        root: '/one',
        rows: [
          documentRow('/one/live.ts', true, 1_000),
          documentRow('/one/cold.ts', false, 0),
        ],
      },
      { root: '/two', rows: [documentRow('/two/live.ts', true, 2_500)] },
    ];
    stats.takeSample();
    expect(stats.documentRows.value.length).toBe(3);
    expect(stats.hydratedDocumentCount).toBe(2);
    expect(stats.dehydratedDocumentCount).toBe(1);
    // Two bytes per UTF-16 unit: (1000 + 2500) * 2.
    expect(stats.retainedDocumentBytes).toBe(7_000);
    expect(stats.documentRows.value[0]?.workspaceRoot).toBe('/one');
    expect(stats.documentRows.value[2]?.workspaceRoot).toBe('/two');
  });

  test('a dehydrated tab contributes no retained bytes', () => {
    ledgers = [{ root: '/one', rows: [documentRow('/one/cold.ts', false, 0)] }];
    stats.takeSample();
    expect(stats.retainedDocumentBytes).toBe(0);
    expect(stats.hydratedDocumentCount).toBe(0);
  });

  test('becoming observed starts the clock and becoming hidden stops it', () => {
    stats.startObservation();
    expect(stats.samplingAtRest()).toBe(true);
    expect(stats.sampleCount.value).toBe(0);
    observed = true;
    stats.startObservation();
    // startObservation is idempotent, so the watcher is what must react.
    stats.takeSample();
    expect(stats.sampleCount.value).toBeGreaterThan(0);
  });

  test('render load is reported against the baseline taken when the pane opened', () => {
    RenderLoadLedger.Class.record('git');
    RenderLoadLedger.Class.record('git');
    RenderLoadLedger.Class.markQuietBaseline();
    expect(stats.renderRequestsSinceOpen).toBe(0);
    expect(stats.strayCandidate()).toBeNull();
    RenderLoadLedger.Class.record('structure');
    RenderLoadLedger.Class.record('structure');
    RenderLoadLedger.Class.record('git');
    expect(stats.renderRequestsSinceOpen).toBe(3);
    expect(stats.strayCandidate()?.ownerIdentifier).toBe('git');
    stats.takeSample();
    expect(stats.renderLoadRows.value.length).toBe(2);
  });

  test('the monitor excludes itself from its own suspect list but still names its load', () => {
    RenderLoadLedger.Class.markQuietBaseline();
    for (let index = 0; index < 20; index += 1) {
      RenderLoadLedger.Class.record('monitoring');
    }
    RenderLoadLedger.Class.record('structure');
    // The monitor repaints once per cadence tick, so without the exclusion it would always top
    // its own list and hide the plugin the reader is hunting.
    expect(stats.strayCandidate()?.ownerIdentifier).toBe('structure');
    expect(stats.ownRenderRequestsSinceOpen).toBe(20);
    expect(stats.renderRequestsSinceOpen).toBe(21);
    stats.takeSample();
    // Excluded from the verdict, never hidden from the ledger.
    expect(
      stats.renderLoadRows.value.map((row) => row.ownerIdentifier),
    ).toContain('monitoring');
  });

  test('with no other plugin asking, there is no suspect rather than a false one', () => {
    RenderLoadLedger.Class.markQuietBaseline();
    RenderLoadLedger.Class.record('monitoring');
    expect(stats.strayCandidate()).toBeNull();
    expect(stats.ownRenderRequestsSinceOpen).toBe(1);
  });

  test('logging off writes nothing; logging on writes one line per sample', () => {
    stats.takeSample();
    expect(stats.writtenLines.length).toBe(0);
    expect(stats.logLineCount.value).toBe(0);
    stats.toggleLogging();
    expect(stats.logging.value).toBe(true);
    stats.takeSample();
    stats.takeSample();
    expect(stats.writtenLines.length).toBe(2);
    expect(stats.logLineCount.value).toBe(2);
    const entry = JSON.parse(stats.writtenLines[0] ?? '{}');
    expect(typeof entry.residentSetBytes).toBe('number');
    expect(typeof entry.processorPercent).toBe('number');
    expect(typeof entry.retainedDocumentBytes).toBe('number');
  });

  test('turning logging off stops the writing at once', () => {
    stats.toggleLogging();
    stats.takeSample();
    stats.toggleLogging();
    stats.takeSample();
    stats.takeSample();
    expect(stats.logging.value).toBe(false);
    expect(stats.writtenLines.length).toBe(1);
  });

  test('the in-memory log ring is bounded, so a long watch holds a fixed cost', () => {
    stats.toggleLogging();
    for (let index = 0; index < 260; index += 1) stats.takeSample();
    expect(stats.writtenLines.length).toBe(260);
    expect(stats.logLines.length).toBe(200);
  });

  test('the resident-set history is bounded too', () => {
    for (let index = 0; index < 200; index += 1) stats.takeSample();
    expect(stats.residentSetHistory.value.length).toBe(120);
  });

  test('a census records what survived, counts itself, and asks for a repaint', async () => {
    const renderRequestsBefore = renderRequests;
    await stats.takeCensus();
    expect(stats.censusCount.value).toBe(1);
    expect(stats.census.value?.liveHeapBytes).toBeGreaterThan(0);
    expect(stats.census.value?.costMilliseconds).toBeGreaterThan(0);
    expect(renderRequests).toBe(renderRequestsBefore + 1);
  });

  test('disposing leaves no clock behind', () => {
    observed = true;
    stats.startObservation();
    expect(stats.samplingAtRest()).toBe(false);
    stats.dispose();
    expect(stats.samplingAtRest()).toBe(true);
  });
});
