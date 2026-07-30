import { describe, expect, test } from 'bun:test';
import {
  OverlayCoordinator,
  type ExclusiveOverlayName,
} from './OverlayCoordinator';

const overlayNames: readonly ExclusiveOverlayName[] = [
  'findBar',
  'goToLine',
  'quickOpen',
  'commandPalette',
  'settingsPanel',
  'contextMenu',
  'boundedListPopup',
  'completionPopup',
  'shortcutHelp',
  'quitConfirmation',
];

describe('OverlayCoordinator', () => {
  test('opening each overlay closes every sibling before the opener runs', () => {
    const openStates = new Map<ExclusiveOverlayName, boolean>();
    const closeOverlay =
      (overlayName: ExclusiveOverlayName): (() => void) =>
      () => {
        openStates.set(overlayName, false);
      };
    const closeActions: Record<ExclusiveOverlayName, () => void> = {
      findBar: closeOverlay('findBar'),
      goToLine: closeOverlay('goToLine'),
      quickOpen: closeOverlay('quickOpen'),
      commandPalette: closeOverlay('commandPalette'),
      settingsPanel: closeOverlay('settingsPanel'),
      contextMenu: closeOverlay('contextMenu'),
      boundedListPopup: closeOverlay('boundedListPopup'),
      completionPopup: closeOverlay('completionPopup'),
      shortcutHelp: closeOverlay('shortcutHelp'),
      quitConfirmation: closeOverlay('quitConfirmation'),
    };
    const coordinator = new OverlayCoordinator.Class(closeActions);

    for (const overlayName of overlayNames) {
      for (const initialOverlayName of overlayNames)
        openStates.set(initialOverlayName, true);

      coordinator.openExclusiveOverlay(overlayName, () => {
        for (const siblingOverlayName of overlayNames) {
          if (siblingOverlayName !== overlayName) {
            expect(openStates.get(siblingOverlayName)).toBe(false);
          }
        }
        openStates.set(overlayName, true);
      });

      expect(
        overlayNames.filter((candidateName) => openStates.get(candidateName)),
      ).toEqual([overlayName]);
    }
  });

  test('switching Find to Replace does not close the shared Find bar', () => {
    let findBarCloseCount = 0;
    let findBarMode = 'find';
    const coordinator = new OverlayCoordinator.Class({
      findBar: () => {
        findBarCloseCount += 1;
      },
      goToLine: () => {},
      quickOpen: () => {},
      commandPalette: () => {},
      settingsPanel: () => {},
      contextMenu: () => {},
      boundedListPopup: () => {},
      completionPopup: () => {},
      shortcutHelp: () => {},
      quitConfirmation: () => {},
    });

    coordinator.openExclusiveOverlay('findBar', () => {
      findBarMode = 'replace';
    });

    expect(findBarCloseCount).toBe(0);
    expect(findBarMode).toBe('replace');
  });
});
