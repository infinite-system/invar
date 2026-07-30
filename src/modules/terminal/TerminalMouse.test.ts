import { expect, test } from 'bun:test';
import { TerminalMouse } from './TerminalMouse';

const noModifiers = { alt: false, shift: false, ctrl: false };

test('SGR mouse preserves button, modifiers, coordinates, and release polarity', () => {
  expect(
    TerminalMouse.Class.encode({
      kind: 'press',
      button: 0,
      column: 4,
      row: 1,
      modifiers: noModifiers,
      trackingMode: 'vt200',
      sgrEncoding: true,
    }),
  ).toBe('\x1b[<0;4;1M');
  expect(
    TerminalMouse.Class.encode({
      kind: 'release',
      button: 0,
      column: 4,
      row: 1,
      modifiers: { alt: true, shift: true, ctrl: true },
      trackingMode: 'vt200',
      sgrEncoding: true,
    }),
  ).toBe('\x1b[<28;4;1m');
});

test('motion follows only the drag and any-motion modes', () => {
  for (const trackingMode of ['x10', 'vt200'] as const) {
    expect(
      TerminalMouse.Class.encode({
        kind: 'motion',
        button: 0,
        column: 9,
        row: 3,
        modifiers: noModifiers,
        trackingMode,
        sgrEncoding: true,
      }),
    ).toBe('');
  }
  for (const trackingMode of ['drag', 'any'] as const) {
    expect(
      TerminalMouse.Class.encode({
        kind: 'motion',
        button: 0,
        column: 9,
        row: 3,
        modifiers: noModifiers,
        trackingMode,
        sgrEncoding: true,
      }),
    ).toBe('\x1b[<32;9;3M');
  }
});

test('legacy tracking uses the requested byte encoding and x10 sends presses only', () => {
  expect(
    TerminalMouse.Class.encode({
      kind: 'press',
      button: 2,
      column: 4,
      row: 1,
      modifiers: noModifiers,
      trackingMode: 'vt200',
      sgrEncoding: false,
    }),
  ).toBe('\x1b[M"$!');
  expect(
    TerminalMouse.Class.encode({
      kind: 'release',
      button: 0,
      column: 4,
      row: 1,
      modifiers: noModifiers,
      trackingMode: 'x10',
      sgrEncoding: false,
    }),
  ).toBe('');
});

test('wheel buttons use the same encoder as pointer events', () => {
  expect(
    TerminalMouse.Class.encode({
      kind: 'wheel',
      wheelDirection: 'up',
      column: 3,
      row: 2,
      modifiers: { alt: false, shift: true, ctrl: false },
      trackingMode: 'vt200',
      sgrEncoding: true,
    }),
  ).toBe('\x1b[<68;3;2M');
});
