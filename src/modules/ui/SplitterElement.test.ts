import { afterEach, describe, expect, test } from 'bun:test';
import {
  createTestRenderer,
  type MockMouse,
  type TestRenderer,
} from '@opentui/core/testing';
import { RGBA } from '@opentui/core';
import { ThemePalettes } from '../theme/ThemePalettes';
import { SplitterElement } from './SplitterElement';

const darkPalette = ThemePalettes.Class.dark;

let renderer: TestRenderer | null = null;
let mockMouse: MockMouse | null = null;
let renderOnce: (() => Promise<void>) | null = null;

afterEach(() => {
  renderer?.destroy();
  renderer = null;
  mockMouse = null;
  renderOnce = null;
});

async function createSplitter(
  orientation: 'vertical' | 'horizontal' = 'vertical',
): Promise<SplitterElement.Model> {
  const setup = await createTestRenderer({ width: 80, height: 24 });
  renderer = setup.renderer;
  mockMouse = setup.mockMouse;
  renderOnce = setup.renderOnce;
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
    onSizeChange: () => {},
  });
  renderer.root.add(splitter.renderable);
  return splitter;
}

describe('SplitterElement', () => {
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
    splitter.setGeometry({ left: 5, top: 10, length: 20 });
    await renderOnce?.();
    await mockMouse?.drag(5, 10, 5, 6);
    expect(splitter.size).toBe(24);
  });
});
