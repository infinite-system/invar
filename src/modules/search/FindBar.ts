// The in-editor find/replace bar's VIEW STATE (Ctrl+F / Ctrl+H). It owns the open/mode/focused-field
// state and composes the pure FindInBuffer engine (search + replace over the active document). It never
// touches the editor's cursor/scroll — revealing a match is the caller's job (the one writer of the
// editor selection), so this stays a pure overlay model like the command palette.
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type { TextDocument } from '../text/TextDocument';
import type { TextInputAction, TextInputModel } from '../text/TextInputModel';
import { FindInBuffer, type FindInBufferMatch } from './FindInBuffer';
import type {
  TextEdit,
  TextEditBatchMetadata,
} from '../text/TextEdit.interface';

// invariant: Editable text fields share one input model (project.invariants.md)
class $FindBar {
  // invariant: Markdown panes keep independent find state (src/modules/markdown/markdown.invariants.md)
  // invariant: Diff panes keep independent find state (src/modules/diff/diff.invariants.md)
  protected readonly enginesByTargetIdentifier = new Map<
    string,
    FindInBuffer.Instance
  >();
  protected readonly documentIdentifiers = new WeakMap<object, string>();
  protected nextDocumentIdentifier = 0;

  get open() {
    return ref(false);
  }
  get mode() {
    return ref<FindBarMode>('find');
  }
  // In replace mode the input focus toggles (Tab) between the query and the replacement field.
  get replaceFocused() {
    return ref(false);
  }
  get engineRef() {
    return shallowRef<FindInBuffer.Instance | null>(null);
  }
  get targetRef() {
    return shallowRef<FindBarTarget | null>(null);
  }
  get bulkFlowState() {
    return ref<FindBarBulkFlowState>('ready');
  }
  get engine(): FindInBuffer.Instance | null {
    return this.engineRef.value;
  }
  get target(): FindBarTarget | null {
    return this.targetRef.value;
  }

  protected createEngine(document: TextDocument.Instance) {
    return new FindInBuffer.Class(document);
  }

  /** Open (or re-open) the bar over the ACTIVE document; a document swap makes a fresh engine so the
   *  matches are always the current buffer's. Seeds matches immediately so a count shows at once. */
  openFor(document: TextDocument.Instance, mode: FindBarMode): void {
    let identifier = this.documentIdentifiers.get(document as object);
    if (!identifier) {
      identifier = `document-${++this.nextDocumentIdentifier}`;
      this.documentIdentifiers.set(document as object, identifier);
    }
    this.openForTarget(
      {
        identifier,
        document,
        replaceAllowed: true,
        displayPath: document.path,
        revealMatch: () => {},
      },
      mode,
    );
  }

  /** Bind the bar to one pane without discarding any other pane's query or matches. */
  openForTarget(target: FindBarTarget, mode: FindBarMode): void {
    let engine = this.enginesByTargetIdentifier.get(target.identifier);
    if (!engine || engine.document !== target.document) {
      engine = this.createEngine(target.document);
      this.enginesByTargetIdentifier.set(target.identifier, engine);
    }
    this.engineRef.value = engine;
    this.targetRef.value = target;
    this.open.value = true;
    this.mode.value = target.replaceAllowed ? mode : 'find';
    this.replaceFocused.value = false;
    this.engine?.findAll();
  }

  /** Read a pane's retained engine so its highlights remain visible while another pane is searched. */
  engineFor(targetIdentifier: string): FindInBuffer.Instance | null {
    return this.enginesByTargetIdentifier.get(targetIdentifier) ?? null;
  }

  close(): void {
    this.open.value = false;
    this.replaceFocused.value = false;
    this.bulkFlowState.value = 'ready';
  }

  /** True while typing should edit the REPLACEMENT field (replace mode + that field focused). */
  protected get editingReplacement(): boolean {
    return this.mode.value === 'replace' && this.replaceFocused.value;
  }
  get focusedInput(): TextInputModel.Model | null {
    const engine = this.engine;
    if (!engine) return null;
    return this.editingReplacement
      ? engine.replacementInput
      : engine.queryInput;
  }

  append(character: string): void {
    const engine = this.engine;
    const input = this.focusedInput;
    if (!engine || !input || !input.insert(character)) return;
    if (!this.editingReplacement) engine.findAll();
  }

  applyInputAction(action: TextInputAction): void {
    const engine = this.engine;
    const input = this.focusedInput;
    if (!engine || !input) return;
    const originalText = input.value;
    input.apply(action);
    if (!this.editingReplacement && input.value !== originalText) {
      engine.findAll();
    }
  }

