import { Reactive } from 'ivue';
import { fileURLToPath } from 'node:url';
import type { Ref } from 'vue';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import type { DocumentHandle } from '../workspace/DocumentHandle';
import type {
  EditorLineDecoration,
  GutterDecorationContribution,
} from '../workspace/GutterDecorations';
import type {
  LanguageCompletionContext,
  LanguageCompletionList,
  LanguageDocument,
  LanguageHover,
  LanguageHoverDiagnostic,
  LanguageLocation,
  LanguagePosition,
  LanguageProvider,
} from '../workspace/LanguageProvider.interface';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceProvider,
} from '../workspace/WorkspaceContributor.interface';
import { LanguageClient } from './LanguageClient';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
// invariant: LSP is a provider plugin (src/modules/lsp/lsp.invariants.md)
class $LspWorkspaceProvider
  implements
    WorkspaceContribution,
    LanguageProvider,
    GutterDecorationContribution
{
  readonly identifier = 'language' as const;
  readonly providers: readonly WorkspaceProvider[] = [this];
  protected rootPath = '';
  protected client: LanguageClient.Model | null = null;
  protected disposeDocumentLifecycle: (() => void) | null = null;
  protected disposeGutterDecorations: (() => void) | null = null;

  constructor(
    protected readonly workspace: Workspace.Model,
    protected readonly options: LspWorkspaceProviderOptions,
  ) {
    this.disposeDocumentLifecycle = workspace.documentLifecycle.register({
      opened: (handle) => this.openDocument(handle),
      becameActive: (handle) => this.activateDocument(handle),
      closed: (handle) => this.closeDocument(handle),
    });
    this.disposeGutterDecorations = workspace.gutterDecorations.register(this);
  }

  get completionTriggerCharacters(): readonly string[] {
    return this.client?.completionTriggerCharacters ?? [];
  }

  opened(root: string): void {
    this.rootPath = root;
    this.openActiveDocument();
  }

  suspended(): void {
    // invariant: Client disposal releases the server (src/modules/lsp/lsp.invariants.md)
    this.releaseClient();
  }

  resumed(): void {
    this.openActiveDocument();
  }

  disposed(): void {
    this.disposeDocumentLifecycle?.();
    this.disposeDocumentLifecycle = null;
    this.disposeGutterDecorations?.();
    this.disposeGutterDecorations = null;
    // invariant: Client disposal releases the server (src/modules/lsp/lsp.invariants.md)
    this.releaseClient();
  }

  syncDocument(document: LanguageDocument): void {
    this.client?.syncDocument(document);
  }

  async definition(
    document: LanguageDocument,
    position: LanguagePosition,
  ): Promise<LanguageLocation | null> {
    // invariant: A definition gesture jumps to the declaration (src/modules/lsp/lsp.invariants.md)
    const client = this.ensureClient();
    if (!client.supportsDocument(document)) return null;
    const location = await client.definition(document, position);
    if (!location) return null;
    return this.rehopThroughImportSpecifier(client, document, location);
  }

  async hover(
    document: LanguageDocument,
    position: LanguagePosition,
  ): Promise<LanguageHover | null> {
    const client = this.ensureClient();
    return client.supportsDocument(document)
      ? client.hover(document, position)
      : null;
  }

  async completion(
    document: LanguageDocument,
    position: LanguagePosition,
    context: LanguageCompletionContext,
  ): Promise<LanguageCompletionList> {
    const client = this.ensureClient();
    return client.supportsDocument(document)
      ? client.completion(document, position, context)
      : { items: [], isIncomplete: false };
  }

  diagnosticsAt(
    document: LanguageDocument,
    position: LanguagePosition,
  ): readonly LanguageHoverDiagnostic[] {
    const client = this.client;
    if (!client) return [];
    void client.diagnosticsRevision.value;
    const total = client.diagnosticCountFor(document);
    if (total === 0) return [];
    const coveringDiagnostics: LanguageHoverDiagnostic[] = [];
    for (const diagnostic of client.diagnosticSlice(document, 0, total)) {
      const { start, end } = diagnostic.range;
      const afterStart =
        position.line > start.line ||
        (position.line === start.line && position.column >= start.column);
      const beforeEnd =
        position.line < end.line ||
        (position.line === end.line && position.column <= end.column);
      if (afterStart && beforeEnd) {
        coveringDiagnostics.push({
          severity: diagnostic.severity,
          message: diagnostic.message,
        });
      }
    }
    return coveringDiagnostics;
  }

  statusNotice(document: LanguageDocument): string | null {
    // invariant: The LSP attaches only to documents within the size budget (src/modules/lsp/lsp.invariants.md)
    const client = this.client;
    if (!client) return null;
    void client.sizeSuppressionRevision.value;
    return client.sizeSuppressionNotice(document);
  }

  revision(handle: DocumentHandle.Model): number {
    if (!handle.document || !this.client) return 0;
    return this.client.diagnosticsRevision.value;
  }

  byLine(
    handle: DocumentHandle.Model,
  ): ReadonlyMap<number, readonly EditorLineDecoration[]> {
    const document = handle.document;
    const client = this.client;
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
        const severity =
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
          severity,
          hoverLabel: severity,
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

  protected ensureClient(): LanguageClient.Model {
    if (!this.client) {
      this.client = this.createLanguageClient();
    }
    return this.client;
  }

  protected createLanguageClient(): LanguageClient.Model {
    return new LanguageClient.Class({
      rootPath: this.rootPath,
      preferredTypeScriptServer: () =>
        this.options.preferredTypeScriptServer.value,
      fileSizeLimitKb: () => this.options.fileSizeLimitKb.value,
    });
  }

  protected openActiveDocument(): void {
    const document = this.workspace.activeDocumentHandle?.document;
    if (document) this.ensureClient().openDocument(document);
  }

  protected openDocument(handle: DocumentHandle.Model): void {
    const document = handle.document;
    if (document) this.ensureClient().openDocument(document);
  }

  protected activateDocument(handle: DocumentHandle.Model): void {
    const document = handle.document;
    if (!document) return;
    this.ensureClient().openDocument(document);
    this.client?.syncDocument(document);
  }

  protected closeDocument(handle: DocumentHandle.Model): void {
    const document = handle.document;
    if (document) this.client?.closeDocument(document);
  }

  protected async rehopThroughImportSpecifier(
    client: LanguageClient.Model,
    document: LanguageDocument,
    location: LanguageLocation,
  ): Promise<LanguageLocation> {
    let landedPath: string;
    try {
      landedPath = fileURLToPath(location.uri);
    } catch {
      return location;
    }
    if (landedPath !== document.path) return location;
    if (!/^\s*import\b/.test(document.line(location.range.start.line))) {
      return location;
    }
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

  protected releaseClient(): void {
    void this.client?.dispose();
    this.client = null;
  }
}

export namespace LspWorkspaceProvider {
  export const $Class = $LspWorkspaceProvider;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
}

export interface LspWorkspaceProviderOptions {
  preferredTypeScriptServer: Readonly<Ref<string>>;
  fileSizeLimitKb: Readonly<Ref<number>>;
}
