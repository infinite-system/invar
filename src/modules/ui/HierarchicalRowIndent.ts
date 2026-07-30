import { Static } from 'ivue/extras';

// One compact indentation generator for every hierarchical row surface.
// invariant: Hierarchical pane rows share one compact indent (src/modules/ui/ui.invariants.md)
class $HierarchicalRowIndent {
  static text(depth: number): string {
    return ' '.repeat(this.width(depth));
  }

  static width(depth: number): number {
    return Math.max(0, Math.floor(depth));
  }
}

export namespace HierarchicalRowIndent {
  export const $Class = Static($HierarchicalRowIndent);
  export let Class = $Class;
}
