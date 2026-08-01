// The per-workspace outline model: the active document's symbol tree, flattened to navigable rows,
// with the selection, scroll, and honest empty states the pane paints. It asks the registered
// StructureSource; it never names a provider.
//
// COST TRACKS WHAT IS OBSERVED. A source request happens only while the pane is observed (visible,
// active content, active workspace) and only when the observed document's identity or revision
// changed — edits coalesce through one debounce, mirroring the diagnostics pull windows. A hidden
// pane costs zero requests at any file size. `requestCount` publishes the load-invariant count of
// requests so a smoke can assert the cost, not a wall-clock.
//
// STALENESS. Responses are generation- and revision-guarded: a result for a superseded request, a
// replaced document, or an advanced revision is discarded, and the rows keep showing the last
// honest answer until the newer request lands.
//
// invariant: Outline cost tracks the observed document (src/modules/structure/structure.invariants.md)
// invariant: A structure source answers or declines, never blanks (src/modules/structure/structure.invariants.md)
// invariant: Outline labels expose source semantics (src/modules/structure/structure.invariants.md)
// invariant: The outline projection has one depth and filter policy (src/modules/structure/structure.invariants.md)
// invariant: Symbol selection jumps through the source-text view contract (src/modules/structure/structure.invariants.md)
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import { CommandScoring } from '../commands/CommandScoring';
import { Momentum } from '../system/Momentum';
import { TextInputModel, type TextInputAction } from '../text/TextInputModel';
import type { Workspace } from '../workspace/Workspace';
import type { SymbolClass } from '../theme/ThemeIcons';
import type {
  StructureAccessorKind,
  StructureDocument,
  StructureMemberVisibility,
  StructureOutlineResult,
  StructureSource,
  StructureSymbol,
} from './StructureSource.interface';

class $StructureOutline {
  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;

  /** Rapid edits coalesce to one request this long after the last keystroke (the diagnostics
   *  change-window precedent). */
  protected static get EDIT_REFRESH_DELAY_MILLISECONDS(): number {
    return 350;
  }

  /** A document/observation change refreshes almost immediately (off the sync microtask). */
  protected static get SWITCH_REFRESH_DELAY_MILLISECONDS(): number {
    return 30;
  }

  constructor(
    protected readonly workspace: Workspace.Model,
    protected readonly isObserved: () => boolean,
    protected readonly defaultDepth: () => number = () => 1,
  ) {
    this.filterInput = this.createFilterInput();
    this.disposeDocumentLifecycle = workspace.documentLifecycle.register({
      opened: () => {},
      becameActive: () => this.scheduleRefresh(this.switchRefreshDelay),
      closed: () => this.scheduleRefresh(this.switchRefreshDelay),
    });
    // The one reactive trigger: observation, document identity, document revision, and source
    // installation all funnel into the same debounced refresh. IMMEDIATE: the outline can be
    // constructed after the boot state has already settled (document open, pane revealed by the
    // default-visibility policy), so the initial fingerprint is already the final one and no
    // change would ever fire — the immediate call schedules the first honest refresh, and it
    // stays free when unobserved because refresh() itself gates on observation.
    this.$watch(
      () => this.refreshFingerprint,
      (_fingerprint, previousFingerprint) => {
        const revisionOnly =
          typeof previousFingerprint === 'string' &&
          this.fingerprintWithoutRevision(_fingerprint) ===
            this.fingerprintWithoutRevision(previousFingerprint);
        this.scheduleRefresh(
          revisionOnly ? this.editRefreshDelay : this.switchRefreshDelay,
        );
      },
      { immediate: true },
    );
  }

  protected disposeDocumentLifecycle: (() => void) | null = null;
  protected refreshTimer: ReturnType<typeof setTimeout> | null = null;
  protected requestGeneration = 0;
  protected sourceRows: readonly StructureRow[] = [];
  protected projectedDocumentPath = '';
  protected readonly depthOverrides = new Map<string, number>();
  protected readonly expandedRowsByDocument = new Map<string, Set<string>>();
  protected readonly collapsedRowsByDocument = new Map<string, Set<string>>();

  readonly filterInput: TextInputModel.Model;

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createFilterInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  get rows() {
    return shallowRef<readonly StructureRow[]>([]);
  }

  get status() {
    return ref<StructureOutlineStatus>('no-document');
  }

  /** The stated reason rows are absent (or partial) — painted by the pane, never a blank. */
  get notice() {
    return ref<string | null>(null);
  }

  get truncated() {
    return ref(false);
  }

  get selectedIndex() {
    return ref(0);
  }

  get hoveredIndex() {
    return ref(-1);
  }

  get scrollTop() {
    return ref(0);
  }

  get viewportHeight() {
    return ref(1);
  }

