// The LSP completion-kind vocabulary. A kind NUMBER is protocol, so the answer to "what is this item"
// belongs beside the client that receives it — and it is only ever an answer in symbol-CLASS terms.
// This file chooses no glyph: the theme's one symbol-mark table resolves the mark for every surface,
// so the completion popup and the file tree cannot drift into two vocabularies.
//
// invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
// invariant: Completion is provider-neutral (src/modules/lsp/lsp.invariants.md)
import { Static } from 'ivue/extras';
import type { SymbolClass } from '../theme/ThemeIcons';

class $CompletionItemKinds {
  /**
   * Every `CompletionItemKind` in the LSP specification (1–25), grouped into the symbol-class
   * families. The grouping is the point: a reader scanning a member list needs "callable versus
   * value versus type" at a glance far more than it needs twenty-five distinguishable marks.
   *
   * `File` and `Folder` deliberately resolve to the SAME classes the file tree uses, so a path
   * completion is marked exactly like the row it will open.
   */
  protected static get SYMBOL_CLASSES_BY_COMPLETION_ITEM_KIND(): Readonly<
    Record<number, SymbolClass>
  > {
    return {
      1: 'unclassified', // Text — the provider offered a word with no semantics
      2: 'callable', // Method
      3: 'callable', // Function
      4: 'callable', // Constructor
      5: 'value', // Field
      6: 'value', // Variable
      7: 'type', // Class
      8: 'type', // Interface
      9: 'module', // Module
      10: 'value', // Property
      11: 'value', // Unit
      12: 'value', // Value
      13: 'type', // Enum
      14: 'syntax', // Keyword
      15: 'syntax', // Snippet
      16: 'value', // Color — a colour literal is a value
      17: 'file', // File — the same class the file tree marks
      18: 'module', // Reference — a pointer into another namespace
      19: 'directoryClosed', // Folder — the same class the file tree marks
      20: 'value', // EnumMember
      21: 'value', // Constant
      22: 'type', // Struct
      23: 'value', // Event — a member you subscribe to, not one you call
      24: 'syntax', // Operator
      25: 'type', // TypeParameter
    };
  }

  /**
   * Classify one completion item. A provider that sends no kind, or a kind from a newer protocol
   * revision than this table knows, still classifies — as `unclassified`, never as nothing — so the
   * mark column can never be undefined for one row and present for its neighbours.
   */
  static symbolClassFor(completionItemKind: number | null): SymbolClass {
    if (completionItemKind === null) return 'unclassified';
    return (
      this.SYMBOL_CLASSES_BY_COMPLETION_ITEM_KIND[completionItemKind] ??
      'unclassified'
    );
  }
}

export namespace CompletionItemKinds {
  export const $Class = Static($CompletionItemKinds);
  export let Class = $Class;
}
