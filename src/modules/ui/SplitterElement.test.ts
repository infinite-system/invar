import { afterEach, describe, expect, test } from 'bun:test';
import {
  createTestRenderer,
  type MockMouse,
  type TestRenderer,
} from '@opentui/core/testing';
import { RGBA } from '@opentui/core';
import { ThemePalettes } from '../theme/ThemePalettes';
import {
  SplitterElement,
  type SplitterElementOptions,
} from './SplitterElement';

const darkPalette = ThemePalettes.Class.DARK;

let renderer: TestRenderer | null = null;

let mockMouse: MockMouse | null = null;

let renderOnce: (() => Promise<void>) | null = null;

let captureCharFrame: (() => string) | null = null;

afterEach(() => {
  renderer?.destroy();
  renderer = null;
  mockMouse = null;
  renderOnce = null;
  captureCharFrame = null;
});

async function createSplitter(
  orientation: 'vertical' | 'horizontal' = 'vertical',
  leadingPaintPadCells = 0,
  overrides: Partial<SplitterElementOptions> = {},
): Promise<SplitterElement.Model> {
  const setup = await createTestRenderer({ width: 80, height: 24 });
  renderer = setup.renderer;
  mockMouse = setup.mockMouse;
  renderOnce = setup.renderOnce;
  captureCharFrame = setup.captureCharFrame;
  const splitter = new SplitterElement.Class({
    renderer,
    identifier: 'splitter-under-test',
    orientation,
    reportUnit: 'cells',
    initialSize: 20,
    minimumSize: 4,
    maximumSize: 40,
    pointerDirection: orientation === 'horizontal' ? -1 : 1,
    currentSize: () => 20,
    leadingPaintPadCells,
    onSizeChange: () => {},
    ...overrides,
  });
  renderer.root.add(splitter.renderable);
  return splitter;
}

describe('SplitterElement', () => {
  test('the host size setter clamps through the model', async () => {
    const splitter = await createSplitter();
    splitter.size = 99;
    expect(splitter.size).toBe(40);
  });

  test('the pointer-down seed clamps through the model', async () => {
    const splitter = await createSplitter('vertical', 0, {
      currentSize: () => 99,
    });
    splitter.setGeometry({ left: 17, top: 3, length: 14 });
    await renderOnce?.();
    await mockMouse?.pressDown(17, 3);
    expect(splitter.size).toBe(40);
    await mockMouse?.release(17, 3);
  });

  test('one geometry defines both the painted element and its hit zone', async () => {
    const splitter = await createSplitter('vertical');
    splitter.setGeometry({ left: 17, top: 3, length: 14 });
    await renderOnce?.();

    expect(splitter.renderable.left).toBe(17);
    expect(splitter.renderable.top).toBe(3);
    expect(splitter.renderable.width).toBe(1);
    expect(splitter.renderable.height).toBe(14);
  });

  test('rests on the shared border role and highlights on hover', async () => {
    const splitter = await createSplitter();
    splitter.setGeometry({ left: 17, top: 3, length: 14 });
    await renderOnce?.();
    splitter.updateAppearance(darkPalette);
    expect(splitter.renderable.backgroundColor).toEqual(
      RGBA.fromHex(darkPalette.border),
    );

    await mockMouse?.moveTo(17, 3);
    splitter.updateAppearance(darkPalette);
    expect(splitter.renderable.backgroundColor).toEqual(
      RGBA.fromHex(darkPalette.accent),
    );

    await mockMouse?.moveTo(30, 3);
    splitter.updateAppearance(darkPalette);
    expect(splitter.renderable.backgroundColor).toEqual(
      RGBA.fromHex(darkPalette.border),
    );
  });

  test('stays highlighted after the pointer leaves during a drag', async () => {
    const splitter = await createSplitter();
    splitter.setGeometry({ left: 17, top: 3, length: 14 });
    await renderOnce?.();
    await mockMouse?.pressDown(17, 3);
    await mockMouse?.emitMouseEvent('drag', 30, 3);
    splitter.updateAppearance(darkPalette);
    expect(splitter.active).toBe(true);
    expect(splitter.renderable.backgroundColor).toEqual(
      RGBA.fromHex(darkPalette.accent),
    );

    await mockMouse?.release(30, 3);
    splitter.updateAppearance(darkPalette);
    expect(splitter.active).toBe(false);
    expect(splitter.renderable.backgroundColor).toEqual(
      RGBA.fromHex(darkPalette.border),
    );
  });

  test('projects horizontal pointer movement through the configured direction', async () => {
    const splitter = await createSplitter('horizontal');
    splitter.setGeometry({ left: 5, top: 10, length: 1 });
    await renderOnce?.();
    await mockMouse?.drag(5, 10, 5, 6);
    expect(splitter.size).toBe(24);
  });

  test('horizontal splitters paint the vertically centered separator mark', async () => {
    const splitter = await createSplitter('horizontal');
    splitter.setGeometry({ left: 5, top: 10, length: 20 });
    splitter.updateAppearance(darkPalette);
    await renderOnce?.();

    const row = captureCharFrame?.().split('\n')[10] ?? '';
    expect(row.slice(5, 25)).toBe('━'.repeat(20));
  });

  test('vertical splitters paint the slim axis sibling of the horizontal mark', async () => {
    const splitter = await createSplitter('vertical');
    splitter.setGeometry({ left: 7, top: 4, length: 6 });
    splitter.updateAppearance(darkPalette);
    await renderOnce?.();

    const rows = captureCharFrame?.().split('\n') ?? [];
    const paintedColumn = rows
      .slice(4, 10)
      .map((row) => row.slice(7, 8))
      .join('');
    expect(paintedColumn).toBe('┃'.repeat(6));
  });

  test('a leading paint pad blanks the first cells and never moves the hit rectangle', async () => {
    const splitter = await createSplitter('horizontal', 1);
    splitter.setGeometry({ left: 5, top: 10, length: 20 });
    splitter.updateAppearance(darkPalette);
    await renderOnce?.();

    const row = captureCharFrame?.().split('\n')[10] ?? '';
    expect(row.slice(5, 6)).toBe(' ');
    expect(row.slice(6, 25)).toBe('━'.repeat(19));
    expect(splitter.renderable.left).toBe(5);
    expect(splitter.renderable.width).toBe(20);
  });

  test('the pad cell still grabs: a drag begun on it resizes', async () => {
    const splitter = await createSplitter('horizontal', 1);
    splitter.setGeometry({ left: 5, top: 10, length: 20 });
    await renderOnce?.();
    await mockMouse?.drag(5, 10, 5, 6);
    expect(splitter.size).toBe(24);
  });
});
