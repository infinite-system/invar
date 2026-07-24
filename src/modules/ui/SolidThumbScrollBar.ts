// Scrollbar whose thumb is SOLID: painted as BACKGROUND colour on blank cells, never as foreground
// block glyphs. macOS Terminal.app rasterizes block glyphs (█ U+2588, ▀ U+2580, ▄ U+2584, …) with
// inter-line gaps — a glyph-built thumb shows darker horizontal lines through it — while a background
// fill covers every pixel of the cell, so the artifact cannot exist. OpenTUI's SliderRenderable
// hard-codes the glyph painter (no bg-fill style option) and ScrollBarRenderable constructs its slider
// internally, so the seam is this subclass repainting the slider's cells (the HitTransparentText
// pattern: a subclass override where OpenTUI offers no flag). The painted rect IS the slider's own
// getThumbRect() — the exact rect its mouse hit-test uses — so the renderer and the hit-test share one
// geometry model and can never disagree. Every scrollbar in the app (editor/pane bars via
// ScrollbarSync, the shared ScrollableTextViewport bars, the diff bars) constructs THIS class.
//
// It also heals an OpenTUI ordering bug at the same seam: ScrollBarRenderable's viewportSize setter
// assigns slider.viewPortSize BEFORE updateSliderFromScrollState() raises slider.max, so the slider
// clamps the viewport against a STALE max (observed live: viewPortSize stuck at its 0.01 floor after
// the first laid-out frame, collapsing every thumb to a half-cell). Re-asserting slider.viewPortSize
// AFTER each scroll-state write passes the now-correct clamp; the slider setter's equality guard makes
// the per-frame re-assert free.
//
// invariant: A scrollbar thumb is painted as background fill, never block glyphs (src/modules/ui/ui.invariants.md)
import {
  ScrollBarRenderable,
  type ScrollBarOptions,
  type OptimizedBuffer,
  type RenderContext,
} from '@opentui/core';

/** The slider internals this subclass repaints through: TypeScript-private in OpenTUI's declaration
 *  but plain methods at runtime. getThumbRect is the hit-test's own geometry — reusing it (instead of
 *  re-deriving the rect) is what keeps renderer and hit-test on ONE model. */
interface SliderPaintSurface {
  getThumbRect(): { x: number; y: number; width: number; height: number };
  renderSelf(buffer: OptimizedBuffer): void;
}

class $SolidThumbScrollBar extends ScrollBarRenderable {
  constructor(context: RenderContext, options: ScrollBarOptions) {
    super(context, options);
    const slider = this.slider;
    const paintSurface = slider as unknown as SliderPaintSurface;
    // Instance-level override shadows the prototype's glyph painter (render() dispatches through
    // `this.renderSelf`). Track first, thumb over it — both as background fill on blank cells.
    paintSurface.renderSelf = (buffer: OptimizedBuffer): void => {
      buffer.fillRect(slider.x, slider.y, slider.width, slider.height, slider.backgroundColor);
      const thumbRect = paintSurface.getThumbRect();
      buffer.fillRect(thumbRect.x, thumbRect.y, thumbRect.width, thumbRect.height, slider.foregroundColor);
    };
  }

  /** Re-assert the slider's viewport AFTER the scroll state settled — the slider clamps viewPortSize
   *  against max-min at assignment time, and the base class assigns it before max is updated. */
  private reassertSliderViewport(): void {
    this.slider.viewPortSize = Math.max(1, super.viewportSize);
  }

  override get scrollSize(): number {
    return super.scrollSize;
  }
  override set scrollSize(value: number) {
    super.scrollSize = value;
    this.reassertSliderViewport();
  }

  override get viewportSize(): number {
    return super.viewportSize;
  }
  override set viewportSize(value: number) {
    super.viewportSize = value;
    this.reassertSliderViewport();
  }
}

export namespace SolidThumbScrollBar {
  export const $Class = $SolidThumbScrollBar;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
