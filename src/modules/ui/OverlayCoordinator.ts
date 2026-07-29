import { Static } from 'ivue/extras';

class $OverlayCoordinator {
  protected get OverlayCoordinator() {
    return OverlayCoordinator.Class as unknown as typeof $OverlayCoordinator;
  }
  protected static get $exclusiveOverlayNames(): readonly ExclusiveOverlayName[] {
    const exclusiveOverlayNamesValue: readonly ExclusiveOverlayName[] = [
      'findBar',
      'goToLine',
      'quickOpen',
      'commandPalette',
      'settingsPanel',
      'contextMenu',
      'boundedListPopup',
      'completionPopup',
      'shortcutHelp',
    ];
    return exclusiveOverlayNamesValue;
  }
  protected get exclusiveOverlayNames(): readonly ExclusiveOverlayName[] {
    return this.OverlayCoordinator.$exclusiveOverlayNames;
  }
  constructor(protected readonly closeActions: ExclusiveOverlayCloseActions) {}
  /** Close every sibling before opening the requested overlay. The requested overlay stays mounted,
   *  so Find-to-Replace is a mode change on one bar rather than a close-and-reopen cycle. */
  openExclusiveOverlay(
    overlayName: ExclusiveOverlayName,
    openOverlay: () => void,
  ): void {
    for (const siblingOverlayName of this.exclusiveOverlayNames) {
      if (siblingOverlayName !== overlayName)
        this.closeActions[siblingOverlayName]();
    }
    openOverlay();
  }
}

export namespace OverlayCoordinator {
  export const $Class = Static($OverlayCoordinator);
  export let Class = $Class;
  export type Instance = InstanceType<typeof Class>;
}

// The single modal slot for every input-capturing overlay. Overlay models keep their own focused
// state, while this coordinator owns the cross-overlay rule: opening one closes every sibling first.
//
// invariant: Input overlays share one modal slot (src/modules/ui/ui.invariants.md)
export type ExclusiveOverlayName =
  | 'findBar'
  | 'goToLine'
  | 'quickOpen'
  | 'commandPalette'
  | 'settingsPanel'
  | 'contextMenu'
  | 'boundedListPopup'
  | 'completionPopup'
  | 'shortcutHelp';

export type ExclusiveOverlayCloseActions = Readonly<
  Record<ExclusiveOverlayName, () => void>
>;
