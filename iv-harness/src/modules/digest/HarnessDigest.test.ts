import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessDigest } from './HarnessDigest.ts';

function plantedLedger(): { fixtureRoot: string; registry: string } {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-digest-'));
  mkdirSync(join(fixtureRoot, '.invar'), { recursive: true });
  const events = [
    {
      verb: 'action.gate',
      arguments: ['g1.log'],
      exitCode: 1,
      startedAt: 't1',
      durationMilliseconds: 300,
    },
    {
      verb: 'action.gate',
      arguments: ['g1.log'],
      exitCode: 1,
      startedAt: 't2',
      durationMilliseconds: 310,
    },
    {
      verb: 'action.gate',
      arguments: ['g1.log'],
      exitCode: 0,
      startedAt: 't3',
      durationMilliseconds: 290,
    },
    {
      verb: 'action.test',
      arguments: ['iv-harness'],
      exitCode: 0,
      startedAt: 't4',
      durationMilliseconds: 100,
    },
  ];
  writeFileSync(
    join(fixtureRoot, '.invar', 'harness-events.jsonl'),
    events.map((event) => JSON.stringify(event)).join('\n') + '\n',
  );
  const greenLog = join(fixtureRoot, 'g1.log');
  writeFileSync(
    greenLog,
    `GATE_TREE=${fixtureRoot}\nGATE_TREE_TIP=abcdef1234567890\nGATE_EXIT=0\n`,
  );
  const registry = join(fixtureRoot, 'registry');
  writeFileSync(registry, greenLog + '\n');
  return { fixtureRoot, registry };
}

test('a fight is consecutive failures of one subject, resolution marked', () => {
  const { fixtureRoot, registry } = plantedLedger();
  try {
    const digest = HarnessDigest.Class.build(fixtureRoot, registry);
    expect(digest.fights).toHaveLength(1);
    const fight = digest.fights[0]!;
    expect(fight.subject).toBe('action.gate g1.log');
    expect(fight.failingRuns).toBe(2);
    expect(fight.resolved).toBe(true);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('time accounting sums runs, failures, durations per verb', () => {
  const { fixtureRoot, registry } = plantedLedger();
  try {
    const digest = HarnessDigest.Class.build(fixtureRoot, registry);
    const gateSummary = digest.timeByVerb['action.gate']!;
    expect(gateSummary.runs).toBe(3);
    expect(gateSummary.failures).toBe(2);
    expect(gateSummary.totalDurationMilliseconds).toBe(900);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('gate rows carry verdict and stamps', () => {
  const { fixtureRoot, registry } = plantedLedger();
  try {
    const digest = HarnessDigest.Class.build(fixtureRoot, registry);
    expect(digest.gates[0]!.verdict).toBe('green');
    expect(digest.gates[0]!.stampedTip).toBe('abcdef123456');
    expect(digest.gates[0]!.stampedTree).toBe(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('an empty root digests to zeros, not errors (silent arm)', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'harness-digest-empty-'));
  try {
    const digest = HarnessDigest.Class.build(
      emptyRoot,
      join(emptyRoot, 'no-registry'),
    );
    expect(digest.eventCount).toBe(0);
    expect(digest.fights).toHaveLength(0);
    expect(digest.gates).toHaveLength(0);
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test('a single failure is not a fight (two or more, by definition)', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-digest-single-'));
  try {
    mkdirSync(join(fixtureRoot, '.invar'), { recursive: true });
    writeFileSync(
      join(fixtureRoot, '.invar', 'harness-events.jsonl'),
      JSON.stringify({
        verb: 'action.test',
        arguments: ['x'],
        exitCode: 1,
        startedAt: 't',
        durationMilliseconds: 5,
      }) + '\n',
    );
    const digest = HarnessDigest.Class.build(
      fixtureRoot,
      join(fixtureRoot, 'no-registry'),
    );
    expect(digest.fights).toHaveLength(0);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
