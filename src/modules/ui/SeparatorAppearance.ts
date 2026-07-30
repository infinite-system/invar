// Shared one-cell separator appearance. Vertical separators fill their cell. Horizontal separators
// paint one cell row, and the caller names WHICH horizontal mark its role wants, because the two
// roles that share this painter want opposite things inside that cell:
//
//   centeredLine ('━') marks a BOUNDARY BETWEEN two regions, so its ink sits in the vertical middle
//     of the row. A pane splitter uses it. Measured in DejaVu Sans Mono, its ink centre sits on the
//     cell centre and it fills 0.13 of the cell height.
//   bottomAnchoredHalfBlock ('▄') marks a POSITION ALONG an edge, so its ink hugs the trailing edge
//     of the row and leaves the upper half open. A horizontal scrollbar track and thumb use it: it
//     fills 0.50 of the cell height, which is the same apparent thickness as a one-cell-wide
//     vertical bar in terminals whose cells are about twice as tall as they are wide, and that
//     weight is what makes a thumb read as a graspable bar.
//
// Both marks paint over a transparent background, so the theme surface stays visible around them.
//
// invariant: One scrollbar painter gives each axis equal visual weight (src/modules/ui/ui.invariants.md)
// invariant: Splitter paint and hit testing share one geometry (src/modules/ui/ui.invariants.md)
import { RGBA, type OptimizedBuffer } from '@opentui/core';
import { Static } from 'ivue/extras';

class $SeparatorAppearance {
  static get CROSS_AXIS_CELL_COUNT(): number {
    return 1;
  }

  static paint(
    buffer: OptimizedBuffer,
    orientation: 'vertical' | 'horizontal',
    rectangle: SeparatorPaintRectangle,
    color: RGBA,
    horizontalMark: HorizontalSeparatorMark,
  ): void {
    if (orientation === 'vertical') {
      buffer.fillRect(
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
        color,
      );
      return;
    }
    const glyph = this.horizontalGlyphFor(horizontalMark);
    const paintRow = rectangle.y + Math.max(0, rectangle.height - 1);
    for (
      let paintColumn = rectangle.x;
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

  static horizontalGlyphFor(horizontalMark: HorizontalSeparatorMark): string {
    return horizontalMark === 'centeredLine' ? '━' : '▄';
  }

  protected static get $transparentBackground(): RGBA {
    return RGBA.fromValues(0, 0, 0, 0);
  }
}

export namespace SeparatorAppearance {
  export const $Class = Static($SeparatorAppearance);
  export let Class = $Class;
}

export type HorizontalSeparatorMark =
  'centeredLine' | 'bottomAnchoredHalfBlock';

export interface SeparatorPaintRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
