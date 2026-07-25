import { expect, test } from 'bun:test';
import { SolidThumbScrollBar } from './SolidThumbScrollBar';

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
    (_unused, virtualThumbStart) =>
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
  expect(thumbAxes.at(-1)).toEqual({ start: trackLength - 2, length: 2 });
});
