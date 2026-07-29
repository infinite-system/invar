import { afterEach, expect, test } from 'bun:test';
import { RGBA } from '@opentui/core';
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

test('scrollbars stay above later default-layer content without overriding a stronger caller priority', async () => {
  const setup = await createTestRenderer({ width: 20, height: 10 });
  renderer = setup.renderer;
  const defaultPriorityBar = new SolidThumbScrollBar.Class(renderer, {
    id: 'default-priority',
    orientation: 'vertical',
  });
  const callerPriorityBar = new SolidThumbScrollBar.Class(renderer, {
    id: 'caller-priority',
    orientation: 'vertical',
    zIndex: 50,
  });

  expect(defaultPriorityBar.zIndex).toBe(1);
  expect(callerPriorityBar.zIndex).toBe(50);
});

test.each([
  ['dark', '#16161e', '#787c99'],
  ['light', '#d4d6e4', '#848cb5'],
] as const)(
  'both axes paint the same track and thumb pair in the %s palette',
  async (_paletteName, trackColor, thumbColor) => {
    const setup = await createTestRenderer({ width: 20, height: 4 });
    renderer = setup.renderer;
    const horizontalScrollBar = new SolidThumbScrollBar.Class(renderer, {
      id: 'horizontal-half-cell',
      orientation: 'horizontal',
      position: 'absolute',
      width: 12,
      height: 1,
      showArrows: false,
      trackOptions: {
        backgroundColor: trackColor,
        foregroundColor: thumbColor,
      },
    });
    const verticalScrollBar = new SolidThumbScrollBar.Class(renderer, {
      id: 'vertical-whole-cell',
      orientation: 'vertical',
      position: 'absolute',
      left: 15,
      width: 1,
      height: 4,
      showArrows: false,
      trackOptions: {
        backgroundColor: trackColor,
        foregroundColor: thumbColor,
      },
    });
    renderer.root.add(horizontalScrollBar);
    renderer.root.add(verticalScrollBar);
    for (const scrollBar of [horizontalScrollBar, verticalScrollBar]) {
      scrollBar.scrollSize = 100;
      scrollBar.viewportSize = 20;
      scrollBar.scrollPosition = 40;
    }

    await setup.renderOnce();

    const paintedRow = setup.captureCharFrame().split('\n')[0] ?? '';
    expect(paintedRow.slice(0, 12)).toBe('▄'.repeat(12));
    expect(paintedRow).not.toContain('█');
    expect(paintedRow).not.toContain('▀');
    const paintedForegrounds = new Set(
      (setup.captureSpans().lines[0]?.spans ?? [])
        .filter((span) => span.text.includes('▄'))
        .map((span) => span.fg.toString()),
    );
    expect(paintedForegrounds).toEqual(
      new Set([
        RGBA.fromHex(trackColor).toString(),
        RGBA.fromHex(thumbColor).toString(),
      ]),
    );
    const verticalBackgrounds = new Set(
      setup
        .captureSpans()
        .lines.flatMap((line) => line.spans)
        .filter((span) => span.text.includes(' ') && span.bg.a > 0)
        .map((span) => span.bg.toString()),
    );
    expect(verticalBackgrounds).toEqual(
      new Set([
        RGBA.fromHex(trackColor).toString(),
        RGBA.fromHex(thumbColor).toString(),
      ]),
    );
  },
);

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
