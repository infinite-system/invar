import { Static } from 'ivue/extras';

// invariant: Overlay dialogs stay inside the terminal (src/modules/ui/ui.invariants.md)
class $OverlayDialogGeometry {
  public static layout(
    input: OverlayDialogGeometryInput,
  ): OverlayDialogGeometryResult {
    const screenWidth = Math.max(1, Math.floor(input.screenWidth));
    const screenHeight = Math.max(1, Math.floor(input.screenHeight));
    const desiredWidth = Math.max(1, Math.floor(input.desiredWidth));
    const desiredHeight = Math.max(1, Math.floor(input.desiredHeight));
    const horizontalMargin = Math.min(
      Math.max(0, Math.floor(input.horizontalMargin ?? 0)),
      Math.floor((screenWidth - 1) / 2),
    );
    const verticalMargin = Math.min(
      Math.max(0, Math.floor(input.verticalMargin ?? 0)),
      Math.floor((screenHeight - 1) / 2),
    );
    const availableWidth = Math.max(1, screenWidth - horizontalMargin * 2);
    const availableHeight = Math.max(1, screenHeight - verticalMargin * 2);
    const width = Math.min(availableWidth, desiredWidth);
    const height = Math.min(availableHeight, desiredHeight);
    const minimumLeft = horizontalMargin;
    const minimumTop = verticalMargin;
    const maximumLeft = Math.max(
      minimumLeft,
      screenWidth - horizontalMargin - width,
    );
    const maximumTop = Math.max(
      minimumTop,
      screenHeight - verticalMargin - height,
    );
    const desiredLeft =
      input.desiredLeft ??
      minimumLeft + Math.floor((availableWidth - width) / 2);
    const desiredTop = input.desiredTop ?? minimumTop;
    const left = Math.max(
      minimumLeft,
      Math.min(Math.floor(desiredLeft), maximumLeft),
    );
    const top = Math.max(
      minimumTop,
      Math.min(Math.floor(desiredTop), maximumTop),
    );
    const closeButtonWidth = Math.min(3, width);

    return {
      left,
      top,
      width,
      height,
      interiorWidth: Math.max(1, width - 2),
      interiorHeight: Math.max(1, height - 2),
      closeButtonLeft: left + width - closeButtonWidth,
      closeButtonTop: top,
      closeButtonWidth,
    };
  }
}

export namespace OverlayDialogGeometry {
  export const $Class = Static($OverlayDialogGeometry);
  export let Class = $Class;
}

export interface OverlayDialogGeometryInput {
  screenWidth: number;
  screenHeight: number;
  desiredWidth: number;
  desiredHeight: number;
  desiredLeft?: number;
  desiredTop?: number;
  /** Preferred canvas gaps. They shrink only when the terminal cannot retain one dialog cell. */
  horizontalMargin?: number;
  verticalMargin?: number;
}

export interface OverlayDialogGeometryResult {
  left: number;
  top: number;
  width: number;
  height: number;
  interiorWidth: number;
  interiorHeight: number;
  closeButtonLeft: number;
  closeButtonTop: number;
  closeButtonWidth: number;
}
