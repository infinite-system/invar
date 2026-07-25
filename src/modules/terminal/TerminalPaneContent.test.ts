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

test('mouse-tracking and alternate-screen wheel input is SGR-forwarded without moving scrollback', async () => {
  for (const modeSequence of ['\x1b[?1000h', '\x1b[?1049h']) {
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

    expect(backend.writes.slice(writesBeforeWheel)).toEqual(['\x1b[<68;3;2M']);
    expect(instance.scrollTop).toBe(scrollTopBeforeWheel);
  }
});
