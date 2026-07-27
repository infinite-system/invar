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
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { Logging } from '../system/Logging';
import {
  LanguageClient,
  type LanguageHover,
  type LanguageLocation,
  type TextDocumentModel,
  type TextPosition,
} from '../lsp/LanguageClient';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import type {
  LanguageCompletionContext,
  LanguageCompletionList,
} from '../lsp/LanguageProvider.interface';
import { DocumentLifecycle } from './DocumentLifecycle';
import { EditorSurfaceClaims } from './EditorSurfaceClaims';
import {
  GutterDecorations,
  type EditorLineDecoration,
} from './GutterDecorations';
import type { DocumentHandle } from './DocumentHandle';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from './WorkspaceContributor.interface';
import { EditorContributions } from '../editor/EditorContributions';

// A workspace: one project root with its editor, documents, and generic contribution lifecycle.
// WorkspaceSet layers project tabs and flyweight activation over this per-root core.
//
// invariant: Workspace and file navigation are separate layers (workspace.invariants.md)

class $Workspace {
  constructor(protected readonly options: WorkspaceOptions = {}) {
    this.documentLifecycle.register({
      opened: (handle) => this.openLanguageDocument(handle),
      becameActive: (handle) => this.activateLanguageDocument(handle),
      closed: (handle) => this.closeLanguageDocument(handle),
    });
    this.gutterDecorations.register({
      revision: (handle) => this.languageDecorationRevision(handle),
      byLine: (handle) => this.languageDecorationsByLine(handle),
    });
    for (const contributor of options.contributors ?? []) {
      this.registerContributor(contributor);
    }
  }

  root = '';
  // The set of open editor buffers behind the tab bar (item 10a): opening a file ADDS or FOCUSES a
  // tab, never replaces. Flyweight — only the active buffer (and any dirty background buffer) holds a
  // live document; clean background tabs dehydrate to a light handle and rehydrate on activation.
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

  // --- language intelligence (one client per workspace root) --------------------------------
  // The client is created lazily on the first buffer open; the LSP subprocess itself starts only
  // when a SUPPORTED document opens or a semantic request runs (activation follows demand).
  protected languageClientInstance: LanguageClient.Model | null = null;
  protected createLanguageClient(): LanguageClient.Model {
    // Late-read the TypeScript-server choice so a settings change (or an attach that lands after this
    // client is created) is honoured when a document activates the server.
    return new LanguageClient.Class({
      rootPath: this.root,
      preferredTypeScriptServer: () =>
        this.settingsSource?.typescriptServer.value ?? 'auto',
      // Late-read the size budget so a file larger than the limit is never attached to the server
      // (which would balloon and crash the app). `0` = no limit; unset settings (bare tests) also
      // read 0 so tests are unaffected.
      fileSizeLimitKb: () => this.settingsSource?.lspFileSizeLimitKb.value ?? 0,
    });
  }
  protected ensureLanguageClient(): LanguageClient.Model {
    if (!this.languageClientInstance)
      this.languageClientInstance = this.createLanguageClient();
    return this.languageClientInstance;
  }

  protected openLanguageDocument(handle: DocumentHandle.Model): void {
    const document = handle.document;
    if (document) this.ensureLanguageClient().openDocument(document);
  }

  protected activateLanguageDocument(handle: DocumentHandle.Model): void {
    const document = handle.document;
    if (!document) return;
    this.ensureLanguageClient().openDocument(document);
    this.languageClientInstance?.syncDocument(document);
  }

  protected closeLanguageDocument(handle: DocumentHandle.Model): void {
    const document = handle.document;
    if (document) this.languageClientInstance?.closeDocument(document);
  }

