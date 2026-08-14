import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessGateRuns } from './HarnessGateRuns.ts';

test('the registry classifies green, red, running, and missing logs', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-gate-runs-'));
  try {
    const greenLog = join(fixtureRoot, 'green.log');
    const redLog = join(fixtureRoot, 'red.log');
    const runningLog = join(fixtureRoot, 'running.log');
    writeFileSync(greenLog, 'steps\nGATE_EXIT=0\n');
    writeFileSync(redLog, 'steps\nGATE_EXIT=1\n');
    writeFileSync(runningLog, 'steps so far, no sentinel yet\n');
    const registry = join(fixtureRoot, 'registry');
    writeFileSync(
      registry,
      [greenLog, redLog, runningLog, join(fixtureRoot, 'gone.log'), ''].join(
        '\n',
      ),
    );
    const runs = HarnessGateRuns.Class.readRegistry(registry);
    expect(runs.map((gateRun) => gateRun.verdict)).toEqual([
      'green',
      'red',
      'running',
      'missing',
    ]);
    expect(runs[0]!.exit).toBe(0);
    expect(runs[1]!.exit).toBe(1);
    expect(runs[2]!.exit).toBeNull();
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('the LAST sentinel wins when a log contains several', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-gate-multi-'));
  try {
    const rerunLog = join(fixtureRoot, 'rerun.log');
    writeFileSync(rerunLog, 'GATE_EXIT=1\nrerun follows\nGATE_EXIT=0\n');
    expect(HarnessGateRuns.Class.readGateLog(rerunLog).verdict).toBe('green');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('an absent registry reads as empty, not as an error', () => {
  expect(
    HarnessGateRuns.Class.readRegistry('/nonexistent/registry-path'),
  ).toHaveLength(0);
});
