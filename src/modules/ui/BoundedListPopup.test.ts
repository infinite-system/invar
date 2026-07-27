import { describe, expect, test } from 'bun:test';
import { CommandScoring } from '../commands/CommandScoring';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { ThemeIcons } from '../theme/ThemeIcons';
import { BoundedListPopup } from './BoundedListPopup';

describe('BoundedListPopup', () => {
  test('opens downward near the top and reserves the terminal bottom row', () => {
    const geometry = BoundedListPopup.$Class.layoutGeometry({
      screenWidth: 120,
      screenHeight: 40,
      anchor: { column: 105, row: 2 },
      desiredBoxWidth: 30,
      itemCount: 100,
      searchVisible: true,
      iconColumns: 0,
      scrollbarThickness: 1,
      firstVisible: 0,
    });

    expect(geometry.opensUpward).toBe(false);
    expect(geometry.boxTop).toBe(3);
    expect(geometry.bottomRow).toBeLessThan(39);
    expect(geometry.boxLeft + geometry.boxWidth).toBeLessThanOrEqual(120);
    expect(geometry.verticalOverflow).toBe(true);
  });

  test('opens upward when the anchor has more room above', () => {
    const geometry = BoundedListPopup.$Class.layoutGeometry({
      screenWidth: 80,
      screenHeight: 30,
      anchor: { column: 4, row: 23 },
      desiredBoxWidth: 24,
      itemCount: 40,
      searchVisible: true,
      iconColumns: 0,
      scrollbarThickness: 1,
      firstVisible: 0,
    });

    expect(geometry.opensUpward).toBe(true);
    expect(geometry.boxTop).toBe(0);
    expect(geometry.bottomRow).toBeLessThan(23);
  });

  test('respects a caller-provided available bottom boundary', () => {
    const geometry = BoundedListPopup.$Class.layoutGeometry({
      screenWidth: 80,
      screenHeight: 40,
      anchor: { column: 4, row: 34 },
      desiredBoxWidth: 24,
      itemCount: 1,
      searchVisible: false,
      iconColumns: 0,
      scrollbarThickness: 1,
      firstVisible: 0,
      availableBottomExclusive: 34,
    });

    expect(geometry.opensUpward).toBe(true);
    expect(geometry.bottomRow).toBeLessThan(34);
  });

  test('clamps the visible window and shares its rows with hit geometry', () => {
    const geometry = BoundedListPopup.$Class.layoutGeometry({
      screenWidth: 40,
      screenHeight: 12,
      anchor: { column: 35, row: 1 },
      desiredBoxWidth: 20,
      itemCount: 100,
      searchVisible: true,
      iconColumns: 0,
      scrollbarThickness: 2,
      firstVisible: 99,
    });

    expect(geometry.firstVisible + geometry.visibleItemCount).toBe(100);
    expect(geometry.listTop + geometry.listRows).toBe(
      geometry.boxTop + geometry.boxHeight - 1,
    );
    expect(geometry.listColumns).toBe(geometry.boxWidth - 2 - 2);
  });

  test('never crosses the safe screen edge even when the screen is tiny', () => {
    const geometry = BoundedListPopup.$Class.layoutGeometry({
      screenWidth: 8,
      screenHeight: 4,
      anchor: { column: 7, row: 1 },
      desiredBoxWidth: 30,
      itemCount: 100,
      searchVisible: true,
      iconColumns: 0,
      scrollbarThickness: 1,
      firstVisible: 99,
    });

    expect(geometry.boxLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.boxLeft + geometry.boxWidth).toBeLessThanOrEqual(8);
    expect(geometry.boxTop).toBeGreaterThanOrEqual(0);
    expect(geometry.bottomRow).toBeLessThan(3);
  });

  test('publishes the icon column and reserves a chrome row only for search', () => {
    const geometry = BoundedListPopup.$Class.layoutGeometry({
      screenWidth: 40,
      screenHeight: 12,
      anchor: { column: 4, row: 1 },
      desiredBoxWidth: 20,
      itemCount: 2,
      searchVisible: false,
      iconColumns: 2,
      scrollbarThickness: 1,
      firstVisible: 0,
    });

    expect(geometry.searchRow).toBeNull();
    expect(geometry.listIconColumns).toBe(2);
    expect(geometry.listTop).toBe(geometry.boxTop + 1);
  });

  test('a pinned row leads the empty query and leaves once the user types', () => {
    const items = [
      { identifier: 'parent', label: '..', pinnedWhileQueryEmpty: true },
      { identifier: 'alpha', label: 'alpha.ts' },
      { identifier: 'beta', label: 'beta.ts' },
    ];

    expect(
      BoundedListPopup.$Class
        .filterItems(items, '')
        .map((match) => match.item.identifier),
    ).toEqual(['parent', 'alpha', 'beta']);
    const typedIdentifiers = BoundedListPopup.$Class
      .filterItems(items, 'a')
      .map((match) => match.item.identifier);
    expect(typedIdentifiers).not.toContain('parent');
    expect(typedIdentifiers.length).toBe(2);
    // `.` would fuzzy-match `..` if the pinned row were scored like a file.
    expect(
      BoundedListPopup.$Class
        .filterItems(items, '.')
        .map((match) => match.item.identifier),
    ).not.toContain('parent');
  });

  test('icons never become searchable text and never shift the label column', () => {
    const unicodeSymbolMarks = ThemeIcons.Class.symbolMarksFor('unicode');
    const items = [
      {
        identifier: 'parent',
        label: '..',
        icon: unicodeSymbolMarks.directoryClosed,
        pinnedWhileQueryEmpty: true,
      },
      {
        identifier: 'module',
        label: 'picker-module.ts',
        icon: unicodeSymbolMarks.typescript,
      },
      {
        identifier: 'image',
        label: 'picture.png',
        icon: unicodeSymbolMarks.image,
      },
    ];

    expect(
      BoundedListPopup.$Class.filterItems(items, unicodeSymbolMarks.typescript),
    ).toEqual([]);
    const iconColumns = BoundedListPopup.$Class.itemSetIconColumns(items);
    expect(iconColumns).toBe(1);
    const labelOffsets = items.map(
      (item) =>
        EditorCoordinates.Class.lineWidth(
          BoundedListPopup.$Class.itemRowText(item, iconColumns),
        ) - EditorCoordinates.Class.lineWidth(item.label),
    );
    expect(new Set(labelOffsets).size).toBe(1);
    expect(BoundedListPopup.$Class.itemSetMaximumWidth(items)).toBe(
      1 +
        iconColumns +
        1 +
        EditorCoordinates.Class.lineWidth('picker-module.ts'),
    );
  });

  test('filters and ranks through the shared quick-open scorer', () => {
    const matches = BoundedListPopup.$Class.filterItems(
      [
        { identifier: 'wide', label: 'feature/wide-change' },
        { identifier: 'tight', label: 'feat' },
        { identifier: 'miss', label: 'main' },
      ],
      'feat',
    );

    expect(matches.map((match) => match.item.identifier)).toEqual([
      'wide',
      'tight',
    ]);
    expect(matches.map((match) => match.score)).toEqual([
      CommandScoring.Class.fuzzyScore('feat', 'feature/wide-change'),
      CommandScoring.Class.fuzzyScore('feat', 'feat'),
    ]);
  });

  test('wraps navigation across enabled items in both directions', () => {
    const matches = BoundedListPopup.$Class.filterItems(
      [
        { identifier: 'first', label: 'first' },
        { identifier: 'disabled', label: 'disabled', enabled: false },
        { identifier: 'last', label: 'last' },
      ],
      '',
    );
    const navigation = BoundedListPopup.$Class.enabledNavigation(matches);

    expect(
      BoundedListPopup.$Class.nextEnabledFilteredIndex(navigation, 2, 1),
    ).toBe(0);
    expect(
      BoundedListPopup.$Class.nextEnabledFilteredIndex(navigation, 0, -1),
    ).toBe(2);
    expect(
      BoundedListPopup.$Class.nextEnabledFilteredIndex(navigation, -1, -1),
    ).toBe(2);
  });

  test('wraps within the active filtered set', () => {
    const matches = BoundedListPopup.$Class.filterItems(
      [
        { identifier: 'alpha', label: 'alpha' },
        { identifier: 'beta', label: 'beta' },
        { identifier: 'alphabet', label: 'alphabet' },
      ],
      'alpha',
    );

    expect(matches.map((match) => match.item.identifier)).toEqual([
      'alpha',
      'alphabet',
    ]);
    const navigation = BoundedListPopup.$Class.enabledNavigation(matches);
    expect(
      BoundedListPopup.$Class.nextEnabledFilteredIndex(navigation, 0, -1),
    ).toBe(1);
    expect(
      BoundedListPopup.$Class.nextEnabledFilteredIndex(navigation, 1, 1),
    ).toBe(0);
  });

  test('accelerated navigation skips disabled rows in constant time', () => {
    const matches = BoundedListPopup.$Class.filterItems(
      [
        { identifier: 'first', label: 'first' },
        { identifier: 'disabled-1', label: 'disabled 1', enabled: false },
        { identifier: 'second', label: 'second' },
        { identifier: 'disabled-2', label: 'disabled 2', enabled: false },
        { identifier: 'third', label: 'third' },
      ],
      '',
    );
    const navigation = BoundedListPopup.$Class.enabledNavigation(matches);

    expect(
      BoundedListPopup.$Class.nextEnabledFilteredIndex(navigation, 0, 1, 2),
    ).toBe(4);
    expect(
      BoundedListPopup.$Class.nextEnabledFilteredIndex(navigation, 4, -1, 2),
    ).toBe(0);
  });

  test('item-set width preserves exact display-column layout', () => {
    const items = [
      { identifier: 'narrow', label: 'narrow' },
      { identifier: 'wide', label: 'wide界' },
    ];

    const maximumItemWidth = BoundedListPopup.$Class.itemSetMaximumWidth(items);
    expect(maximumItemWidth).toBe(
      1 + EditorCoordinates.Class.lineWidth('wide界'),
    );
    expect(
      BoundedListPopup.$Class.desiredBoxWidth(maximumItemWidth, '', 1),
    ).toBe(maximumItemWidth + 2);
  });
});
