import { expect, test } from 'bun:test';
import type {
  BoundedListPopupAnchor,
  BoundedListPopupItem,
  BoundedListPopupOpenOptions,
} from './BoundedListPopup';
import { PanelAddPopup } from './PanelAddPopup';

test('the panel add adapter offers terminal and agent through the bounded popup', () => {
  let items: readonly BoundedListPopupItem[] = [];
  const capture: {
    select?: (item: BoundedListPopupItem) => void;
    options?: BoundedListPopupOpenOptions;
  } = {};
  const addedKinds: string[] = [];
  const adapter = new PanelAddPopup.Class({
    popup: {
      openAt(
        nextItems: readonly BoundedListPopupItem[],
        _anchor: BoundedListPopupAnchor,
        selectionHandler: (item: BoundedListPopupItem) => void,
        nextOptions?: BoundedListPopupOpenOptions,
      ) {
        items = nextItems;
        capture.select = selectionHandler;
        capture.options = nextOptions;
      },
    },
    overlayCoordinator: {
      openExclusiveOverlay(_name, openOverlay) {
        openOverlay();
      },
    },
    addableKinds() {
      return [
        { kind: 'terminal', label: 'Terminal' },
        { kind: 'agent', label: 'Agent' },
      ];
    },
    addContent(kind) {
      addedKinds.push(kind);
    },
  });

  adapter.show({ column: 12, row: 3 });
  expect(items.map((item) => item.label)).toEqual(['Terminal', 'Agent']);
  expect(capture.options?.searchVisible).toBe(false);
  capture.select?.(items[0]!);
  capture.select?.(items[1]!);
  expect(addedKinds).toEqual(['terminal', 'agent']);
});
