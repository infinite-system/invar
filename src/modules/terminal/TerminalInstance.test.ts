// Deterministic terminal-core coverage using the MockBackend (no real shell): scripted ANSI in,
// asserted cells out — including a color case and a cursor-move case — plus the byte round-trip and
// resize propagation through the backend seam.
import { test, expect } from 'bun:test';
import { MockBackend } from './MockBackend';
import { TerminalEmulator } from './TerminalEmulator';
import { TerminalInstance } from './TerminalInstance';

function makeInstance(columns = 20, rows = 5) {
  const backend = new MockBackend.Class();
  const emulator = new TerminalEmulator.Class(columns, rows);
  const instance = new TerminalInstance.Class(backend, emulator);
  return { backend, instance };
}

function rowText(instance: TerminalInstance.Instance, row: number): string {
  let text = '';
  for (let column = 0; column < instance.columns; column++) {
    text += instance.cell(row, column)?.characters ?? ' ';
  }
  return text.replace(/\s+$/, '');
}

async function awaitCondition(
  description: string,
  condition: () => boolean,
): Promise<void> {
  const deadline = performance.now() + 500;
  while (performance.now() < deadline) {
    if (condition()) return;
    await Bun.sleep(1);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

test('scripted plain output renders into the cell grid', async () => {
  const { backend, instance } = makeInstance();
  backend.feed('hello');
  await instance.flush();
  expect(rowText(instance, 0)).toBe('hello');
});

test('a parsed write pulse bumps renderRevision (the repaint signal)', async () => {
  const { backend, instance } = makeInstance();
  const before = instance.renderRevision.value;
  backend.feed('x');
  await instance.flush();
  expect(instance.renderRevision.value).toBeGreaterThan(before);
});

test('DEC 2026 holds interior writes and commits the final grid once', async () => {
  const { backend, instance } = makeInstance();
  const before = instance.renderRevision.value;

  backend.feed('\x1b[?2026h');
  await instance.flush();
  backend.feed('\x1b[2J\x1b[Hpartial');
  await instance.flush();
  expect(rowText(instance, 0)).toBe('partial');
  expect(instance.renderRevision.value).toBe(before);

  backend.feed('\x1b[Hcomplete');
  await instance.flush();
  expect(instance.renderRevision.value).toBe(before);
  backend.feed('\x1b[?2026l');
  await instance.flush();

  expect(rowText(instance, 0)).toBe('complete');
  expect(instance.renderRevision.value).toBe(before + 1);
});

test('ordinary child writes keep their existing repaint cadence', async () => {
  const { backend, instance } = makeInstance();
  const before = instance.renderRevision.value;
  backend.feed('first');
  await instance.flush();
  const afterFirstWrite = instance.renderRevision.value;
  backend.feed(' second');
  await instance.flush();
  expect(afterFirstWrite).toBeGreaterThan(before);
  expect(instance.renderRevision.value).toBeGreaterThan(afterFirstWrite);
});

test('an unclosed DEC 2026 update releases after the bounded timeout', async () => {
  const backend = new MockBackend.Class();
  const emulator = new TerminalEmulator.Class(20, 5);
  const instance = new TerminalInstance.Class(backend, emulator, {
    synchronizedOutputTimeoutMilliseconds: 10,
  });
  const before = instance.renderRevision.value;

  backend.feed('\x1b[?2026h\x1b[2J\x1b[Hheld');
  await instance.flush();
  expect(instance.renderRevision.value).toBe(before);
  await awaitCondition(
    'the synchronized output deadlock guard to release the held grid',
    () => instance.renderRevision.value > before,
  );
  const afterTimeout = instance.renderRevision.value;

  backend.feed(' visible');
  await instance.flush();
  expect(instance.renderRevision.value).toBeGreaterThan(afterTimeout);
  expect(rowText(instance, 0)).toContain('held visible');
  instance.dispose();
});

test('SGR color renders as an RGB/palette foreground on the exact cell', async () => {
  const { backend, instance } = makeInstance();
  // ESC[31m = red foreground; write 'R' then reset.
  backend.feed('\x1b[31mR\x1b[0m');
  await instance.flush();
  const cell = instance.cell(0, 0);
  expect(cell?.characters).toBe('R');
  expect(cell?.isForegroundDefault).toBe(false);
  expect(cell?.foreground).toBe(1); // palette index 1 = red
});

test('cursor-position sequence lands text at the addressed row/column', async () => {
  const { backend, instance } = makeInstance();
  // ESC[2;3H = move to row 2, col 3 (1-based); then 'Z'.
  backend.feed('\x1b[2;3HZ');
  await instance.flush();
  expect(instance.cell(1, 2)?.characters).toBe('Z');
  expect(instance.cursorRow).toBe(1);
  expect(instance.cursorColumn).toBe(3);
});

test('viewport reads follow the scrollback base — latest lines show, not the top of scrollback', async () => {
  // Regression: after content scrolls into scrollback (baseY > 0 — e.g. a full-screen app exits),
  // the cell pull must read the VISIBLE viewport, not absolute buffer row 0. Feed 10 lines into a
  // 5-row grid: the viewport must show L5..L9, and typing (the last line) must be visible.
  const { backend, instance } = makeInstance(20, 5);
  backend.feed('L0\r\nL1\r\nL2\r\nL3\r\nL4\r\nL5\r\nL6\r\nL7\r\nL8\r\nL9');
  await instance.flush();
  expect(rowText(instance, 4)).toBe('L9'); // bottom visible line = the live/typing line
  expect(rowText(instance, 0)).toBe('L5'); // top visible line, NOT 'L0' (top of scrollback)
});

test('fresh child output returns a manually scrolled viewport to the live bottom', async () => {
  const { backend, instance } = makeInstance(20, 5);
  backend.feed(
    Array.from(
      { length: 20 },
      (_unusedValue, lineIndex) => `L${lineIndex}`,
    ).join('\r\n'),
  );
  await instance.flush();
  instance.scrollToLine(2);
  expect(instance.isScrolledToBottom).toBe(false);
  expect(rowText(instance, 0)).toBe('L2');

  backend.feed('\r\nLATEST');
  await instance.flush();

  expect(instance.isScrolledToBottom).toBe(true);
  expect(rowText(instance, 4)).toBe('LATEST');
});

test('readTerminalInput observes the prompt line and bounded recent emulator text', async () => {
  const { backend, instance } = makeInstance(30, 5);
  backend.feed('old output\r\nnew output\r\n$ printf brokn');
  await instance.flush();
  const snapshot = instance.readTerminalInput();
  expect(snapshot.currentInputLine).toBe('printf brokn');
  expect(snapshot.recentOutputLines.join('\n')).toContain('old output');
  expect(snapshot.recentOutputLines.join('\n')).toContain('$ printf brokn');
  expect(snapshot.recentOutputLines.length).toBeLessThanOrEqual(40);
});

test('scrollback reads reach beyond the default and redact every agent read path', async () => {
  const { backend, instance } = makeInstance(50, 5);
  const ordinaryLines = Array.from(
    { length: 70 },
    (_unusedValue, lineIndex) => `line-${lineIndex + 1}`,
  );
  backend.feed(
    [
      ...ordinaryLines,
      'API_TOKEN=fixture-token',
      'NORMAL=value',
      'Password: hunter2',
      '$ CLIENT_SECRET=typed-secret',
    ].join('\r\n'),
  );
  await instance.flush();

  const counted = instance.readTerminalScrollback({ lineCount: 55 });
  expect(counted.lines).toHaveLength(55);
  expect(counted.endLine - counted.startLine + 1).toBe(55);
  const ranged = instance.readTerminalScrollback({
    range: { startLine: counted.startLine, endLine: counted.startLine + 4 },
  });
  expect(ranged.lines).toHaveLength(5);

  const serializedScrollback = JSON.stringify(counted);
  expect(serializedScrollback).not.toContain('fixture-token');
  expect(serializedScrollback).not.toContain('hunter2');
  expect(serializedScrollback).toContain('API_TOKEN=[REDACTED]');
  expect(serializedScrollback).toContain('NORMAL=value');
  const input = instance.readTerminalInput();
  expect(input.currentInputLine).toBe('CLIENT_SECRET=[REDACTED]');
  expect(JSON.stringify(input)).not.toContain('typed-secret');
});

test('emulator replies (device reports) return to the child through the backend seam', async () => {
  const { backend, instance } = makeInstance();
  // ESC[6n = Device Status Report (cursor position) → the emulator replies with ESC[row;colR.
  backend.feed('\x1b[6n');
  await instance.flush();
  expect(backend.writes.some((written) => written.includes('\x1b['))).toBe(
    true,
  );
});

test('sendInput crosses only the backend seam', () => {
  const { backend, instance } = makeInstance();
  instance.sendInput('ls\r');
  expect(backend.writes).toContain('ls\r');
});

test('resize drives both the emulator grid and the backend', () => {
  const { backend, instance } = makeInstance(20, 5);
  instance.resize(40, 10);
  expect(instance.columns).toBe(40);
  expect(instance.rows).toBe(10);
  expect(backend.resizes.at(-1)).toEqual({ columns: 40, rows: 10 });
});

test('exit stops input and flags the instance', () => {
  const { backend, instance } = makeInstance();
  backend.exit(0);
  expect(instance.exited.value).toBe(true);
  instance.sendInput('ignored');
  expect(backend.writes).not.toContain('ignored');
});
