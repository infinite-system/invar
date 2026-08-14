import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HarnessTaskReports,
  type TaskReportMeta,
} from './HarnessTaskReports.ts';

function metaFixture(): TaskReportMeta {
  return {
    touchedDomains: ['tasks', 'server'],
    unexpectedDomains: ['gates'],
    invariants: {
      upheld: ['Disk is the store and the graph is a projection'],
      stressed: [],
      violated: [],
      discovered: ['A graph server is a disposable cache'],
      refined: [],
    },
    bycatchCount: 1,
    steering: { needed: true, cause: 'GET-stop bug found by driving' },
    evidence: ['gate-555.log'],
  };
}

test('a planted report-meta.json parses into the schema', () => {
  const taskDirectory = mkdtempSync(join(tmpdir(), 'harness-reports-'));
  try {
    writeFileSync(
      join(taskDirectory, 'report-meta.json'),
      JSON.stringify(metaFixture()),
    );
    const reportMeta = HarnessTaskReports.Class.readReportMeta(taskDirectory, [
      'report-meta.json',
    ]);
    expect(reportMeta).not.toBeNull();
    expect(reportMeta!.touchedDomains).toEqual(['tasks', 'server']);
    expect(reportMeta!.invariants.discovered).toHaveLength(1);
    expect(reportMeta!.steering.needed).toBe(true);
    expect(reportMeta!.bycatchCount).toBe(1);
  } finally {
    rmSync(taskDirectory, { recursive: true, force: true });
  }
});

test('an absent or malformed meta reads null, not error', () => {
  const taskDirectory = mkdtempSync(join(tmpdir(), 'harness-reports-bad-'));
  try {
    expect(
      HarnessTaskReports.Class.readReportMeta(taskDirectory, []),
    ).toBeNull();
    writeFileSync(join(taskDirectory, 'report-meta.json'), 'not json {');
    expect(
      HarnessTaskReports.Class.readReportMeta(taskDirectory, [
        'report-meta.json',
      ]),
    ).toBeNull();
  } finally {
    rmSync(taskDirectory, { recursive: true, force: true });
  }
});

test('metrics aggregate verdicts, steering density, and domains', () => {
  const tasks = [
    { state: 'completed', meta: null, reportMeta: metaFixture() },
    {
      state: 'completed',
      meta: null,
      reportMeta: {
        ...metaFixture(),
        steering: { needed: false, cause: null },
        bycatchCount: 0,
        touchedDomains: ['tasks'],
      },
    },
    { state: 'completed', meta: null, reportMeta: null },
    { state: 'active', meta: null, reportMeta: null },
  ];
  const metrics = HarnessTaskReports.Class.aggregateMetrics(tasks);
  expect(metrics.tasksWithReportMeta).toBe(2);
  expect(metrics.completedTasks).toBe(3);
  expect(metrics.reportCoverage).toBeCloseTo(2 / 3);
  expect(metrics.steeringNeeded).toBe(1);
  expect(metrics.steeringDensity).toBeCloseTo(0.5);
  expect(metrics.bycatchTotal).toBe(1);
  expect(metrics.invariantVerdicts.discovered).toBe(2);
  expect(metrics.touchedDomainCounts['tasks']).toBe(2);
  expect(metrics.touchedDomainCounts['server']).toBe(1);
});