  copyInputSelection(): Promise<number> {
    return this.focusedInput?.copySelection() ?? Promise.resolve(0);
  }

  /** Tab switches which field types (replace mode only). */
  switchField(): void {
    if (this.mode.value === 'replace')
      this.replaceFocused.value = !this.replaceFocused.value;
  }

  /** True while the active engine matches case exactly — read by the renderer for the toggle state. */
  get caseSensitive(): boolean {
    return this.engine?.caseSensitive.value ?? false;
  }
  get wholeWord(): boolean {
    return this.engine?.wholeWord.value ?? false;
  }
  get useRegex(): boolean {
    return this.engine?.useRegex.value ?? false;
  }

  /** Flip case-sensitivity on the active engine and re-run the query so matches reflect it at once. */
  // invariant: Find options re-run the active query (src/modules/search/search.invariants.md)
  toggleCaseSensitive(): void {
    const engine = this.engine;
    if (!engine) return;
    engine.caseSensitive.value = !engine.caseSensitive.value;
    engine.findAll();
  }

  toggleWholeWord(): void {
    const engine = this.engine;
    if (!engine) return;
    engine.wholeWord.value = !engine.wholeWord.value;
    engine.findAll();
  }

  toggleRegex(): void {
    const engine = this.engine;
    if (!engine) return;
    engine.useRegex.value = !engine.useRegex.value;
    engine.findAll();
  }

  /** Switch between find and replace modes (only where the bound pane allows replacement) — the mode
   *  toggle button. Leaving replace mode returns typing focus to the query field. */
  switchMode(): void {
    if (!this.target?.replaceAllowed) return;
    this.mode.value = this.mode.value === 'find' ? 'replace' : 'find';
    if (this.mode.value === 'find') this.replaceFocused.value = false;
  }

  next(): void {
    this.engine?.next();
  }
  previous(): void {
    this.engine?.previous();
  }
  replaceCurrent(): void {
    const engine = this.engine;
    const target = this.target;
    if (!engine || !target?.applyTextEditsAsUndoStep) return;
    const edit = engine.replaceCurrent();
    if (!edit) return;
    target.applyTextEditsAsUndoStep([edit], {
      label: 'Replace in file',
      bulkItemCount: 1,
      displayPath: target.displayPath,
    });
    this.engine.findAll(); // the document changed — re-derive matches + counts
  }

  replaceAll(): FindBarReplaceAllRequest | null {
    const engine = this.engine;
    const target = this.target;
    if (
      !engine ||
      !target?.applyTextEditsAsUndoStep ||
      this.bulkFlowState.value !== 'ready'
    ) {
      return null;
    }
    this.bulkFlowState.value = 'verifying';
    const edits = engine.replaceAll();
    if (edits.length === 0) {
      this.bulkFlowState.value = 'ready';
      return null;
    }
    const request = {
      edits,
      metadata: {
        label: 'Replace All in file',
        bulkItemCount: edits.length,
        displayPath: target.displayPath,
      },
    } satisfies FindBarReplaceAllRequest;
    this.bulkFlowState.value = 'awaitingConsent';
    return request;
  }

  applyReplaceAll(request: FindBarReplaceAllRequest): number {
    const target = this.target;
    if (
      !target?.applyTextEditsAsUndoStep ||
      this.bulkFlowState.value !== 'awaitingConsent'
    ) {
      return 0;
    }
    this.bulkFlowState.value = 'applying';
    const appliedCount = target.applyTextEditsAsUndoStep(
      request.edits,
      request.metadata,
    );
    this.engine?.findAll();
    this.bulkFlowState.value = 'ready';
    return appliedCount;
  }

  cancelReplaceAll(): void {
    this.bulkFlowState.value = 'ready';
  }
}

export namespace FindBar {
  export const $Class = $FindBar;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export type FindBarMode = 'find' | 'replace';

export type FindBarBulkFlowState =
  'ready' | 'verifying' | 'awaitingConsent' | 'applying';

export interface FindBarReplaceAllRequest {
  readonly edits: readonly TextEdit[];
  readonly metadata: TextEditBatchMetadata;
}

/** One independently searchable text pane. The identifier preserves its query/matches while focus
 * moves to another pane; revealMatch is the pane's sole scroll/selection writer. */
export interface FindBarTarget {
  identifier: string;
  document: TextDocument.Instance;
  replaceAllowed: boolean;
  displayPath: string;
  applyTextEditsAsUndoStep?(
    edits: readonly TextEdit[],
    metadata: TextEditBatchMetadata,
  ): number;
  revealMatch(match: FindInBufferMatch): void;
}
