// A TextRenderable that lets us drive OpenTUI's NATIVE text selection programmatically from our
// keyboard Cursor model, instead of embedding background chunks in a StyledText (which OpenTUI
// mis-positions across multiple lines — see ui.invariants.md). OpenTUI stores the selection as a
// `lastLocalSelection` (local text-buffer coords) and re-applies it via the protected
// `refreshLocalSelection()` whenever content changes; we set that field and refresh.
//
// Coordinates are viewport-local cells. EditorPane.visualRowsWindow maps document positions through
// folding and wrapping into the rendered window's visual rows. setSelectionRange writes OpenTUI's
// lastLocalSelection, calls refreshLocalSelection(), and requests a render. The code buffer holds
// only code, with no gutter, so a multi-line selection never shades a gutter.
import { TextRenderable } from '@opentui/core';

class $SelectableText extends TextRenderable {
  // invariant: The selected range renders with a background (src/modules/ui/ui.invariants.md)
  setSelectionRange(
    anchorX: number,
    anchorY: number,
    focusX: number,
    focusY: number,
  ): void {
    this.lastLocalSelection = {
      anchorX,
      anchorY,
      focusX,
      focusY,
      isActive: true,
    };
    this.refreshLocalSelection();
    this.requestRender();
  }

  clearSelectionRange(): void {
    if (!this.lastLocalSelection) return;
    this.lastLocalSelection = null;
    this.textBufferView.resetLocalSelection();
    this.requestRender();
  }
}

export namespace SelectableText {
  export const $Class = $SelectableText;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
