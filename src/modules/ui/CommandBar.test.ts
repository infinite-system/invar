import { describe, expect, test } from 'bun:test';
import { CommandBar } from './CommandBar';

describe('CommandBar', () => {
  test('centers navigation and folder controls while pinning layouts to the right edge', () => {
    const geometry = CommandBar.Class.layoutGeometry(80, 'wt-layout2', 'L');
    const back = geometry.segments.find(
      (segment) => segment.control === 'back',
    );
    const forward = geometry.segments.find(
      (segment) => segment.control === 'forward',
    );
    const folder = geometry.segments.find(
      (segment) => segment.control === 'folder',
    );
    const layouts = geometry.segments.find(
      (segment) => segment.control === 'layouts',
    );

    expect(back?.endColumn).toBe(forward?.startColumn);
    expect(forward?.endColumn).toBe(folder?.startColumn);
    expect(layouts?.label).toBe(' L ');
    expect(layouts?.startColumn).toBe(77);
    expect(layouts?.endColumn).toBe(80);
    expect((back?.startColumn ?? 0) + (folder?.endColumn ?? 0)).toBeCloseTo(
      80,
      0,
    );
  });

  test('keeps every hit segment inside compact widths without overlap', () => {
    const geometry = CommandBar.Class.layoutGeometry(
      18,
      'a-very-long-folder-name',
      'L',
    );

    expect(geometry.segments[0]?.startColumn).toBeGreaterThanOrEqual(0);
    expect(geometry.segments.at(-1)?.endColumn).toBe(18);
    for (
      let segmentIndex = 1;
      segmentIndex < geometry.segments.length;
      segmentIndex++
    ) {
      expect(
        geometry.segments[segmentIndex]?.startColumn,
      ).toBeGreaterThanOrEqual(
        geometry.segments[segmentIndex - 1]?.endColumn ?? 0,
      );
    }
  });
});