  protected languageDecorationsByLine(
    handle: DocumentHandle.Model,
  ): Map<number, EditorLineDecoration[]> {
    const document = handle.document;
    const client = this.languageClientInstance;
    if (!document || !client) return new Map();
    void client.diagnosticsRevision.value;
    void document.revision.value;
    const total = client.diagnosticCountFor(document);
    const decorationsByLine = new Map<number, EditorLineDecoration[]>();
    for (const diagnostic of client.diagnosticSlice(document, 0, total)) {
      const firstLine = diagnostic.range.start.line;
      const lastLine = diagnostic.range.end.line;
      for (let lineIndex = firstLine; lineIndex <= lastLine; lineIndex += 1) {
        if (lineIndex < 0 || lineIndex >= document.lineCount) continue;
        const startColumn =
          lineIndex === firstLine ? diagnostic.range.start.column : 0;
        const endColumn =
          lineIndex === lastLine
            ? diagnostic.range.end.column
            : EditorCoordinates.Class.graphemeCount(document.line(lineIndex));
        const color =
          diagnostic.severity === 1
            ? 'error'
            : diagnostic.severity === 2
              ? 'warning'
              : diagnostic.severity === 3
                ? 'info'
                : 'hint';
        const decorations = decorationsByLine.get(lineIndex) ?? [];
        decorations.push({
          owner: 'diagnostics',
          severity: color,
          hoverLabel: color,
          underline: {
            startColumn,
            endColumn: Math.max(startColumn, endColumn),
          },
        });
        decorationsByLine.set(lineIndex, decorations);
      }
    }
    return decorationsByLine;
  }

  protected languageDecorationRevision(handle: DocumentHandle.Model): number {
    if (!handle.document || !this.languageClientInstance) return 0;
    return this.languageClientInstance.diagnosticsRevision.value;
  }

