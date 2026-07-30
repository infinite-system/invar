import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiagnosticLog, type DiagnosticLogSource } from './DiagnosticLog';

function logSource(
  lines: readonly string[],
  instance = 'own-instance',
): DiagnosticLogSource {
  const path = join(
    mkdtempSync(join(tmpdir(), 'invar-diagnostic-log-')),
    'tui.log',
  );
  writeFileSync(path, `${lines.join('\n')}\n`);
  return { diagnosticLogPath: path, diagnosticLogInstance: instance };
}

function stamped(instance: string, message: string): string {
  return `2026-07-30T00:00:00.000Z [info] [instance=${instance}] ${message}`;
}

test('an absent log reads as no lines instead of throwing', () => {
  const reading = DiagnosticLog.Class.read({
    diagnosticLogPath: join(tmpdir(), 'invar-diagnostic-log-absent', 'tui.log'),
    diagnosticLogInstance: 'own-instance',
  });
  expect(reading.ownLines).toEqual([]);
  expect(reading.foreignLineCount).toBe(0);
});

test("the reader returns the instance's own lines in write order", () => {
  const source = logSource([
    stamped('own-instance', 'bar editor-scrollbar-v: scrollSize=100'),
    stamped('own-instance', 'bar editor-scrollbar-v: scrollSize=200'),
  ]);
  expect(DiagnosticLog.Class.instanceLines(source).length).toBe(2);
  expect(
    DiagnosticLog.Class.latestLineContaining(source, 'bar editor-scrollbar-v:'),
  ).toContain('scrollSize=200');
});

// POSITIVE CONTROL. The planted line is the newest line in the file and matches the needle,
// so a reader with no guard returns it. The guard must return the instance's older own line.
test('a concurrent instance line is rejected even when it is the newest match', () => {
  const source = logSource([
    stamped('own-instance', 'bar editor-scrollbar-v: scrollSize=100'),
    stamped('other-instance', 'bar editor-scrollbar-v: scrollSize=999999'),
  ]);
  const reading = DiagnosticLog.Class.read(source);
  expect(reading.foreignLineCount).toBe(1);
  expect(reading.ownLines.length).toBe(1);
  expect(
    DiagnosticLog.Class.latestLineContaining(source, 'bar editor-scrollbar-v:'),
  ).toContain('scrollSize=100');
});

// POSITIVE CONTROL, second polarity. An unstamped line is what every pre-task-90 line looks
// like, and what a run left behind before the log path became per-run.
test('an unstamped leftover line is rejected', () => {
  const source = logSource([
    '2026-07-29T00:00:00.000Z [info] bar editor-scrollbar-v: scrollSize=777777',
    stamped('own-instance', 'bar editor-scrollbar-v: scrollSize=100'),
  ]);
  const reading = DiagnosticLog.Class.read(source);
  expect(reading.foreignLineCount).toBe(1);
  expect(
    DiagnosticLog.Class.latestLineContaining(source, 'bar editor-scrollbar-v:'),
  ).toContain('scrollSize=100');
});

test('a log holding only foreign lines answers null, never a foreign value', () => {
  const source = logSource([
    stamped('other-instance', 'bar editor-scrollbar-v: scrollSize=999999'),
    '2026-07-29T00:00:00.000Z [info] bar editor-scrollbar-v: scrollSize=777777',
  ]);
  expect(
    DiagnosticLog.Class.latestLineContaining(source, 'bar editor-scrollbar-v:'),
  ).toBeNull();
  expect(DiagnosticLog.Class.read(source).foreignLineCount).toBe(2);
});
