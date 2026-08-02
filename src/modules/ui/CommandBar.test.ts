import { describe, expect, test } from 'bun:test';
import { CommandBar } from './CommandBar';

describe('CommandBar', () => {
  test('starts with padded search and folder controls while pinning layouts right', () => {
    const geometry = CommandBar.Class.layoutGeometry(
      80,
      'wt-layout2',
      'L',
      '/',
    );
    const search = geometry.segments.find(
      (segment) => segment.control === 'search',
    );
    const folder = geometry.segments.find(
      (segment) => segment.control === 'folder',
    );
    const layouts = geometry.segments.find(
      (segment) => segment.control === 'layouts',
    );

    expect(search).toMatchObject({
      label: ' / ',
      startColumn: 0,
      endColumn: 3,
    });
    expect(search?.endColumn).toBe(folder?.startColumn);
    expect(folder?.label).toBe('wt-layout2');
    expect(layouts?.label).toBe(' L ');
    expect(layouts?.startColumn).toBe(77);
    expect(layouts?.endColumn).toBe(80);
  });

  test('keeps every hit segment inside compact widths without overlap', () => {
    const geometry = CommandBar.Class.layoutGeometry(
      18,
      'a-very-long-folder-name',
      'L',
      '/',
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
