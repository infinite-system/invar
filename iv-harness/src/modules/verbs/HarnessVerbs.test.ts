import { test, expect } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessVerbs } from './HarnessVerbs.ts';

function plantedRoot(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-verbs-'));
  const fleetDirectory = join(fixtureRoot, 'scripts', 'fleet');
  mkdirSync(fleetDirectory, { recursive: true });
  // Stub stands in for probe.sh: the contract is invocation + exit +
  // output lines, not the probe logic (which stays in the real script).
  writeFileSync(
    join(fleetDirectory, 'probe.sh'),
    '#!/usr/bin/env bash\nif [ "$1" = "self-test" ]; then echo "probe: PASS both arms"; exit 0; fi\necho "probe: unknown"; exit 3\n',
  );
  return fixtureRoot;
}

test('a registered verb runs its script and returns structure', () => {
  const fixtureRoot = plantedRoot();
  try {
    const result = HarnessVerbs.Class.run(fixtureRoot, 'probe.selfTest', []);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain('PASS both arms');
    expect(result.durationMilliseconds).toBeGreaterThanOrEqual(0);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a failing script reads as ok false with its exit code, not a throw', () => {
  const fixtureRoot = plantedRoot();
  try {
    const result = HarnessVerbs.Class.run(fixtureRoot, 'probe.builders', []);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('every run appends one typed event to the ledger', () => {
  const fixtureRoot = plantedRoot();
  try {
    HarnessVerbs.Class.run(fixtureRoot, 'probe.selfTest', []);
    HarnessVerbs.Class.run(fixtureRoot, 'probe.builders', []);
    const events = HarnessVerbs.Class.readEvents(fixtureRoot);
    expect(events).toHaveLength(2);
    expect(events[0]!.verb).toBe('probe.selfTest');
    expect(events[1]!.exitCode).toBe(3);
    const rawLedger = readFileSync(
      join(fixtureRoot, '.invar', 'harness-events.jsonl'),
      'utf8',
    );
    expect(rawLedger.trim().split('\n')).toHaveLength(2);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('an unknown verb fails loudly listing the registered verbs', () => {
  const fixtureRoot = plantedRoot();
  try {
    expect(() => HarnessVerbs.Class.run(fixtureRoot, 'probe.nope', [])).toThrow(
      /Registered verbs: .*probe\.selfTest/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a verb whose script is absent is unavailable, loudly on run', () => {
  const fixtureRoot = plantedRoot();
  try {
    const listing = HarnessVerbs.Class.availableVerbs(fixtureRoot);
    const dispatchDry = listing.find((verb) => verb.name === 'dispatch.dry')!;
    expect(dispatchDry.available).toBe(false);
    expect(() =>
      HarnessVerbs.Class.run(fixtureRoot, 'dispatch.dry', []),
    ).toThrow(/not available here/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('an absent ledger reads as empty and a malformed line is skipped', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-verbs-ledger-'));
  try {
    expect(HarnessVerbs.Class.readEvents(fixtureRoot)).toHaveLength(0);
    mkdirSync(join(fixtureRoot, '.invar'), { recursive: true });
    writeFileSync(
      join(fixtureRoot, '.invar', 'harness-events.jsonl'),
      '{"verb":"probe.gate","arguments":[],"exitCode":0,"startedAt":"t","durationMilliseconds":5}\nnot json\n',
    );
    const events = HarnessVerbs.Class.readEvents(fixtureRoot);
    expect(events).toHaveLength(1);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