  get viewportWidth() {
    return ref(1);
  }

  /** Load-invariant count of source requests issued — a count of work, never a wall-clock. */
  get requestCount() {
    return ref(0);
  }

  /** Bumped whenever the paintable rows change, for the pane's renderRevision. */
  get version() {
    return ref(0);
  }

  get scrollMomentum() {
    return shallowRef(Momentum.Class.halt());
  }

  protected get editRefreshDelay(): number {
    const outlineClass = this.constructor as typeof $StructureOutline;
    return outlineClass.EDIT_REFRESH_DELAY_MILLISECONDS;
  }

  protected get switchRefreshDelay(): number {
    const outlineClass = this.constructor as typeof $StructureOutline;
    return outlineClass.SWITCH_REFRESH_DELAY_MILLISECONDS;
  }

  /** The active document while a request could be about it. */
  protected get activeDocument(): StructureDocument | null {
    const document = this.workspace.activeDocumentHandle?.document ?? null;
    if (!document || !document.path) return null;
    return document;
  }

  /** Everything a refresh depends on, as one comparable string. */
  protected get refreshFingerprint(): string {
    const document = this.activeDocument;
    return [
      this.isObserved() ? 'observed' : 'hidden',
      document?.path ?? '',
      this.workspace.providers.revision.value,
      document?.revision.value ?? -1,
    ].join(':');
  }

  protected fingerprintWithoutRevision(fingerprint: string): string {
    return fingerprint.slice(0, fingerprint.lastIndexOf(':'));
  }

