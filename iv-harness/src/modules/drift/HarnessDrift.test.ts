import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessDrift } from './HarnessDrift.ts';

test('a stub drift script is run and its DRIFT section parsed', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-drift-'));
  try {
    const scriptDirectory = join(fixtureRoot, 'scripts', 'tasks');
    mkdirSync(scriptDirectory, { recursive: true });
    // The wrap runs the REPO'S script — the stub stands in for it; the
    // parse contract is the output format, not the implementation.
    writeFileSync(
      join(scriptDirectory, 'tasks-status.ts'),
      `const lines = [
  'TASKS',
  '  active 2',
  '',
  'DRIFT (2 finding(s)) — reported, never moved automatically:',
  '  STATE-MISMATCH (1)',
  '    #990001 990001-planted-drift-fixture — file says "ACTIVE" but it sits in completed/',
  '  THIN (1)',
  '    #990002 990002-thin-fixture — task file is 3 lines — filed without its reasoning',
];
console.log(lines.join('\\n'));
`,
    );
    const drift = HarnessDrift.Class.read(fixtureRoot);
    expect(drift.available).toBe(true);
    expect(drift.findings).toHaveLength(2);
    expect(drift.findings[0]!.signal).toBe('STATE-MISMATCH');
    expect(drift.findings[0]!.taskNumber).toBe(990001);
    expect(drift.findings[1]!.signal).toBe('THIN');
    expect(drift.totalsBySignal['STATE-MISMATCH']).toBe(1);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a repo without the script has no drift capability, not an error', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'harness-drift-absent-'));
  try {
    const drift = HarnessDrift.Class.read(fixtureRoot);
    expect(drift.available).toBe(false);
    expect(drift.findings).toHaveLength(0);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('output without a DRIFT section parses as clean', () => {
  const parsed = HarnessDrift.Class.parseDriftSection('TASKS\n  active 2\n');
  expect(parsed.available).toBe(true);
  expect(parsed.findings).toHaveLength(0);
});
