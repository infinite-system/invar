// Shared one-cell separator appearance. The caller names WHICH mark its ROLE wants, and this
// painter picks the glyph for the axis it is asked to paint. The mark is not an axis name: the
// two roles that share this painter want opposite things inside the same cell, on both axes.
//
//   centeredLine marks a BOUNDARY BETWEEN two regions, so its ink sits in the middle of the cell
//     across the separator's thin direction. A pane splitter uses the light box-drawing pair so
//     the boundary stays subordinate to the content it separates.
//   bottomAnchoredHalfBlock marks a POSITION ALONG an edge, so its ink hugs the trailing edge of
//     the cell and leaves the other half open. A scrollbar track and thumb use it. Horizontally
//     that is '▄', which fills 0.50 of the cell height — the same apparent thickness as the
//     FILLED cell it uses vertically, in terminals whose cells are about twice as tall as they
//     are wide. That weight is what makes a thumb read as a graspable bar, and it is why the
//     vertical scrollbar keeps its filled cell while the vertical splitter does not.
//
// Both centeredLine marks paint over a transparent background, so the theme surface stays visible
// around them. The vertical bottomAnchoredHalfBlock fills with BACKGROUND colour on blank cells
// because macOS Terminal.app can rasterize stacked block glyphs with horizontal seams.
//
// leadingPaintPadCells leaves cells at the start of the separator's LONG axis unpainted. It moves
// where paint BEGINS and never where the caller's rectangle is, so the renderable that owns the
// rectangle keeps its whole hit area. That is the pad the bottom panel splitter uses to stand off
// from the action icon on its left.
//
// invariant: One scrollbar painter gives each axis equal visual weight (src/modules/ui/ui.invariants.md)
// invariant: Splitter paint and hit testing share one geometry (src/modules/ui/ui.invariants.md)
import { RGBA, type OptimizedBuffer } from '@opentui/core';
import { Static } from 'ivue/extras';

class $SeparatorAppearance {
  static get CROSS_AXIS_CELL_COUNT(): number {
    return 1;
  }

  static paint(options: SeparatorPaintOptions): void {
    const {
      buffer,
      orientation,
      rectangle,
      color,
      mark,
      leadingPaintPadCells = 0,
    } = options;
    const padCellCount = Math.max(0, Math.floor(leadingPaintPadCells));
    if (orientation === 'vertical' && mark === 'bottomAnchoredHalfBlock') {
      buffer.fillRect(
        rectangle.x,
        rectangle.y + padCellCount,
        rectangle.width,
        Math.max(0, rectangle.height - padCellCount),
        color,
      );
      return;
    }
    const glyph = this.glyphFor(orientation, mark);
    if (orientation === 'vertical') {
      const paintColumn = rectangle.x;
      for (
        let paintRow = rectangle.y + padCellCount;
        paintRow < rectangle.y + rectangle.height;
        paintRow += 1
      ) {
        buffer.setCellWithAlphaBlending(
          paintColumn,
          paintRow,
          glyph,
          color,
          this.$transparentBackground,
        );
      }
      return;
    }
    const paintRow = rectangle.y + Math.max(0, rectangle.height - 1);
    for (
      let paintColumn = rectangle.x + padCellCount;
      paintColumn < rectangle.x + rectangle.width;
      paintColumn += 1
    ) {
      buffer.setCellWithAlphaBlending(
        paintColumn,
        paintRow,
        glyph,
        color,
        this.$transparentBackground,
      );
    }
  }

  static glyphFor(
    orientation: SeparatorOrientation,
    mark: SeparatorMark,
  ): string {
    if (mark === 'bottomAnchoredHalfBlock') return '▄';
    return orientation === 'vertical' ? '│' : '─';
  }

  protected static get $transparentBackground(): RGBA {
    return RGBA.fromValues(0, 0, 0, 0);
  }
}

export namespace SeparatorAppearance {
  export const $Class = Static($SeparatorAppearance);
  export let Class = $Class;
}

export type SeparatorOrientation = 'vertical' | 'horizontal';

export type SeparatorMark = 'centeredLine' | 'bottomAnchoredHalfBlock';

export interface SeparatorPaintRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SeparatorPaintOptions {
  readonly buffer: OptimizedBuffer;
  readonly orientation: SeparatorOrientation;
  readonly rectangle: SeparatorPaintRectangle;
  readonly color: RGBA;
  readonly mark: SeparatorMark;
  readonly leadingPaintPadCells?: number;
}
