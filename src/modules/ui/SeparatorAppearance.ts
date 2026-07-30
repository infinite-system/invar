// Shared one-cell separator appearance. Vertical separators fill their cell. Horizontal separators
// paint only the lower half of their cell, which gives both axes the same visual weight in terminals
// whose cells are about twice as tall as they are wide.
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
    const paintRow = rectangle.y + Math.max(0, rectangle.height - 1);
    for (
      let paintColumn = rectangle.x;
      paintColumn < rectangle.x + rectangle.width;
      paintColumn += 1
    ) {
      buffer.setCellWithAlphaBlending(
        paintColumn,
        paintRow,
        '▄',
        color,
        this.$transparentBackground,
      );
    }
  }

  protected static get $transparentBackground(): RGBA {
    return RGBA.fromValues(0, 0, 0, 0);
  }
}

export namespace SeparatorAppearance {
  export const $Class = Static($SeparatorAppearance);
  export let Class = $Class;
}

export interface SeparatorPaintRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