  protected scheduleRefresh(delayMilliseconds: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, delayMilliseconds);
  }

  /** Ask the registered source about the observed document. Public so a command can force it. */
  async refresh(): Promise<void> {
    const generation = ++this.requestGeneration;
    if (!this.isObserved()) return;
    const document = this.activeDocument;
    if (!document) {
      this.selectProjectedDocument('');
      this.applyEmpty('no-document', null);
      return;
    }
    this.selectProjectedDocument(document.path);
    const sources =
      this.workspace.providers.resolveAll<StructureSource>('structure');
    if (sources.length === 0) {
      this.applyEmpty(
        'unavailable',
        'No structure source is installed. ' +
          'Enable Language Intelligence in Extensions (Ctrl+Shift+X).',
      );
      return;
    }
    // Sources answer per file type (LSP symbols for ts/js, markdown headings for .md), so the
    // outline asks the NEWEST registration that supports this document — the same
    // last-registration-wins substitution rule `resolve` applies, restricted to the sources
    // that answer at all.
    const source = this.sourceForDocument(sources, document);
    if (!source) {
      this.applyEmpty(
        'unavailable',
        'No installed source answers for this file type.',
      );
      return;
    }
    const revision = document.revision.value;
    this.status.value = 'loading';
    this.requestCount.value++;
    let result: StructureOutlineResult | null = null;
    try {
      result = await source.documentSymbols(document);
    } catch {
      result = null;
    }
    if (generation !== this.requestGeneration) return;
    if (
      this.activeDocument !== document ||
      document.revision.value !== revision
    ) {
      // Stale answer: keep the last honest rows; the fingerprint watch has already
      // scheduled the refresh that will replace them.
      return;
    }
    if (result === null) {
      this.applyEmpty(
        'unavailable',
        source.structureNotice(document) ??
          'The structure source cannot answer for this file right now.',
      );
      return;
    }
    this.applyResult(result);
  }

  /** The newest-registered source that supports the document, or null when none answers. */
  protected sourceForDocument(
    sources: readonly StructureSource[],
    document: StructureDocument,
  ): StructureSource | null {
    for (let index = sources.length - 1; index >= 0; index--) {
      const candidate = sources[index];
      if (candidate && candidate.supportsDocument(document)) return candidate;
    }
    return null;
  }

  protected applyEmpty(
    status: Exclude<StructureOutlineStatus, 'ready' | 'loading'>,
    notice: string | null,
  ): void {
    this.sourceRows = [];
    this.rows.value = [];
    this.status.value = status;
    this.notice.value = notice;
    this.truncated.value = false;
    this.selectedIndex.value = 0;
    this.scrollTop.value = 0;
    this.version.value++;
  }

  protected applyResult(result: StructureOutlineResult): void {
    const rows: StructureRow[] = [];
    this.flattenInto(rows, result.symbols, 0, []);
    this.sourceRows = rows;
    this.status.value = 'ready';
    this.truncated.value = result.truncated;
    this.notice.value = result.truncated
      ? 'The outline is truncated — the source capped the symbol count.'
      : null;
    this.reproject();
  }

  protected selectProjectedDocument(documentPath: string): void {
    if (documentPath === this.projectedDocumentPath) return;
    this.projectedDocumentPath = documentPath;
    this.filterInput.clear();
  }

  protected flattenInto(
    rows: StructureRow[],
    symbols: readonly StructureSymbol[],
    depth: number,
    ancestorKeys: readonly string[],
  ): void {
    // Source order is document order for every real server; sort defensively so keyboard
    // navigation always walks downward through the file.
    const ordered = [...symbols].sort(
      (first, second) =>
        first.line - second.line || first.column - second.column,
    );
    for (const symbol of ordered) {
      const key = [
        symbol.line,
        symbol.column,
        symbol.endLine,
        symbol.name,
      ].join(':');
      rows.push({
        key,
        ancestorKeys,
        depth,
        name: symbol.name,
        symbolClass: symbol.symbolClass,
        visibility: symbol.visibility,
        cached: symbol.cached,
        override: symbol.override,
        accessor: symbol.accessor,
        line: symbol.line,
        column: symbol.column,
        endLine: symbol.endLine,
        hasChildren: symbol.children.length > 0,
        childrenVisible: false,
      });
      this.flattenInto(rows, symbol.children, depth + 1, [
        ...ancestorKeys,
        key,
      ]);
    }
  }

  protected get activeDocumentPath(): string {
    return this.activeDocument?.path ?? '';
  }

  get depth(): number {
    return (
      this.depthOverrides.get(this.activeDocumentPath) ??
      this.clampedDepth(this.defaultDepth())
    );
  }

  get depthIsOverridden(): boolean {
    return this.depthOverrides.has(this.activeDocumentPath);
  }

  protected clampedDepth(depth: number): number {
    return Math.max(0, Math.min(8, Math.round(depth)));
  }

  protected rowKeysFor(rowsByDocument: Map<string, Set<string>>): Set<string> {
    const documentPath = this.activeDocumentPath;
    let rowKeys = rowsByDocument.get(documentPath);
    if (!rowKeys) {
      rowKeys = new Set<string>();
      rowsByDocument.set(documentPath, rowKeys);
    }
    return rowKeys;
  }

  protected childrenAreVisible(
    row: StructureRow,
    depth: number,
    expandedRows: ReadonlySet<string>,
    collapsedRows: ReadonlySet<string>,
  ): boolean {
    if (!row.hasChildren || !row.key || collapsedRows.has(row.key)) {
      return false;
    }
    return row.depth < depth || expandedRows.has(row.key);
  }

  protected rowIsVisible(
    row: StructureRow,
    depth: number,
    sourceRowsByKey: ReadonlyMap<string, StructureRow>,
    expandedRows: ReadonlySet<string>,
    collapsedRows: ReadonlySet<string>,
  ): boolean {
    for (const ancestorKey of row.ancestorKeys ?? []) {
      const ancestor = sourceRowsByKey.get(ancestorKey);
      if (
        !ancestor ||
        !this.childrenAreVisible(ancestor, depth, expandedRows, collapsedRows)
      ) {
        return false;
      }
    }
    return true;
  }

  refreshProjection(): void {
    this.reproject();
  }

  protected reproject(): void {
    const depth = this.depth;
    const expandedRows = this.rowKeysFor(this.expandedRowsByDocument);
    const collapsedRows = this.rowKeysFor(this.collapsedRowsByDocument);
    const sourceRowsByKey = new Map(
      this.sourceRows.flatMap((row) => (row.key ? [[row.key, row]] : [])),
    );
    const depthRows = this.sourceRows
      .filter((row) =>
        this.rowIsVisible(
          row,
          depth,
          sourceRowsByKey,
          expandedRows,
          collapsedRows,
        ),
      )
      .map((row) => ({
        ...row,
        childrenVisible: this.childrenAreVisible(
          row,
          depth,
          expandedRows,
          collapsedRows,
        ),
      }));
    const query = this.filterInput.value.trim();
    if (query.length === 0) {
      this.rows.value = depthRows;
    } else {
      this.rows.value = this.sourceRows
        .map((row) => ({
          row,
          score: CommandScoring.Class.fuzzyScore(query, row.name),
        }))
        .filter((match) => match.score >= 0)
        .sort(
          (first, second) =>
            first.score - second.score ||
            first.row.line - second.row.line ||
            first.row.column - second.row.column,
        )
        .map(({ row }) => ({ ...row, childrenVisible: false }));
    }
    this.selectedIndex.value = Math.min(
      this.selectedIndex.value,
      Math.max(0, this.rows.value.length - 1),
    );
    this.clampScroll();
    this.version.value++;
  }

  applyFilterInputAction(action: TextInputAction): void {
    const originalFilter = this.filterInput.value;
    const actionChangedState = this.filterInput.apply(action);
    if (this.filterInput.value !== originalFilter) {
      this.selectedIndex.value = 0;
      this.scrollTop.value = 0;
      this.reproject();
    } else if (actionChangedState) {
      this.version.value++;
    }
  }

  insertFilterText(text: string): void {
    if (!this.filterInput.insert(text)) return;
    this.selectedIndex.value = 0;
    this.scrollTop.value = 0;
    this.reproject();
  }

  clearFilter(): boolean {
    if (this.filterInput.isEmpty) return false;
    this.filterInput.clear();
    this.selectedIndex.value = 0;
    this.scrollTop.value = 0;
    this.reproject();
    return true;
  }

  toggleSelectedFold(): boolean {
    if (!this.filterInput.isEmpty) return false;
    const row = this.rows.value[this.selectedIndex.value];
    if (!row?.hasChildren || !row.key) return false;
    const expandedRows = this.rowKeysFor(this.expandedRowsByDocument);
    const collapsedRows = this.rowKeysFor(this.collapsedRowsByDocument);
    if (row.childrenVisible) {
      expandedRows.delete(row.key);
      collapsedRows.add(row.key);
    } else {
      collapsedRows.delete(row.key);
      expandedRows.add(row.key);
    }
    this.reproject();
    return true;
  }

  setDepthForActiveFile(depth: number): void {
    const documentPath = this.activeDocumentPath;
    if (!documentPath) return;
    this.depthOverrides.set(documentPath, this.clampedDepth(depth));
    this.selectedIndex.value = 0;
    this.scrollTop.value = 0;
    this.reproject();
  }

  adjustDepthForActiveFile(delta: number): void {
    this.setDepthForActiveFile(this.depth + delta);
  }

  resetDepthForActiveFile(): void {
    if (!this.depthOverrides.delete(this.activeDocumentPath)) return;
    this.selectedIndex.value = 0;
    this.scrollTop.value = 0;
    this.reproject();
  }

  moveSelection(delta: number): void {
    const rowCount = this.rows.value.length;
    if (rowCount === 0) return;
    this.selectedIndex.value = Math.max(
      0,
      Math.min(rowCount - 1, this.selectedIndex.value + delta),
    );
    this.revealSelection();
  }

  setSelection(index: number): void {
    const rowCount = this.rows.value.length;
    if (index < 0 || index >= rowCount) return;
    this.selectedIndex.value = index;
  }

  /** Keep the selected row inside the viewport window. */
  protected revealSelection(): void {
    const viewportRows = Math.max(1, this.viewportHeight.value);
    const selected = this.selectedIndex.value;
    if (selected < this.scrollTop.value) {
      this.scrollTop.value = selected;
    } else if (selected >= this.scrollTop.value + viewportRows) {
      this.scrollTop.value = selected - viewportRows + 1;
    }
    this.clampScroll();
  }

  scrollBy(deltaRows: number): void {
    this.scrollTop.value += deltaRows;
    this.clampScroll();
  }

  protected clampScroll(): void {
    const maximumTop = Math.max(
      0,
      this.rows.value.length - Math.max(1, this.viewportHeight.value),
    );
    this.scrollTop.value = Math.max(
      0,
      Math.min(maximumTop, Math.round(this.scrollTop.value)),
    );
  }

  /** The visible window's first row index. */
  windowTop(): number {
    return this.scrollTop.value;
  }

  /**
   * Jump the editor to the selected symbol through the source-text view contract: record the
   * departure, place the cursor on the symbol's name, reveal it, focus the editor, record the
   * landing — the same before/after recording `goToDefinition` performs.
   */
  activateSelected(): boolean {
    const row = this.rows.value[this.selectedIndex.value];
    if (!row) return false;
    const workspace = this.workspace;
    workspace.recordCurrentViewState();
    workspace.revealSourceLocation(row.line, row.column);
    workspace.focusEditor();
    workspace.recordCurrentViewState();
    return true;
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.requestGeneration++;
    this.disposeDocumentLifecycle?.();
    this.disposeDocumentLifecycle = null;
    this.$stopEffects();
  }
}

export namespace StructureOutline {
  export const $Class = $StructureOutline;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

/** One flattened, paintable outline row. */
export interface StructureRow {
  readonly key?: string;
  readonly ancestorKeys?: readonly string[];
  readonly depth: number;
  readonly name: string;
  readonly symbolClass: SymbolClass;
  readonly visibility?: StructureMemberVisibility | null;
  readonly cached?: boolean;
  readonly override?: boolean;
  readonly accessor?: StructureAccessorKind | null;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly hasChildren?: boolean;
  readonly childrenVisible?: boolean;
}

/** The pane's honest states. `unavailable` always carries a stated reason, never a blank. */
export type StructureOutlineStatus =
  'no-document' | 'unavailable' | 'loading' | 'ready';
