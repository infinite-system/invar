// The LSP document-symbol kind vocabulary. A `SymbolKind` NUMBER is protocol (a table distinct
// from `CompletionItemKind` — the two enumerations share no numbering), so the answer to "what is
// this symbol" belongs beside the client that receives it — and it is only ever an answer in
// symbol-CLASS terms. This file chooses no glyph: the theme's one symbol-mark table resolves the
// mark for every surface, so the structure pane, the completion popup, and the file tree cannot
// drift into two vocabularies.
//
// invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
import { Static } from 'ivue/extras';
import type { SymbolClass } from '../theme/ThemeIcons';

class $SymbolKinds {
  /**
   * Every `SymbolKind` in the LSP specification (1–26), grouped into the symbol-class families.
   * `File` deliberately resolves to the same class the file tree uses.
   */
  protected static get SYMBOL_CLASSES_BY_SYMBOL_KIND(): Readonly<
    Record<number, SymbolClass>
  > {
    return {
      1: 'file', // File — the same class the file tree marks
      2: 'module', // Module
      3: 'module', // Namespace
      4: 'module', // Package
      5: 'type', // Class
      6: 'callable', // Method
      7: 'value', // Property
      8: 'value', // Field
      9: 'callable', // Constructor
      10: 'type', // Enum
      11: 'type', // Interface
      12: 'callable', // Function
      13: 'value', // Variable
      14: 'value', // Constant
      15: 'value', // String
      16: 'value', // Number
      17: 'value', // Boolean
      18: 'value', // Array
      19: 'value', // Object
      20: 'value', // Key
      21: 'value', // Null
      22: 'value', // EnumMember
      23: 'type', // Struct
      24: 'value', // Event — a member you subscribe to, not one you call
      25: 'syntax', // Operator
      26: 'type', // TypeParameter
    };
  }

  /**
   * Classify one document symbol. A server that sends no kind, or a kind from a newer protocol
   * revision than this table knows, still classifies — as `unclassified`, never as nothing — so
   * the outline's mark column can never be undefined for one row and present for its neighbours.
   */
  static symbolClassFor(symbolKind: number | null): SymbolClass {
    if (symbolKind === null) return 'unclassified';
    return this.SYMBOL_CLASSES_BY_SYMBOL_KIND[symbolKind] ?? 'unclassified';
  }
}

export namespace SymbolKinds {
  export const $Class = Static($SymbolKinds);
  export let Class = $Class;
}
