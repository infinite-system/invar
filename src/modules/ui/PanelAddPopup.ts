import type {
  BoundedListPopup,
  BoundedListPopupAnchor,
  BoundedListPopupItem,
} from './BoundedListPopup';
import type { OverlayCoordinator } from './OverlayCoordinator';

// invariant: Panel heading controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelAddPopup {
  protected static get items(): readonly BoundedListPopupItem[] {
    return [
      { identifier: 'terminal', label: 'Terminal' },
      { identifier: 'agent', label: 'Agent' },
    ];
  }

  constructor(protected readonly dependencies: PanelAddPopupDependencies) {}

  show(anchor: BoundedListPopupAnchor): void {
    this.dependencies.overlayCoordinator.openExclusiveOverlay(
      'boundedListPopup',
      () =>
        this.dependencies.popup.openAt(
          $PanelAddPopup.items,
          anchor,
          (item) => {
            if (item.identifier === 'terminal' || item.identifier === 'agent') {
              this.dependencies.addContent(item.identifier);
            }
          },
          {
            title: 'Add panel',
            searchVisible: false,
            minimumWidth: 20,
          },
        ),
    );
  }
}

export namespace PanelAddPopup {
  export const $Class = $PanelAddPopup;
  export const Class = $Class;
  export type Instance = InstanceType<typeof Class>;
}

export type PanelContentKind = 'terminal' | 'agent';

export interface PanelAddPopupDependencies {
  popup: Pick<BoundedListPopup.Instance, 'openAt'>;
  overlayCoordinator: Pick<OverlayCoordinator.Instance, 'openExclusiveOverlay'>;
  addContent(kind: PanelContentKind): void;
}
