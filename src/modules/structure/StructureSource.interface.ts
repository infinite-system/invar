// The structure-navigator contract: what the outline pane ASKS of a symbol source. The interface
// lives on the CONSUMER side (the `RewriteProvider.interface` precedent), so a source module
// imports this file and the pane never names a concrete provider. The shape derives from what the
// pane asks — a navigable symbol tree for one document — never from a protocol's feature list.
//
// A source answers three questions and nothing else: can you serve this document, what are its
// symbols, and why not (a user-facing notice) when you decline. `documentSymbols` resolves `null`
// for "I cannot answer" (no server, unsupported file, suppressed document) and an EMPTY list for
// "I answered and the document has no symbols" — the pane states each differently, never a blank.
//
// invariant: Plugin boundaries grant one authority (project.invariants.md)
// invariant: Symbol structure is analyzer knowledge (src/modules/structure/structure.invariants.md)
// invariant: A structure source answers or declines, never blanks (src/modules/structure/structure.invariants.md)
import type { SymbolClass } from '../theme/ThemeIcons';
import type { TextDocument } from '../text/TextDocument';

/** A per-workspace symbol source. Registered through the host registry; consumed by the pane. */
export interface StructureSource {
  /** True when this source can answer for the document — MUST be cheap and MUST NOT start a
   *  server or any other process; it is asked on ordinary pane refreshes. */
  supportsDocument(document: StructureDocument): boolean;
  /** The document's outline, `null` when this source cannot answer for it right now. */
  documentSymbols(
    document: StructureDocument,
  ): Promise<StructureOutlineResult | null>;
  /** A user-facing reason the source declines this document (e.g. a size budget), else null. */
  structureNotice(document: StructureDocument): string | null;
}

/** The document a structure question is about — the same live text document the editor shows. */
export type StructureDocument = InstanceType<typeof TextDocument.Class>;

/** One symbol in a document's outline, positioned in editor coordinates (grapheme columns). */
export interface StructureSymbol {
  readonly name: string;
  /** The theme's symbol-class vocabulary, so the one mark table resolves this row's icon. */
  readonly symbolClass: SymbolClass;
  /** Source-level member visibility. Null means this symbol is not a class member. */
  readonly visibility?: StructureMemberVisibility | null;
  /** True for an ivue `$`-cache member. */
  readonly cached?: boolean;
  /** True when this member replaces a member inherited from a parent class. */
  readonly override?: boolean;
  /** Accessor syntax, distinct from methods and fields. */
  readonly accessor?: StructureAccessorKind | null;
  /** 0-based document line of the symbol's name (its selection anchor — where a jump lands). */
  readonly line: number;
  /** Grapheme column of the symbol's name on `line`. */
  readonly column: number;
  /** Last 0-based line of the symbol's full extent (body included). */
  readonly endLine: number;
  readonly children: readonly StructureSymbol[];
}

/** A full outline answer. `truncated` is true when the source capped the symbol count, so the
 *  pane can SAY the outline is partial instead of silently presenting a shorter document. */
export interface StructureOutlineResult {
  readonly symbols: readonly StructureSymbol[];
  readonly truncated: boolean;
}

export type StructureMemberVisibility = 'public' | 'protected' | 'private';

export type StructureAccessorKind = 'getter' | 'setter';
