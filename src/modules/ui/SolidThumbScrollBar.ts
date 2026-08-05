// Shared scrollbar painter. A vertical bar uses BACKGROUND colour on blank cells because macOS
// Terminal.app can rasterize stacked block glyphs with horizontal seams. A horizontal bar uses the
// lower-half block `▄`: terminal cells are about twice as tall as they are wide, so the glyph makes
// both axes read at the same visual weight while its transparent background preserves the pane.
// This class asks SeparatorAppearance for that mark by name (`bottomAnchoredHalfBlock`). SplitterElement
// shares the same painter but asks for `centeredLine`, because a splitter divides two regions instead
// of reporting a position along one edge.
// OpenTUI's SliderRenderable hard-codes its painter and ScrollBarRenderable constructs its slider
// internally, so the seam is this subclass replacing the slider's whole-cell thumb rect and painter
// (the HitTransparentText pattern: an instance override where OpenTUI offers no flag).
// OpenTUI rounds both moving half-cell endpoints independently, which makes the whole-cell rect alternate
// in length as its start crosses odd half-cells. This seam instead rounds the position-independent virtual
// thumb size once, then clamps its start to the track. The painted rect IS the slider's mouse hit-test
// rect, so the renderer and hit-test still share one geometry model. Every scrollbar in the app
// (editor/pane bars via ScrollbarSync, the shared ScrollableTextViewport bars, the diff bars) constructs
// THIS class.
//
// Every bar also has a positive z-index. SourceTextPaneContent is installed lazily after ScrollbarSync
// and therefore paints later at the default z-index; without this shared priority, the editor's bar
// remains visible but its pointer events fall through to the source body.
//
// It also heals an OpenTUI ordering bug at the same seam: ScrollBarRenderable's viewportSize setter
// assigns slider.viewPortSize BEFORE updateSliderFromScrollState() raises slider.max, so the slider
// clamps the viewport against a STALE max (observed live: viewPortSize stuck at its 0.01 floor after
// the first laid-out frame, collapsing every thumb to a half-cell). Re-asserting slider.viewPortSize
// AFTER each scroll-state write passes the now-correct clamp; the slider setter's equality guard makes
// the per-frame re-assert free.
//
// invariant: One scrollbar painter gives each axis equal visual weight (src/modules/ui/ui.invariants.md)
// invariant: Geometry aggregates match their consumers (src/modules/editor/editor.invariants.md)
import { Static } from 'ivue/extras';
import {
  ScrollBarRenderable,
  RGBA,
  type ScrollBarOptions,
  type OptimizedBuffer,
  type RenderContext,
} from '@opentui/core';
import { SeparatorAppearance } from './SeparatorAppearance';

class $SolidThumbScrollBar extends ScrollBarRenderable {
  protected static stableThumbAxis(
    virtualThumbStart: number,
    virtualThumbSize: number,
    trackLength: number,
  ): ThumbAxis {
    const minimumLength = Math.min(2, trackLength);
    const length = Math.max(
      minimumLength,
      Math.min(Math.ceil(virtualThumbSize / 2), trackLength),
    );
    const start = Math.max(
      0,
      Math.min(Math.floor(virtualThumbStart / 2), trackLength - length),
    );
    return { start, length };
  }

  constructor(context: RenderContext, options: ScrollBarOptions) {
    super(context, {
      ...options,
      zIndex: Math.max(1, options.zIndex ?? 1),
    });
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
    // `this.renderSelf`). The same overridden getThumbRect above is what SliderRenderable's
    // mouse-down hit-test calls.
    paintSurface.renderSelf = (buffer: OptimizedBuffer): void => {
      const thumbRect = paintSurface.getThumbRect();
      SeparatorAppearance.Class.paint({
        buffer,
        orientation: slider.orientation,
        rectangle: {
          x: slider.x,
          y: slider.y,
          width: slider.width,
          height: slider.height,
        },
        color: slider.backgroundColor,
        mark: 'bottomAnchoredHalfBlock',
      });
      SeparatorAppearance.Class.paint({
        buffer,
        orientation: slider.orientation,
        rectangle: thumbRect,
        color: slider.foregroundColor,
        mark: 'bottomAnchoredHalfBlock',
      });
      for (const overviewMark of this.overviewMarks) {
        if (
          overviewMark.trackOffset < 0 ||
          overviewMark.trackOffset >=
            (slider.orientation === 'vertical' ? slider.height : slider.width)
        ) {
          continue;
        }
        const markColumn =
          slider.orientation === 'vertical'
            ? slider.x + Math.max(0, slider.width - 1)
            : slider.x + overviewMark.trackOffset;
        const markRow =
          slider.orientation === 'vertical'
            ? slider.y + overviewMark.trackOffset
            : slider.y + Math.max(0, slider.height - 1);
        const markOverlapsThumb =
          markColumn >= thumbRect.x &&
          markColumn < thumbRect.x + thumbRect.width &&
          markRow >= thumbRect.y &&
          markRow < thumbRect.y + thumbRect.height;
        buffer.setCell(
          markColumn,
          markRow,
          overviewMark.glyph,
          overviewMark.color,
          markOverlapsThumb ? slider.foregroundColor : slider.backgroundColor,
        );
      }
    };
  }

  protected overviewMarks: readonly ScrollbarOverviewMark[] = [];

  setOverviewMarks(marks: readonly ScrollbarOverviewColorInput[]): void {
    this.overviewMarks = marks.map((mark) => ({
      trackOffset: mark.trackOffset,
      color: RGBA.fromHex(mark.color),
      glyph: mark.glyph,
    }));
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
  export const $Class = Static($SolidThumbScrollBar);
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

interface ScrollbarOverviewMark {
  readonly trackOffset: number;
  readonly color: RGBA;
  readonly glyph: string;
}

export interface ScrollbarOverviewColorInput {
  readonly trackOffset: number;
  readonly color: string;
  readonly glyph: string;
}
