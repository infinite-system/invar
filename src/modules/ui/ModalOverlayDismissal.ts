import { BoxRenderable, type CliRenderer } from '@opentui/core';
import {
  OverlayCloseButton,
  type OverlayCloseButtonGeometry,
} from './OverlayCloseButton';

// invariant: Modal outside presses dismiss and consume (src/modules/ui/ui.invariants.md)
class $ModalOverlayDismissal {
  constructor(
    protected readonly dependencies: ModalOverlayDismissalDependencies,
  ) {
    this.backdrop = new BoxRenderable(dependencies.renderer, {
      id: `${dependencies.identifier}-backdrop`,
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      visible: false,
      zIndex: dependencies.backdropZIndex,
    });
    this.backdrop.onMouseDown = () => {
      this.dismiss();
      dependencies.renderer.requestRender();
    };
    this.closeButton = new OverlayCloseButton.Class({
      renderer: dependencies.renderer,
      identifier: `${dependencies.identifier}-close`,
      zIndex: dependencies.closeButtonZIndex,
      close: () => this.dismiss(),
    });
    dependencies.renderer.root.add(this.backdrop);
  }

  protected readonly backdrop: BoxRenderable;
  protected readonly closeButton: OverlayCloseButton.Model;

  show(geometry: OverlayCloseButtonGeometry): void {
    this.backdrop.visible = true;
    this.closeButton.show(geometry);
  }

  hide(): void {
    this.backdrop.visible = false;
    this.closeButton.hide();
  }

  dispose(): void {
    this.hide();
    try {
      this.backdrop.destroyRecursively();
      this.closeButton.dispose();
    } catch {
      // Render teardown is best-effort after the app's effects have stopped.
    }
  }

  protected dismiss(): void {
    this.dependencies.dismiss();
  }
}

export namespace ModalOverlayDismissal {
  export const $Class = $ModalOverlayDismissal;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface ModalOverlayDismissalDependencies {
  renderer: CliRenderer;
  identifier: string;
  backdropZIndex: number;
  closeButtonZIndex: number;
  dismiss: () => void;
}