  /** Push the active buffer's current text to the language server (revision-idempotent full-text
   *  didChange). Driven by the document-revision watch in Bootstrap; no-op before any client
   *  exists, or while the active document is not the subject of the editor surface. */
  syncActiveDocumentWithLanguageServer(): void {
    if (!this.editorSurfaces.activeDocumentIsPresented) return;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path) return;
    this.languageClientInstance?.syncDocument(editor.document);
  }

  /** The active file's language-size suppression notice, or `null` when it is within the LSP size
   *  budget (or no client/document exists). Surfaced in the status bar so a suppressed large file is
   *  never a silent no-op, and published to the observability channel so a driven gate can assert it.
   *
   * invariant: The LSP attaches only to documents within the size budget (src/modules/lsp/lsp.invariants.md)
   */
  languageSizeNotice(): string | null {
    if (!this.editorSurfaces.activeDocumentIsPresented) return null;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    const client = this.languageClientInstance;
    if (
      !client ||
      !editor ||
      !editor.hasDocument.value ||
      !editor.document.path
    )
      return null;
    void client.sizeSuppressionRevision.value; // reactive: re-evaluate as suppression flips
    return client.sizeSuppressionNotice(editor.document);
  }

  /**
   * VS-Code-style go-to-definition: resolve the symbol at `position` (Ctrl/Cmd+click) or at the
   * cursor (Ctrl+]) through the language client, then open the target file as a tab and land the
   * cursor on the declaration. Resolves false — never throws — when no definition is available
   * (no document, unsupported file, server missing, or the server finds nothing).
   *
   * invariant: A definition gesture jumps to the declaration (src/modules/lsp/lsp.invariants.md)
   */
  async goToDefinition(position?: TextPosition): Promise<boolean> {
    if (!this.editorSurfaces.activeDocumentIsPresented) return false;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path)
      return false;
    const client = this.ensureLanguageClient();
    if (!client.supportsDocument(editor.document)) return false;
    const requestPosition = position ?? {
      line: editor.cursor.line.value,
      column: editor.cursor.col.value,
    };
    const location = await client.definition(editor.document, requestPosition);
    if (!location) return false;
    const resolvedLocation = await this.rehopThroughImportSpecifier(
      client,
      editor.document,
      location,
    );
    return this.jumpToLocation(resolvedLocation);
  }

  /** The real server resolves a use site to the IMPORT SPECIFIER while the target file is not
   *  open in the server (and to the original declaration when it is — both observed against
   *  typescript-language-server). One re-request from the import specifier reaches the original
   *  declaration, matching VS Code. */
  protected async rehopThroughImportSpecifier(
    client: LanguageClient.Model,
    document: TextDocumentModel,
    location: LanguageLocation,
  ): Promise<LanguageLocation> {
    let landedPath: string;
    try {
      landedPath = fileURLToPath(location.uri);
    } catch {
      return location;
    }
    if (landedPath !== resolvePath(document.path)) return location;
    if (!/^\s*import\b/.test(document.line(location.range.start.line)))
      return location;
    const rehoppedLocation = await client.definition(
      document,
      location.range.start,
    );
    if (!rehoppedLocation) return location;
    const rehoppedToSameSpot =
      rehoppedLocation.uri === location.uri &&
      rehoppedLocation.range.start.line === location.range.start.line &&
      rehoppedLocation.range.start.column === location.range.start.column;
    return rehoppedToSameSpot ? location : rehoppedLocation;
  }

  /**
   * VS-Code-style hover: resolve the type/documentation for the symbol at `position` through the
   * language client so the mouse-hover card can show it. Mirrors goToDefinition's guards exactly —
   * resolves null (never throws) when no document, an unsupported file, a missing server, or the
   * server returns nothing. The client applies its own revision-staleness guard on the response.
   *
   * invariant: A hover card reflects the language server type at the pointed symbol (src/modules/ui/ui.invariants.md)
   */
  async hoverAt(position: TextPosition): Promise<LanguageHover | null> {
    if (!this.editorSurfaces.activeDocumentIsPresented) return null;
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path)
      return null;
    const client = this.ensureLanguageClient();
    if (!client.supportsDocument(editor.document)) return null;
    return client.hover(editor.document, position);
  }

  async completionAt(
    position: TextPosition,
    context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList> {
    if (!this.editorSurfaces.activeDocumentIsPresented) {
      return { items: [], isIncomplete: false };
    }
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    if (!editor || !editor.hasDocument.value || !editor.document.path) {
      return { items: [], isIncomplete: false };
    }
    const client = this.ensureLanguageClient();
    if (!client.supportsDocument(editor.document)) {
      return { items: [], isIncomplete: false };
    }
    return client.completion(editor.document, position, context);
  }

  completionTriggerCharacters(): readonly string[] {
    return this.languageClientInstance?.completionTriggerCharacters ?? [];
  }

  /** Diagnostics whose range covers a document position — surfaced in the hover card so an errored
   *  expression (whose hover type is often just `any`) still shows the real error MESSAGE. */
  diagnosticsAt(position: TextPosition): readonly HoverDiagnostic[] {
    const editor = this.buffers.activeBuffer as Editor.Instance | null;
    const client = this.languageClientInstance;
    if (
      !this.editorSurfaces.activeDocumentIsPresented ||
      !client ||
      !editor ||
      !editor.hasDocument.value
    )
      return [];
    void client.diagnosticsRevision.value; // reactive: re-query as diagnostics arrive
    const total = client.diagnosticCountFor(editor.document);
    if (total === 0) return [];
    const covering: HoverDiagnostic[] = [];
    for (const diagnostic of client.diagnosticSlice(
      editor.document,
      0,
      total,
    )) {
      const { start, end } = diagnostic.range;
      const afterStart =
        position.line > start.line ||
        (position.line === start.line && position.column >= start.column);
      const beforeEnd =
        position.line < end.line ||
        (position.line === end.line && position.column <= end.column);
      if (afterStart && beforeEnd)
        covering.push({
          severity: diagnostic.severity,
          message: diagnostic.message,
        });
    }
    return covering;
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
    // A suspended (background) workspace holds no language-server subprocess; resuming recreates
    // the client lazily through the buffer seams / the next semantic request.
    // invariant: Client disposal releases the server (src/modules/lsp/lsp.invariants.md)
    void this.languageClientInstance?.dispose();
    this.languageClientInstance = null;
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
    // invariant: Client disposal releases the server (src/modules/lsp/lsp.invariants.md)
    void this.languageClientInstance?.dispose();
    this.languageClientInstance = null;
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
    viewport.verticalScrollMomentum.value = Momentum.Class.addImpulse(
      viewport.verticalScrollMomentum.value,
      deltaRows,
      this.flingMomentum,
    );
  }

  impulseEditorHorizontalScroll(deltaColumns: number): void {
    const viewport = this.editor.viewport;
    viewport.horizontalScrollMomentum.value = Momentum.Class.addImpulse(
      viewport.horizontalScrollMomentum.value,
      deltaColumns,
      this.flingMomentum,
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

/** A diagnostic surfaced in the hover card: its severity and message text. */
export interface HoverDiagnostic {
  severity: 1 | 2 | 3 | 4;
  message: string;
}

export interface WorkspaceOptions {
  awaitNextViewPaint?: () => Promise<void>;
  contributors?: readonly WorkspaceContributor[];
}
