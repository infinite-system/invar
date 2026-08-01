import { expect, test } from 'bun:test';
import { Momentum } from '../system/Momentum';
import { MockBackend } from './MockBackend';
import { TerminalEmulator } from './TerminalEmulator';
import { TerminalInstance } from './TerminalInstance';
import { TerminalPaneContent } from './TerminalPaneContent';

test('terminal pane content publishes its plain construction seam', () => {
  expect(TerminalPaneContent.Class).toBe(TerminalPaneContent.$Class);
});

function makePane() {
  const backend = new MockBackend.Class();
  const emulator = new TerminalEmulator.Class(20, 5);
  const instance = new TerminalInstance.Class(backend, emulator);
  const pane = new TerminalPaneContent.Class(instance);
  pane.attachViewportScrollPort({
    momentumOptions: () => Momentum.Class.verticalOptions,
    requestRender: () => {},
  });
  return { backend, instance, pane };
}

test('primary-screen wheel input glides through shared momentum without writing the child', async () => {
  const { backend, instance, pane } = makePane();
  backend.feed(
    Array.from(
      { length: 30 },
      (_unused, lineIndex) => `line-${lineIndex}`,
    ).join('\r\n'),
  );
  await instance.flush();
  const bottom = instance.scrollTop;
  const childWritesBeforeWheel = backend.writes.length;

  expect(
    pane.onWheel(-3, {
      column: 4,
      row: 2,
      modifiers: { alt: false, shift: false, ctrl: false },
    }),
  ).toBe(true);
  for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
    pane.tickScroll(1 / 30);
  }

  expect(instance.scrollTop).toBeLessThan(bottom);
  expect(backend.writes).toHaveLength(childWritesBeforeWheel);
});

test('mouse-tracking and alternate-screen wheel input is protocol-forwarded without moving scrollback', async () => {
  for (const [modeSequence, expectedWheelBytes] of [
    ['\x1b[?1000h', '\x1b[Md##'],
    ['\x1b[?1049h', '\x1b[<68;3;3M'],
  ] as const) {
    const { backend, instance, pane } = makePane();
    backend.feed(
      `${Array.from(
        { length: 20 },
        (_unused, lineIndex) => `line-${lineIndex}`,
      ).join('\r\n')}${modeSequence}`,
    );
    await instance.flush();
    const scrollTopBeforeWheel = instance.scrollTop;
    const writesBeforeWheel = backend.writes.length;

    pane.onWheel(-3, {
      column: 4,
      row: 2,
      modifiers: { alt: false, shift: true, ctrl: false },
    });
    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      pane.tickScroll(1 / 30);
    }

    expect(backend.writes.slice(writesBeforeWheel)).toEqual([
      expectedWheelBytes,
    ]);
    expect(instance.scrollTop).toBe(scrollTopBeforeWheel);
  }
});

test('mouse-tracking gives child cells exact SGR clicks while pane gutters stay host-owned', async () => {
  const { backend, instance, pane } = makePane();
  backend.feed('\x1b[?1000h\x1b[?1006h');
  await instance.flush();
  const writesBeforePointer = backend.writes.length;
  const pointerContext = {
    screenColumn: 40,
    screenRow: 20,
    button: 0,
    modifiers: { alt: false, shift: false, ctrl: false },
  };

  pane.onPointerDown(5, 2, pointerContext);
  pane.onPointerUp(5, 2, pointerContext);

  expect(backend.writes.slice(writesBeforePointer)).toEqual([
    '\x1b[<0;4;3M',
    '\x1b[<0;4;3m',
  ]);
  const writesBeforeGutterClick = backend.writes.length;
  pane.onPointerDown(0, 0, pointerContext);
  pane.onPointerUp(0, 0, pointerContext);
  expect(backend.writes).toHaveLength(writesBeforeGutterClick);
});

test('mouse-tracking off keeps terminal selection local and writes no pointer bytes', () => {
  const { backend, instance, pane } = makePane();
  const writesBeforePointer = backend.writes.length;
  const renderRevisionBeforePointer = instance.renderRevision.value;
  const pointerContext = {
    screenColumn: 40,
    screenRow: 20,
    button: 0,
    modifiers: { alt: false, shift: false, ctrl: false },
  };

  pane.onPointerDown(5, 2, pointerContext);
  pane.onPointerDrag(8, 2, pointerContext);
  pane.onPointerUp(8, 2, pointerContext);

  expect(backend.writes).toHaveLength(writesBeforePointer);
  expect(instance.renderRevision.value).toBeGreaterThan(
    renderRevisionBeforePointer,
  );
  expect(pane.hasSelection()).toBe(true);
});
