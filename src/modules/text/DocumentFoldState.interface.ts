// Which regions of one document are collapsed, in DOCUMENT coordinates only.
//
// Fold state is DOCUMENT-ADJACENT PERSISTENCE, not a view property. It hangs off the stable
// `DocumentHandle`, so a collapsed region survives the flyweight disposing and rebuilding the view
// that showed it. A fold addressed by document line start needs no geometry: no wrap width, no
// scroll offset, no visual row. That is why the type lives beside the document rather than beside
// the source-text view, and why a view ATTACHES to a fold state it does not own.
//
// invariant: Document identity survives document instance replacement (src/modules/workspace/workspace.invariants.md)

export interface DocumentFoldState {
  /** The first document line of each collapsed region. */
  readonly collapsedLineStarts: Set<number>;
}

/** One foldable region of a document, in document line numbers. */
export interface DocumentFoldRange {
  readonly startLine: number;
  readonly endLine: number;
  readonly kind: 'delimiter' | 'indentation';
}
