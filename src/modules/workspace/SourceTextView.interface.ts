// The source-text view seam: what a workspace buffer's VIEW is, stated without naming the class
// that implements it. A workspace buffer is a DOCUMENT (`src/modules/text/TextDocument`, held by
// the stable `DocumentHandle`) plus a view over it. The document answers language questions —
// sync, hover, completion, go-to-definition — and outlives nothing; the view carries cursor,
// scroll, folding, and the edit commands, and is disposed and rebuilt by the flyweight.
//
// The host owns this contract and never constructs its implementation. `src/modules/editor/`
// supplies the one implementation today through `SourceTextViewProvider`, the same way
// `PaneContent` is supplied by whatever occupies a pane. A second source-text view (a
// scratch buffer, a remote buffer) is a second provider, not an edit here.
//
// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
import type { Ref } from 'vue';
import type { TextChunk } from '@opentui/core';
import type { TextDocument } from '../text/TextDocument';
import type { TextCursor } from '../text/TextCursor';
import type { TextViewport } from '../text/TextViewport';
import type {
  DocumentFoldRange,
  DocumentFoldState,
} from '../text/DocumentFoldState.interface';
import type { LiveBuffer } from './OpenBufferSet';
import type {
  LanguageCompletionItem,
  LanguageRange,
} from './LanguageProvider.interface';
import type { DocumentSyntaxReader } from '../syntax/DocumentSyntaxSource.interface';
import type {
  TextEdit,
  TextEditBatchMetadata,
} from '../text/TextEdit.interface';

export interface SourceTextView extends LiveBuffer {
  // --- the document and the view state over it ---------------------------
  readonly document: TextDocument.Model;
  /** False for the document-less view behind an empty tab strip. */
  readonly hasDocument: Ref<boolean>;
  readonly readOnly: Ref<boolean>;
  readonly cursor: TextCursor.Model;
  readonly viewport: TextViewport.Instance;
  readonly hasSelection: boolean;
  /** A contributed tab/status title for this view, or its own. */
  readonly title: string;

  // --- attached global preferences and per-document fold state -----------
  /** Word wrap is one GLOBAL preference every view reads, so tabs never disagree. */
  attachWordWrap(source: Ref<boolean>): void;
  readonly wordWrap: Ref<boolean>;
  attachCodeFolding(source: Ref<boolean>): void;
  attachDocumentSyntax(source: DocumentSyntaxReader): void;
  readonly codeFoldingEnabled: boolean;
  /** Adopt the fold state persisted beside the document, so collapsed regions survive this view. */
  attachFoldState(foldState: DocumentFoldState): void;
  readonly foldState: Ref<DocumentFoldState>;
  readonly foldRevision: Ref<number>;
  readonly collapsedFoldRanges: readonly DocumentFoldRange[];
  foldStartsAtLine(lineIndex: number): boolean;
  toggleFoldAtLine(lineIndex: number): boolean;
  foldAtCursor(): void;
  unfoldAtCursor(): void;

  // --- wrapped-view geometry ---------------------------------------------
  wrapWidth(): number;
  /** The wrap column when wrapping, else null — the one question a scrollbar asks. */
  visualWrapWidth(): number | null;
  totalVisualRows(): number;
  /** The logical document line currently at the top of the visual-row viewport. */
  lineAtViewportTop(): number;
  /** Place a logical document line at the viewport top without moving the cursor. */
  scrollLineToViewportTop(lineIndex: number): void;
  toggleWordWrap(): void;

  // --- movement and selection --------------------------------------------
  placeCursor(lineIndex: number, graphemeColumn: number): void;
  revealCursor(): void;
  moveHorizontal(delta: number, extend?: boolean): void;
  moveVertical(delta: number, extend?: boolean): void;
  moveWordHorizontal(direction: -1 | 1, extend?: boolean): void;
  moveToLineStart(extend?: boolean): void;
  moveToLineEnd(extend?: boolean): void;
  moveDocumentStart(extend?: boolean): void;
  moveDocumentEnd(extend?: boolean): void;
  pageUp(extend?: boolean): void;
  pageDown(extend?: boolean): void;
  gotoTop(extend?: boolean): void;
  gotoBottom(extend?: boolean): void;
  selectAll(): void;
  selectWord(lineIndex: number, graphemeColumn: number): void;
  selectLine(lineIndex: number): void;

  // --- editing ------------------------------------------------------------
  insertText(text: string): void;
  insertNewline(): void;
  backspace(): void;
  deleteChar(): void;
  deletePreviousWord(): void;
  deleteToLineStart(): void;
  duplicateLine(): void;
  moveLineUp(): void;
  moveLineDown(): void;
  indent(): void;
  outdent(): void;
  pasteText(text: string): void;
  pasteClipboard(): Promise<void>;
  cutSelection(): Promise<void>;
  copySelection(): Promise<number>;
  applyCompletion(
    item: LanguageCompletionItem,
    fallbackRange: LanguageRange,
  ): void;
  replaceRangeAsUndoStep(range: LanguageRange, replacementText: string): void;
  applyTextEditsAsUndoStep(
    edits: readonly TextEdit[],
    metadata: TextEditBatchMetadata,
  ): number;
  readonly nextUndoMetadata: TextEditBatchMetadata | null;
  readonly nextRedoMetadata: TextEditBatchMetadata | null;
  performUndo(): void;
  performRedo(): void;
  save(): boolean;

  // --- lifetime -----------------------------------------------------------
  dispose(): void;
}

/**
 * The one seam through which a workspace obtains source-text views. It is per workspace, because
 * its contribution registry is per workspace. The workspace calls it and never learns what came
 * back.
 */
export interface SourceTextViewProvider {
  /** A fresh view with no document open. The caller attaches sources and opens the file. */
  createView(): SourceTextView;
  /** The registry that view contributions attach to for every view this provider makes. */
  readonly contributions: SourceTextViewContributions;
}

/** The per-workspace registry of things that decorate or observe every source-text view. */
export interface SourceTextViewContributions {
  readonly contributionCount: number;
  register(contribution: SourceTextViewContribution): () => void;
  lineEndChunks(view: SourceTextView, lineIndex: number): TextChunk[];
  title(view: SourceTextView): SourceTextViewContributionTitle | null;
}

/** One decorator or observer of every source-text view in a workspace. */
export interface SourceTextViewContribution {
  attached?(view: SourceTextView): void;
  detached?(view: SourceTextView): void;
  recordTyping?(
    view: SourceTextView,
    firstEditedLine: number,
    lastEditedLine: number,
  ): void;
  recordOrdinaryEdit?(view: SourceTextView): void;
  lineEndChunks?(view: SourceTextView, lineIndex: number): TextChunk[];
  title?(view: SourceTextView): SourceTextViewContributionTitle | null;
}

/** A contributed replacement for the view's own title, with the colour it is drawn in. */
export interface SourceTextViewContributionTitle {
  text: string;
  color: string;
}
