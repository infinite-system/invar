import { Reactive } from 'ivue';
import { ref, shallowRef, type Ref } from 'vue';
import { Editor } from '../editor/Editor';
import { OpenBufferSet } from './OpenBufferSet';
import {
  NavigationHistory,
  type Location,
} from '../navigation/NavigationHistory';
import { Files } from '../system/Files';
import { ImageDecoders } from '../image/ImageDecoders';
import { Momentum, type MomentumOptions } from '../system/Momentum';
import type { Settings } from '../settings/Settings';
import {
  type LanguageCompletionContext,
  type LanguageCompletionList,
  type LanguageHover,
  type LanguageLocation,
  type LanguageHoverDiagnostic,
  type LanguagePosition,
  type LanguageProvider,
} from './LanguageProvider.interface';
import { fileURLToPath } from 'node:url';
import { DocumentLifecycle } from './DocumentLifecycle';
import { EditorSurfaceClaims } from './EditorSurfaceClaims';
import { GutterDecorations } from './GutterDecorations';
import type { DocumentHandle } from './DocumentHandle';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
  WorkspaceProvider,
} from './WorkspaceContributor.interface';
import { EditorContributions } from '../editor/EditorContributions';

// A workspace: one project root with its editor, documents, and generic contribution lifecycle.
// WorkspaceSet layers project tabs and flyweight activation over this per-root core.
//
// invariant: Workspace and file navigation are separate layers (workspace.invariants.md)

class $Workspace {
  constructor(protected readonly options: WorkspaceOptions = {}) {
    for (const contributor of options.contributors ?? []) {
      this.registerContributor(contributor);
    }
  }

  root = '';
  // The set of open editor buffers behind the tab bar (item 10a): opening a file ADDS or FOCUSES a
  // tab, never replaces. Flyweight — a bounded recent set (and any dirty background buffer) holds
  // live documents; older clean tabs dehydrate to a light handle and rehydrate on activation.
  buffers = this.createBufferSet();
  editorContributions = new EditorContributions.Class();
  documentLifecycle = new DocumentLifecycle.Class();
  gutterDecorations = new GutterDecorations.Class();
  // Contributions claim the editor surface here and the host asks them capability questions. It
  // never learns which surface is up.
  editorSurfaces = new EditorSurfaceClaims.Class();
  protected readonly contributions: WorkspaceContribution[] = [];
  protected readonly contributorDisposers = new Map<
    WorkspaceContributor,
    () => void
  >();
  protected resourcesSuspended = false;

  registerContributor(contributor: WorkspaceContributor): () => void {
    const existingDisposer = this.contributorDisposers.get(contributor);
    if (existingDisposer) return existingDisposer;
    const contribution = contributor.attachWorkspace(
      this as unknown as Workspace.Model,
    );
    this.contributions.push(contribution);
    if (this.settingsSource) {
      contribution.settingsAttached?.(this.settingsSource);
    }
    if (this.root) {
      contribution.opened(this.root);
      if (this.resourcesSuspended) contribution.suspended();
    }
    let registered = true;
    const dispose = (): void => {
      if (!registered) return;
      registered = false;
      this.contributorDisposers.delete(contributor);
      const contributionIndex = this.contributions.indexOf(contribution);
      if (contributionIndex >= 0) {
        this.contributions.splice(contributionIndex, 1);
      }
      contribution.disposed();
    };
    this.contributorDisposers.set(contributor, dispose);
    return dispose;
  }

  unregisterContributor(contributor: WorkspaceContributor): void {
    this.contributorDisposers.get(contributor)?.();
  }
  // Browser-style Go Back / Go Forward: every meaningful jump (go-to-definition, opening a file
  // from the tree / quick-open / a hover or a rendered reference) records the location left AND the
  // location arrived at, so Alt+[ / Alt+] can walk the trail. Reactive so the UI can later show
  // enabled/disabled affordances.
  navigationHistory = this.createNavigationHistory();
  // The document-less editor shown whenever the active buffer is not the subject of the editor
  // surface: no tab open, or a contributed surface presenting something else. One instance serves
  // both — they were two identical empty editors, and "empty" is the whole of either's behaviour.
  protected emptyEditor = this.createEditor();

