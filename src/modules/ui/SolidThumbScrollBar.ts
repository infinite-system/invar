// Scrollbar whose thumb is SOLID: painted as BACKGROUND colour on blank cells, never as foreground
// block glyphs. macOS Terminal.app rasterizes block glyphs (█ U+2588, ▀ U+2580, ▄ U+2584, …) with
// inter-line gaps — a glyph-built thumb shows darker horizontal lines through it — while a background
// fill covers every pixel of the cell, so the artifact cannot exist. OpenTUI's SliderRenderable
// hard-codes the glyph painter (no bg-fill style option) and ScrollBarRenderable constructs its slider
// internally, so the seam is this subclass replacing the slider's whole-cell thumb rect and repainting
// its cells (the HitTransparentText pattern: an instance override where OpenTUI offers no flag).
// OpenTUI rounds both moving half-cell endpoints independently, which makes the whole-cell rect alternate
// in length as its start crosses odd half-cells. This seam instead rounds the position-independent virtual
// thumb size once, then clamps its start to the track. The painted rect IS the slider's mouse hit-test
// rect, so the renderer and hit-test still share one geometry model. Every scrollbar in the app
// (editor/pane bars via ScrollbarSync, the shared ScrollableTextViewport bars, the diff bars) constructs
// THIS class.
//
// It also heals an OpenTUI ordering bug at the same seam: ScrollBarRenderable's viewportSize setter
// assigns slider.viewPortSize BEFORE updateSliderFromScrollState() raises slider.max, so the slider
// clamps the viewport against a STALE max (observed live: viewPortSize stuck at its 0.01 floor after
// the first laid-out frame, collapsing every thumb to a half-cell). Re-asserting slider.viewPortSize
// AFTER each scroll-state write passes the now-correct clamp; the slider setter's equality guard makes
// the per-frame re-assert free.
//
// invariant: A scrollbar thumb is painted as background fill, never block glyphs (src/modules/ui/ui.invariants.md)
// invariant: Geometry aggregates match their consumers (src/modules/editor/editor.invariants.md)
import {
  ScrollBarRenderable,
  type ScrollBarOptions,
  type OptimizedBuffer,
  type RenderContext,
} from '@opentui/core';
class $SolidThumbScrollBar extends ScrollBarRenderable {
  constructor(context: RenderContext, options: ScrollBarOptions) {
    super(context, options);
    const slider = this.slider;
    const paintSurface = slider as unknown as SliderPaintSurface;
    const selectedClass = this.constructor as typeof $SolidThumbScrollBar;
    paintSurface.getThumbRect = (): SliderThumbRect => {
      const trackLength =
        slider.orientation === 'vertical' ? slider.height : slider.width;
      const thumbAxis = selectedClass.stableThumbAxis(
        paintSurface.getVirtualThumbStart(),
        paintSurface.getVirtualThumbSize(),
        trackLength,
      );
      return slider.orientation === 'vertical'
        ? {
            x: slider.x,
            y: slider.y + thumbAxis.start,
            width: slider.width,
            height: thumbAxis.length,
          }
        : {
            x: slider.x + thumbAxis.start,
            y: slider.y,
            width: thumbAxis.length,
            height: slider.height,
          };
    };
    // Instance-level override shadows the prototype's glyph painter (render() dispatches through
    // `this.renderSelf`). Track first, thumb over it — both as background fill on blank cells. The
    // same overridden getThumbRect above is what SliderRenderable's mouse-down hit-test calls.
    paintSurface.renderSelf = (buffer: OptimizedBuffer): void => {
      buffer.fillRect(
        slider.x,
        slider.y,
        slider.width,
        slider.height,
        slider.backgroundColor,
      );
      const thumbRect = paintSurface.getThumbRect();
      buffer.fillRect(
        thumbRect.x,
        thumbRect.y,
        thumbRect.width,
        thumbRect.height,
        slider.foregroundColor,
      );
    };
  }
  protected static stableThumbAxis(
    virtualThumbStart: number,
    virtualThumbSize: number,
    trackLength: number,
  ): ThumbAxis {
    const length = Math.max(
      1,
      Math.min(Math.ceil(virtualThumbSize / 2), trackLength),
    );
    const start = Math.max(
      0,
      Math.min(Math.floor(virtualThumbStart / 2), trackLength - length),
    );
    return { start, length };
  }
  /** Re-assert the slider's viewport AFTER the scroll state settled — the slider clamps viewPortSize
   *  against max-min at assignment time, and the base class assigns it before max is updated. */
  protected reassertSliderViewport(): void {
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
/** The slider internals this subclass normalizes and repaints through: TypeScript-private in
 *  OpenTUI's declaration but plain methods at runtime. Replacing getThumbRect at the slider instance
 *  keeps the normalized paint rectangle and the native hit-test on ONE model. */
interface SliderPaintSurface {
  getVirtualThumbStart(): number;
  getVirtualThumbSize(): number;
  getThumbRect(): SliderThumbRect;
  renderSelf(buffer: OptimizedBuffer): void;
}
interface SliderThumbRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface ThumbAxis {
  start: number;
  length: number;
}
