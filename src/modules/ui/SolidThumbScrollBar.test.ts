import { afterEach, expect, test } from 'bun:test';
import { createTestRenderer, type TestRenderer } from '@opentui/core/testing';
import { SolidThumbScrollBar } from './SolidThumbScrollBar';

let renderer: TestRenderer | null = null;

afterEach(() => {
  renderer?.destroy();
  renderer = null;
});

class TestSolidThumbScrollBar extends SolidThumbScrollBar.$Class {
  static thumbAxis(
    virtualThumbStart: number,
    virtualThumbSize: number,
    trackLength: number,
  ): { start: number; length: number } {
    return this.stableThumbAxis(
      virtualThumbStart,
      virtualThumbSize,
      trackLength,
    );
  }
}

test('solid-thumb scrollbars remain constructible through their class seam', () => {
  expect(SolidThumbScrollBar.Class).toBeDefined();
});

test('whole-cell thumb length is independent of half-cell start parity', () => {
  const trackLength = 21;
  const virtualThumbSize = 4;
  const maximumVirtualThumbStart = trackLength * 2 - virtualThumbSize;
  const thumbAxes = Array.from(
    { length: maximumVirtualThumbStart + 1 },
    (_unusedValue, virtualThumbStart) =>
      TestSolidThumbScrollBar.thumbAxis(
        virtualThumbStart,
        virtualThumbSize,
        trackLength,
      ),
  );

  expect(new Set(thumbAxes.map((thumbAxis) => thumbAxis.length))).toEqual(
    new Set([2]),
  );
  expect(thumbAxes[0]).toEqual({ start: 0, length: 2 });
  expect(thumbAxes.at(-1)).toEqual({
    start: trackLength - 2,
    length: 2,
  });
});

test('whole-cell thumb preserves the shared two-cell minimum', () => {
  expect(TestSolidThumbScrollBar.thumbAxis(39, 1, 21)).toEqual({
    start: 19,
    length: 2,
  });
});

test('overview marks do not change thumb geometry', async () => {
  const setup = await createTestRenderer({ width: 20, height: 30 });
  renderer = setup.renderer;
  const scrollBar = new SolidThumbScrollBar.Class(renderer, {
    id: 'overview-thumb-stability',
    orientation: 'vertical',
    position: 'absolute',
    width: 1,
    height: 20,
    showArrows: false,
  });
  renderer.root.add(scrollBar);
  scrollBar.scrollSize = 1_000;
  scrollBar.viewportSize = 100;
  scrollBar.scrollPosition = 450;
  await setup.renderOnce();
  const thumbSurface = scrollBar.slider as unknown as {
    getThumbRect(): {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  const unmarkedThumbRectangle = thumbSurface.getThumbRect();

  scrollBar.setOverviewMarks([
    { trackOffset: 0, color: '#db4b4b', glyph: '•' },
    { trackOffset: 10, color: '#dca561', glyph: '•' },
    { trackOffset: 19, color: '#41a6b5', glyph: '•' },
  ]);

  expect(thumbSurface.getThumbRect()).toEqual(unmarkedThumbRectangle);
  expect(scrollBar.width).toBe(1);
  expect(scrollBar.height).toBe(20);
  await setup.renderOnce();
  expect(
    [...setup.captureCharFrame()].filter((character) => character === '•'),
  ).toHaveLength(3);
});
