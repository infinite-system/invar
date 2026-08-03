import {
  StyledText,
  TextRenderable,
  bg,
  fg,
  type CliRenderer,
} from '@opentui/core';

// invariant: Overlay keyboard actions have visible mouse paths (src/modules/ui/ui.invariants.md)
class $OverlayCloseButton {
  protected readonly renderable: TextRenderable;

  constructor(protected readonly dependencies: OverlayCloseButtonDependencies) {
    this.renderable = new TextRenderable(dependencies.renderer, {
      id: dependencies.identifier,
      content: '',
      position: 'absolute',
      visible: false,
      zIndex: dependencies.zIndex,
      selectable: false,
    });
    this.renderable.onMouseDown = () => {
      dependencies.close();
      dependencies.renderer.requestRender();
    };
    dependencies.renderer.root.add(this.renderable);
  }

  show(geometry: OverlayCloseButtonGeometry): void {
    const width = Math.max(1, Math.min(3, geometry.width));
    const label =
      width >= 3
        ? ` ${geometry.glyph} `
        : width === 2
          ? `${geometry.glyph} `
          : geometry.glyph;
    this.renderable.visible = true;
    this.renderable.left = geometry.left + geometry.width - width;
    this.renderable.top = geometry.top;
    this.renderable.width = width;
    this.renderable.height = 1;
    this.renderable.content = new StyledText([
      bg(geometry.backgroundColor)(fg(geometry.foregroundColor)(label)),
    ]);
  }

  hide(): void {
    this.renderable.visible = false;
  }

  dispose(): void {
    try {
      this.renderable.destroyRecursively();
    } catch {
      // Render teardown is best-effort after the app's effects have stopped.
    }
  }
}

export namespace OverlayCloseButton {
  export const $Class = $OverlayCloseButton;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface OverlayCloseButtonDependencies {
  renderer: CliRenderer;
  identifier: string;
  zIndex: number;
  close: () => void;
}

export interface OverlayCloseButtonGeometry {
  left: number;
  top: number;
  width: number;
  glyph: string;
  backgroundColor: string;
  foregroundColor: string;
}
