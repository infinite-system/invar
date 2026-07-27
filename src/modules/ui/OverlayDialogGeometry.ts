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
    const width = Math.min(screenWidth, desiredWidth);
    const height = Math.min(screenHeight, desiredHeight);
    const maximumLeft = Math.max(0, screenWidth - width);
    const maximumTop = Math.max(0, screenHeight - height);
    const desiredLeft =
      input.desiredLeft ?? Math.floor((screenWidth - width) / 2);
    const desiredTop = input.desiredTop ?? 0;
    const left = Math.max(0, Math.min(Math.floor(desiredLeft), maximumLeft));
    const top = Math.max(0, Math.min(Math.floor(desiredTop), maximumTop));
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
  export const Class = $Class;
}

export interface OverlayDialogGeometryInput {
  screenWidth: number;
  screenHeight: number;
  desiredWidth: number;
  desiredHeight: number;
  desiredLeft?: number;
  desiredTop?: number;
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