  protected createEditor() {
    const editor = new Editor.Class();
    editor.attachEditorContributions(this.editorContributions);
    // Word wrap is global: every editor reads the SAME settings.wordWrap when settings are attached, so
    // the mode is consistent across tabs and the empty editor. Editors made before attachSettings
    // (emptyEditor) are retro-attached there.
    if (this.settingsSource)
      editor.attachWordWrap(this.settingsSource.wordWrap);
    if (this.codeFoldingEnabledSource) {
      editor.attachCodeFolding(this.codeFoldingEnabledSource);
    }
    return editor;
  }
  protected createNavigationHistory() {
    return new NavigationHistory.Class();
  }
  protected createBufferSet() {
    return new OpenBufferSet.Class({
      // The set only ever holds Editors (this seam is the sole creator), so `editor` below can treat
      // activeBuffer as an Editor.
      createBuffer: (path, documentHandle) => {
        const editor = this.createEditor();
        editor.attachFoldState(documentHandle.foldState);
        editor.openFile(path);
        return editor;
      },
      disposeBuffer: (buffer) => {
        const editor = buffer as Editor.Instance;
        editor.dispose();
      },
      opened: (handle, buffer) => {
        const editor = buffer as Editor.Instance;
        handle.attach(editor.document);
        this.documentLifecycle.opened(handle);
      },
      becameActive: (handle) => this.documentLifecycle.becameActive(handle),
      closed: (handle, buffer) => {
        this.documentLifecycle.closed(handle);
        handle.detach((buffer as Editor.Instance).document);
      },
    });
  }

  protected provider<Provider extends WorkspaceProvider>(
    identifier: string,
  ): Provider | null {
    for (
      let contributionIndex = this.contributions.length - 1;
      contributionIndex >= 0;
      contributionIndex--
    ) {
      const contribution = this.contributions[contributionIndex];
      const provider = contribution?.providers?.find(
        (candidate) => candidate.identifier === identifier,
      );
      if (provider) return provider as Provider;
    }
    return null;
  }

  protected get languageProvider(): LanguageProvider | null {
    return this.provider<LanguageProvider>('language');
  }

