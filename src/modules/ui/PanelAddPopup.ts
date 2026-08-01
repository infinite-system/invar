import { Static } from 'ivue/extras';
import type {
  BoundedListPopup,
  BoundedListPopupAnchor,
  BoundedListPopupItem,
} from './BoundedListPopup';
import type { OverlayCoordinator } from './OverlayCoordinator';

// invariant: Panel controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelAddPopup {
  constructor(protected readonly dependencies: PanelAddPopupDependencies) {}

  /** The offered kinds come from whatever is currently contributed — the popup names none of them,
   *  so a disabled runtime simply stops being offered. */
  protected items(): readonly BoundedListPopupItem[] {
    return this.dependencies
      .addableKinds()
      .map((kind) => ({ identifier: kind.kind, label: kind.label }));
  }

  show(anchor: BoundedListPopupAnchor): void {
    const offeredItems = this.items();
    this.dependencies.overlayCoordinator.openExclusiveOverlay(
      'boundedListPopup',
      () =>
        this.dependencies.popup.openAt(
          offeredItems,
          anchor,
          (item) => {
            if (
              offeredItems.some(
                (offered) => offered.identifier === item.identifier,
              )
            ) {
              this.dependencies.addContent(item.identifier);
            }
          },
          {
            title:
              typeof this.dependencies.title === 'function'
                ? this.dependencies.title()
                : (this.dependencies.title ?? 'Add panel'),
            searchVisible: false,
            minimumWidth: 20,
          },
        ),
    );
  }
}

export namespace PanelAddPopup {
  export const $Class = Static($PanelAddPopup);
  export let Class = $Class;
  export type Instance = InstanceType<typeof Class>;
}

export interface PanelAddPopupKind {
  readonly kind: string;
  readonly label: string;
}

export interface PanelAddPopupDependencies {
  popup: Pick<BoundedListPopup.Instance, 'openAt'>;
  overlayCoordinator: Pick<OverlayCoordinator.Instance, 'openExclusiveOverlay'>;
  /** Live: read at open time so a newly contributed or disabled kind appears or disappears. */
  addableKinds(): readonly PanelAddPopupKind[];
  addContent(kind: string): void;
  title?: string | (() => string);
}
