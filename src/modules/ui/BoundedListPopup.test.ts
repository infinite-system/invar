import { describe, expect, test } from 'bun:test';
import { CommandScoring } from '../commands/CommandScoring';
import { EditorCoordinates } from '../editor/EditorCoordinates';
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
      navigateBackwardVisible: false,
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
      navigateBackwardVisible: false,
      scrollbarThickness: 1,
      firstVisible: 0,
    });

    expect(geometry.opensUpward).toBe(true);
    expect(geometry.boxTop).toBe(0);
    expect(geometry.bottomRow).toBeLessThan(23);
  });

  test('clamps the visible window and shares its rows with hit geometry', () => {
    const geometry = BoundedListPopup.$Class.layoutGeometry({
      screenWidth: 40,
      screenHeight: 12,
      anchor: { column: 35, row: 1 },
      desiredBoxWidth: 20,
      itemCount: 100,
      searchVisible: true,
      navigateBackwardVisible: false,
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
      navigateBackwardVisible: false,
      scrollbarThickness: 1,
      firstVisible: 99,
    });

    expect(geometry.boxLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.boxLeft + geometry.boxWidth).toBeLessThanOrEqual(8);
    expect(geometry.boxTop).toBeGreaterThanOrEqual(0);
    expect(geometry.bottomRow).toBeLessThan(3);
  });

  test('publishes one navigation control cell and reserves its chrome row', () => {
    const geometry = BoundedListPopup.$Class.layoutGeometry({
      screenWidth: 40,
      screenHeight: 12,
      anchor: { column: 4, row: 1 },
      desiredBoxWidth: 20,
      itemCount: 2,
      searchVisible: false,
      navigateBackwardVisible: true,
      scrollbarThickness: 1,
      firstVisible: 0,
    });

    expect(geometry.searchRow).toBeNull();
    expect(geometry.navigateBackwardControl).toEqual({
      column: geometry.boxLeft + 1,
      row: geometry.boxTop + 1,
    });
    expect(geometry.listTop).toBe(geometry.boxTop + 2);
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

    expect(BoundedListPopup.$Class.itemSetMaximumWidth(items)).toBe(
      1 + EditorCoordinates.Class.lineWidth('wide界'),
    );
  });
});