  /** Push the active buffer's current text to every installed semantic provider. */
  syncActiveDocumentWithLanguageProviders(): void {
    if (!this.editorSurfaces.activeDocumentIsPresented) return;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path) return;
    this.languageProvider?.syncDocument(editor.document);
  }

  /** A provider-owned size notice for the legacy observability projection. */
  languageSizeNotice(): string | null {
    if (!this.editorSurfaces.activeDocumentIsPresented) return null;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path) {
      return null;
    }
    return this.languageProvider?.statusNotice(editor.document) ?? null;
  }

  /** A provider-owned notice, or a legible empty state when none is installed. */
  languageProviderNotice(): string | null {
    if (!this.editorSurfaces.activeDocumentIsPresented) return null;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path) {
      return null;
    }
    return (
      this.languageProvider?.statusNotice(editor.document) ??
      (this.languageProvider
        ? null
        : 'Language features unavailable — no provider installed')
    );
  }

  /**
   * VS-Code-style go-to-definition: resolve the symbol at `position` (Ctrl/Cmd+click) or at the
   * cursor (Ctrl+]) through the language client, then open the target file as a tab and land the
   * cursor on the declaration. Resolves false — never throws — when no definition is available
   * (no document, unsupported file, server missing, or the server finds nothing).
   *
   * invariant: Plugin boundaries grant one authority (project.invariants.md)
   */
  async goToDefinition(position?: LanguagePosition): Promise<boolean> {
    if (!this.editorSurfaces.activeDocumentIsPresented) return false;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path)
      return false;
    const provider = this.languageProvider;
    if (!provider) return false;
    const requestPosition = position ?? {
      line: editor.cursor.line.value,
      column: editor.cursor.col.value,
    };
    const location = await provider.definition(
      editor.document,
      requestPosition,
    );
    if (!location) return false;
    return this.jumpToLocation(location);
  }

  /**
   * VS-Code-style hover: resolve the type/documentation for the symbol at `position` through the
   * language provider so the mouse-hover card can show it. Mirrors goToDefinition's guards exactly —
   * resolves null (never throws) when no document, an unsupported file, a missing server, or the
   * server returns nothing. The client applies its own revision-staleness guard on the response.
   *
   * invariant: A hover card reflects the language server type at the pointed symbol (src/modules/ui/ui.invariants.md)
   */
  async hoverAt(position: LanguagePosition): Promise<LanguageHover | null> {
    if (!this.editorSurfaces.activeDocumentIsPresented) return null;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path)
      return null;
    return this.languageProvider?.hover(editor.document, position) ?? null;
  }

  async completionAt(
    position: LanguagePosition,
    context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList> {
    if (!this.editorSurfaces.activeDocumentIsPresented) {
      return { items: [], isIncomplete: false };
    }
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path) {
      return { items: [], isIncomplete: false };
    }
    return (
      this.languageProvider?.completion(editor.document, position, context) ?? {
        items: [],
        isIncomplete: false,
      }
    );
  }

  completionTriggerCharacters(): readonly string[] {
    return this.languageProvider?.completionTriggerCharacters ?? [];
  }

  /** Diagnostics whose range covers a document position — surfaced in the hover card so an errored
   *  expression (whose hover type is often just `any`) still shows the real error MESSAGE. */
  diagnosticsAt(
    position: LanguagePosition,
  ): readonly LanguageHoverDiagnostic[] {
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (
      !this.editorSurfaces.activeDocumentIsPresented ||
      !editor ||
      !editor.hasDocument.value
    ) {
      return [];
    }
    return (
      this.languageProvider?.diagnosticsAt(editor.document, position) ?? []
    );
  }

  /** Open the located file through the existing tab path and reveal the declaration. */
  protected jumpToLocation(location: LanguageLocation): boolean {
    let targetPath: string;
    try {
      targetPath = fileURLToPath(location.uri);
    } catch {
      return false;
    }
    if (!Files.Class.exists(targetPath) || Files.Class.isDir(targetPath))
      return false;
    // Record the SOURCE (the symbol under the cursor) before the jump moves us away, open the
    // target WITHOUT the tab-open auto-record (we record the precise declaration landing ourselves,
    // not the fresh-open 0,0), then record the DESTINATION so Forward returns to the declaration.
    this.recordCurrentLocation();
    this.withSuppressedLocationRecording(() => {
      this.openFileInTab(targetPath);
      this.focus.value = 'editor';
      this.editor.placeCursor(
        location.range.start.line,
        location.range.start.column,
      );
      this.editor.revealCursor();
    });
    this.recordCurrentLocation();
    return true;
  }

  /** The active buffer is a previewable image — any extension the ImageDecoders registry supports
   *  (.png/.jpg/.jpeg today; the registry is the ONE source of truth, no extension list here) —
   *  RootView renders it as half-block cells instead of the binary-file text. Never true with no
   *  document open, or while a contributed surface presents something other than this buffer. */
  // invariant: An image buffer replaces the code text and leaves other files untouched (src/modules/image/image.invariants.md)
  get activeFileIsImage(): boolean {
    return (
      this.editorSurfaces.activeDocumentIsPresented &&
      this.editor.hasDocument.value &&
      ImageDecoders.Class.supports(
        Files.Class.extname(this.editor.document.path),
      )
    );
  }

  /** The editor whose text is the subject of the editor surface: the active tab's buffer, else the
   *  document-less empty editor — which is also what a contributed surface presenting something
   *  else leaves behind. All movement/render/edit target this one. */
  get editor(): Editor.Instance {
    if (!this.editorSurfaces.activeDocumentIsPresented) return this.emptyEditor;
    // Safe cast: createBufferSet's seam is the only buffer creator and always makes an Editor.
    return (
      (this.buffers.activeBuffer as Editor.Instance | null) ?? this.emptyEditor
    );
  }

  get activeDocumentHandle(): DocumentHandle.Model | null {
    return this.buffers.activeDocumentHandle;
  }
  nextViewPaint(): Promise<void> {
    return (
      this.options.awaitNextViewPaint?.() ??
      new Promise((resolve) => setImmediate(resolve))
    );
  }

  // Optional live settings source: when attached, the vertical scroll-momentum profile reads its
  // ceiling / gain / friction from the reactive Settings store so the settings panel LIVE-APPLIES
  // (no restart). Unattached (tests) falls back to the tuned VERTICAL_MOMENTUM default.
  protected settingsSource: Settings.Instance | null = null;
  protected codeFoldingEnabledSource: Ref<boolean> | null = null;

  attachCodeFolding(enabled: Ref<boolean>): void {
    this.codeFoldingEnabledSource = enabled;
    this.emptyEditor.attachCodeFolding(enabled);
    for (const entry of this.buffers.entries.value) {
      (entry.buffer as Editor.Instance | null)?.attachCodeFolding(enabled);
    }
  }

  attachSettings(settings: Settings.Instance): void {
    this.settingsSource = settings;
    // Retro-attach the global wordWrap source to editors already built (the field-init empty editor +
    // any live buffers from session restore). Future editors get it in createEditor.
    this.emptyEditor.attachWordWrap(settings.wordWrap);
    for (const entry of this.buffers.entries.value) {
      (entry.buffer as Editor.Instance | null)?.attachWordWrap(
        settings.wordWrap,
      );
    }
    for (const contribution of this.contributions) {
      contribution.settingsAttached?.(settings);
    }
  }
  protected get flingMomentum(): MomentumOptions {
    const settings = this.settingsSource;
    if (!settings) return Momentum.Class.verticalOptions;
    return {
      impulse: settings.scrollAccelGain.value,
      max: settings.verticalFlingCeiling.value,
      decayPerSec: settings.scrollFriction.value,
      stopVelocity: Momentum.Class.verticalOptions.stopVelocity,
      maximumGlideDurationMilliseconds:
        settings.maximumGlideDurationMilliseconds.value,
    };
  }
  get focus() {
    return ref<Focus>('editor');
  }
  get primaryPaneContentIdentifier() {
    return ref('');
  }
  get name() {
    return ref('');
  }
  get worktreeName() {
    return ref<string | null>(null);
  }
  get tabDetail(): string {
    for (const contribution of this.contributions) {
      const detail = contribution.tabDetail;
      if (detail) return detail;
    }
    return '';
  }

  open(root: string): void {
    this.root = root;
    const absoluteRoot = Files.Class.absolute(root);
    this.name.value = Files.Class.basename(absoluteRoot) || absoluteRoot;
    this.focus.value = 'editor';
    for (const contribution of this.contributions) contribution.opened(root);
  }

  /** Release per-root live resources while preserving this workspace's resumable model state. */
  suspendOwnedResources(): void {
    this.resourcesSuspended = true;
    for (const contribution of this.contributions) contribution.suspended();
    this.buffers.deactivate();
  }

  /** Recreate per-root live resources when this workspace becomes the observed project again. */
  resumeOwnedResources(): void {
    this.resourcesSuspended = false;
    this.buffers.reactivate();
    for (const contribution of this.contributions) contribution.resumed();
  }

  /** Tear down owned resources with effects, handles, or subprocesses. */
  dispose(): void {
    for (const disposeContribution of [...this.contributorDisposers.values()]) {
      disposeContribution();
    }
    this.buffers.disposeAll();
    this.emptyEditor.dispose();
  }

  toggleFocus(): void {
    if (this.focus.value === 'primaryPane') {
      this.focus.value = 'editor';
    } else if (this.primaryPaneContentIdentifier.value) {
      this.focus.value = 'primaryPane';
    }
  }

  focusEditor(): void {
    this.focus.value = 'editor';
  }
  focusPrimaryPane(contentIdentifier?: string): void {
    if (contentIdentifier) {
      this.primaryPaneContentIdentifier.value = contentIdentifier;
    }
    if (this.primaryPaneContentIdentifier.value) {
      this.focus.value = 'primaryPane';
    }
  }

  impulseEditorVerticalScroll(deltaRows: number): void {
    const viewport = this.editor.viewport;
    Momentum.Class.queueImpulse(
      viewport.verticalScrollMomentum.value,
      deltaRows,
    );
  }

  impulseEditorHorizontalScroll(deltaColumns: number): void {
    const viewport = this.editor.viewport;
    Momentum.Class.queueImpulse(
      viewport.horizontalScrollMomentum.value,
      deltaColumns,
    );
  }

  // invariant: One writer per scroll regime per frame (src/modules/ui/ui.invariants.md)
  /** Advance every wheel glide by one frame and report whether another frame is required. */
  tickScrollAnimations(dtSeconds: number): boolean {
    const editorViewport = this.editor.viewport;

    const editorVerticalStep = Momentum.Class.stepMomentum(
      editorViewport.verticalScrollMomentum.value,
      dtSeconds,
      this.flingMomentum,
    );
    editorViewport.verticalScrollMomentum.value = editorVerticalStep.momentum;
    if (editorVerticalStep.rows !== 0) {
      // In wrap mode scrollTop is a VISUAL-row offset, so the momentum glide clamps to the wrapped
      // extent (totalVisualRows) — reaching the true last visual row, same engine as non-wrap.
      const editor = this.editor;
      const totalRows = editor.totalVisualRows();
      editorViewport.scrollBy(editorVerticalStep.rows, totalRows);
    }

    const editorHorizontalStep = Momentum.Class.stepMomentum(
      editorViewport.horizontalScrollMomentum.value,
      dtSeconds,
      this.flingMomentum,
    );
    editorViewport.horizontalScrollMomentum.value =
      editorHorizontalStep.momentum;
    if (editorHorizontalStep.rows !== 0 && !this.editor.wordWrap.value) {
      // invariant: A pane is a self-contained scrollable viewport (project.invariants.md)
      // invariant: Geometry aggregates match their consumers (src/modules/editor/editor.invariants.md)
      editorViewport.scrollByColumns(
        editorHorizontalStep.rows,
        this.editor.document.maximumLineWidth,
      );
    }

    const contributionIsMoving = this.contributions.some(
      (contribution) => contribution.tickScroll?.(dtSeconds) ?? false,
    );

    return (
      [editorVerticalStep.momentum, editorHorizontalStep.momentum].some(
        (momentum) => Momentum.Class.isMoving(momentum),
      ) || contributionIsMoving
    );
  }

  // --- editor buffer tabs (item 10a) ---------------------------------------
  // Opening a file ADDS or FOCUSES a tab (never replaces). The buffer set owns the flyweight/dispose
  // discipline; Workspace just releases any contributed surface and keeps the dirty flag fresh.

  // --- navigation history (Go Back / Go Forward) ---------------------------
  // A programmatic back()/forward() restore MUST NOT itself record a new location, or the stack
  // could never be escaped. This guard is raised around a history restore AND around the internal
  // openFileInTab of a go-to-definition jump (which records its own source + destination
  // explicitly). It is a plain field — an internal control flag, not observable view state.
  // invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
  protected suppressLocationRecording = false;

  /** Run `action` with location recording suppressed (history restore / an already-recorded jump). */
  protected withSuppressedLocationRecording(action: () => void): void {
    const previouslySuppressed = this.suppressLocationRecording;
    this.suppressLocationRecording = true;
    try {
      action();
    } finally {
      this.suppressLocationRecording = previouslySuppressed;
    }
  }

  /** Snapshot the visible editor's current location into the history (no-op without a real
   *  document — the empty-state editor carries no navigable path). */
  recordCurrentLocation(): void {
    const editor = this.editor;
    if (!editor.hasDocument.value || !editor.document.path) return;
    this.navigationHistory.record({
      documentPath: editor.document.path,
      line: editor.cursor.line.value,
      column: editor.cursor.col.value,
    });
  }

  /** Open a recorded location and land the cursor on it — the shared back/forward restore path.
   *  Suppresses recording so replaying history never mutates it. */
  protected restoreNavigationLocation(location: Location): void {
    this.withSuppressedLocationRecording(() => {
      this.openFileInTab(location.documentPath);
      this.focus.value = 'editor';
      this.editor.placeCursor(location.line, location.column);
      this.editor.revealCursor();
    });
  }

  /** Go Back (Alt+[): restore the previous location in the trail; safe no-op at the start. */
  navigateBack(): void {
    const location = this.navigationHistory.back();
    if (location) this.restoreNavigationLocation(location);
  }

  /** Go Forward (Alt+]): restore the next location in the trail; safe no-op at the end. */
  navigateForward(): void {
    const location = this.navigationHistory.forward();
    if (location) this.restoreNavigationLocation(location);
  }

  /** Open `path` as a tab: focus its tab if already open, else add a new active one. Records the
   *  location left (before the switch) AND the location arrived at (after) into the navigation
   *  history, unless recording is suppressed (a history restore, or a jump that records itself). */
  openFileInTab(path: string): void {
    if (!this.suppressLocationRecording) this.recordCurrentLocation(); // where we were, before we leave
    this.editorSurfaces.releaseOccupying(); // a real file replaces any transient surface
    this.buffers.open(path);
    if (!this.suppressLocationRecording) this.recordCurrentLocation(); // where we arrived
  }

  /** Resolve a textual reference to a real file inside this workspace, or null. Pure path
   *  confinement: strip a fragment or query, reject any `scheme:` URL and any malformed escape, then
   *  try the reference against the workspace root and against the active document's directory,
   *  keeping only a target that exists, is not a directory, and stays inside the root. Nothing here
   *  knows what produced the reference; rendered documents are simply its first caller. */
  resolveFileReference(reference: string): string | null {
    const withoutFragment =
      reference.split('#', 1)[0]?.split('?', 1)[0]?.trim() ?? '';
    if (!withoutFragment || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(withoutFragment))
      return null;
    let decodedReference = withoutFragment;
    try {
      decodedReference = decodeURIComponent(withoutFragment);
    } catch {
      // A malformed percent escape is not a file target.
      return null;
    }
    const candidatePaths = [
      Files.Class.confineToRoot(this.root, decodedReference),
      this.editor.hasDocument.value
        ? Files.Class.confineToRoot(
            Files.Class.dirname(this.editor.document.path),
            decodedReference,
          )
        : null,
    ];
    for (const candidatePath of candidatePaths) {
      if (
        candidatePath &&
        Files.Class.confineToRoot(this.root, candidatePath) !== null &&
        Files.Class.exists(candidatePath) &&
        !Files.Class.isDir(candidatePath)
      ) {
        return candidatePath;
      }
    }
    return null;
  }

  openFileReference(reference: string): boolean {
    const resolvedPath = this.resolveFileReference(reference);
    if (!resolvedPath) return false;
    this.openFileInTab(resolvedPath);
    this.focus.value = 'editor';
    return true;
  }

  /** Activate an already-open tab by index (tab click / cycle). */
  activateTab(index: number): void {
    this.editorSurfaces.releaseOccupying();
    this.buffers.activate(index);
    this.focus.value = 'editor';
  }

  /** Cycle tabs by `delta`, wrapping (Ctrl+Tab / Ctrl+PageUp-Down). */
  cycleTab(delta: number): void {
    if (this.buffers.count === 0) return;
    this.editorSurfaces.releaseOccupying();
    this.buffers.cycle(delta);
    this.focus.value = 'editor';
  }

  /** Pending dirty-tab-close confirmation: the tab index awaiting y/N, or -1 when none. */
  get pendingCloseTabIndex() {
    return ref(-1);
  }

  /** Whether closing tab `index` needs a dirty-discard confirmation first. */
  tabNeedsCloseConfirm(index: number): boolean {
    return this.buffers.tabs()[index]?.dirty ?? false;
  }

  /** Close tab `index`, fully disposing its buffer (document/undo/syntax). Clean-close path. */
  closeTab(index: number): void {
    this.buffers.close(index);
    if (this.buffers.count === 0) this.focusPrimaryPane();
  }

  /** Save the active file and update its tab's dirty state. */
  saveActiveFile(): boolean {
    const saved = this.editor.save();
    if (saved) this.buffers.syncActiveDirty();
    return saved;
  }

  /** Close tab `index`, prompting first if it has unsaved edits (dirty → modal confirm). */
  requestCloseTab(index: number): void {
    if (index < 0 || index >= this.buffers.count) return;
    if (this.tabNeedsCloseConfirm(index)) {
      this.pendingCloseTabIndex.value = index;
      return;
    }
    this.closeTab(index);
  }

  /** Close the ACTIVE tab (Ctrl+W), prompting if dirty. */
  closeActiveTab(): void {
    this.requestCloseTab(this.buffers.activeIndex.value);
  }

  /** Confirm the pending dirty-tab close (modal 'y'). */
  confirmCloseTab(): void {
    const index = this.pendingCloseTabIndex.value;
    this.pendingCloseTabIndex.value = -1;
    if (index >= 0) this.closeTab(index);
  }

  /** Cancel the pending dirty-tab close (modal anything-but-'y'). */
  cancelCloseTab(): void {
    this.pendingCloseTabIndex.value = -1;
  }
}

export namespace Workspace {
  export const $Class = $Workspace;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export type Focus = 'editor' | 'primaryPane';

export interface WorkspaceOptions {
  awaitNextViewPaint?: () => Promise<void>;
  contributors?: readonly WorkspaceContributor[];
}
