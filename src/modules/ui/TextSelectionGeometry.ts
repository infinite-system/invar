import { Static } from 'ivue/extras';
import type { SelectionPoint } from './TextSelectionModel';

/** A tiny stateless helper seam so a surface can normalize selection points without owning state. */
class $TextSelectionGeometry {
  /** Order two points from start to end by line and then column. */
  static orderPoints(
    anchor: SelectionPoint,
    focus: SelectionPoint,
  ): [SelectionPoint, SelectionPoint] {
    const anchorFirst =
      anchor.line < focus.line ||
      (anchor.line === focus.line && anchor.column <= focus.column);
    return anchorFirst ? [anchor, focus] : [focus, anchor];
  }
}

export namespace TextSelectionGeometry {
  export const $Class = Static($TextSelectionGeometry);
  export let Class = $Class;
}
