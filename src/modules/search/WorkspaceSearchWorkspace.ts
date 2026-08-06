import { Reactive } from 'ivue';
import { ref } from 'vue';
import { Files } from '../system/Files';
import { TextInputModel } from '../text/TextInputModel';
import type { DocumentHandle } from '../workspace/DocumentHandle';
import { TextSearchPattern } from './TextSearchPattern';
import {
  WorkspaceSearchBackend,
  type WorkspaceSearchRequest,
  type WorkspaceSearchResult,
} from './WorkspaceSearchBackend';
import { WorkspaceSearchPathFilter } from './WorkspaceSearchPathFilter';

/** Per-workspace query, generation, result, and open-document overlay state. */
// invariant: Editable text fields share one input model (project.invariants.md)
class $WorkspaceSearchWorkspace {
  constructor(readonly options: WorkspaceSearchWorkspaceOptions) {
    this.queryInputModel = this.createTextInput();
    this.replacementInputModel = this.createTextInput();
    this.includeInputModel = this.createTextInput();
    this.excludeInputModel = this.createTextInput();
    this.backend = options.backend ?? new WorkspaceSearchBackend.Class();
  }

  protected readonly backend: WorkspaceSearchBackend.Instance;
  declare $stopEffects: () => void;
  protected readonly queryInputModel: TextInputModel.Model;
  protected readonly replacementInputModel: TextInputModel.Model;
  protected readonly includeInputModel: TextInputModel.Model;
  protected readonly excludeInputModel: TextInputModel.Model;
  // invariant: Cost tracks the actively observed set (project.invariants.md)
  protected readonly resultStorage: WorkspaceSearchResult[] = [];
  protected readonly resultFilePaths = new Set<string>();

  protected createTextInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  get queryInput(): TextInputModel.Model {
    return this.queryInputModel;
  }

  get replacementInput(): TextInputModel.Model {
    return this.replacementInputModel;
  }

  get includeInput(): TextInputModel.Model {
    return this.includeInputModel;
  }

  get excludeInput(): TextInputModel.Model {
    return this.excludeInputModel;
  }

  get caseSensitive() {
    return ref(false);
  }

  get wholeWord() {
    return ref(false);
  }

  get useRegex() {
    return ref(false);
  }

  get useIgnoreFiles() {
    return ref(true);
  }

  get flowState() {
    return ref<WorkspaceSearchFlowState>('idle');
  }

  get queryGeneration() {
    return ref(0);
  }

  protected get resultVersion() {
    return ref(0);
  }

  /** Compact ground truth with one version signal. Streaming appends never copy prior results. */
  get results(): readonly WorkspaceSearchResult[] {
    void this.resultVersion.value;
    return this.resultStorage;
  }

  get limited() {
    return ref(false);
  }

  get errorMessage() {
    return ref('');
  }

  get resultCount(): number {
    return this.results.length;
  }

  get fileCount() {
    return ref(0);
  }

  async search(): Promise<readonly WorkspaceSearchResult[]> {
    const generation = this.queryGeneration.value + 1;
    this.queryGeneration.value = generation;
    this.backend.cancel();
    this.clearResults();
    this.limited.value = false;
    this.errorMessage.value = '';

    const workspaceRoot = this.options.workspaceRoot();
    if (workspaceRoot.length === 0) {
      this.flowState.value = 'failed';
      this.errorMessage.value = 'Workspace search requires an open workspace.';
      return this.results;
    }
    if (this.queryInput.value.length === 0) {
      this.flowState.value = 'ready';
      return this.results;
    }

    this.flowState.value = 'searching';
    const openDocumentHandles = this.options.openDocumentHandles();
    const request = this.createRequest(workspaceRoot, openDocumentHandles);
    const backendResult = await this.backend.search(request, (fileResults) => {
      // invariant: An async result can outlive the state it described (project.invariants.md)
      if (generation !== this.queryGeneration.value) return;
      this.appendResults(fileResults);
    });
    if (generation !== this.queryGeneration.value) return this.results;
    if (backendResult.state === 'cancelled') {
      this.flowState.value = 'idle';
      return this.results;
    }
    if (backendResult.state === 'unavailable') {
      this.flowState.value = 'unavailable';
      this.errorMessage.value = backendResult.error;
      return this.results;
    }
    if (backendResult.state === 'failed') {
      this.flowState.value = 'failed';
      this.errorMessage.value = backendResult.error;
      return this.results;
    }

    this.limited.value = backendResult.limited;
    this.overlayOpenDocuments(openDocumentHandles, request);
    this.flowState.value = 'ready';
    return this.results;
  }

  cancel(): void {
    this.queryGeneration.value++;
    this.backend.cancel();
    this.flowState.value = 'idle';
  }

  dispose(): void {
    this.cancel();
    this.$stopEffects();
  }

  protected createRequest(
    workspaceRoot: string,
    openDocumentHandles: readonly DocumentHandle.Model[],
  ): WorkspaceSearchRequest {
    return {
      workspaceRoot,
      query: {
        text: this.queryInput.value,
        caseSensitive: this.caseSensitive.value,
        wholeWord: this.wholeWord.value,
        useRegex: this.useRegex.value,
      },
      replacementText: this.replacementInput.value,
      includeGlobs: this.parseGlobList(this.includeInput.value),
      excludeGlobs: this.parseGlobList(this.excludeInput.value),
      useIgnoreFiles: this.useIgnoreFiles.value,
      skippedAbsolutePaths: openDocumentHandles.map((handle) => handle.path),
    };
  }

  protected overlayOpenDocuments(
    openDocumentHandles: readonly DocumentHandle.Model[],
    request: WorkspaceSearchRequest,
  ): void {
    const pattern = new TextSearchPattern.Class(request.query);
    if (!pattern.valid) return;
    const maximumMatchCount = this.backend.maximumMatchCount;
    const pathFilter = new WorkspaceSearchPathFilter.Class(
      request.includeGlobs,
      request.excludeGlobs,
    );
    for (const handle of openDocumentHandles) {
      const document = handle.document;
      if (document === null) continue;
      const relativePath = Files.Class.relative(
        request.workspaceRoot,
        handle.path,
      )
        .split('\\')
        .join('/');
      if (!pathFilter.includes(relativePath)) continue;
      const remainingMatchCount = maximumMatchCount - this.resultStorage.length;
      const matches = pattern.matchesInDocument(
        document,
        remainingMatchCount + 1,
      );
      for (const match of matches) {
        if (this.resultStorage.length >= maximumMatchCount) {
          this.limited.value = true;
          this.publishResultMutation();
          return;
        }
        this.resultStorage.push({
          relativePath,
          absolutePath: handle.path,
          line: match.line,
          startColumn: match.startColumn,
          endColumn: match.endColumn,
          startUtf16Offset: match.startUtf16Offset,
          endUtf16Offset: match.endUtf16Offset,
          matchedText: match.matchedText,
          lineText: match.lineText,
          replacementText: pattern.expandReplacement(
            request.replacementText,
            match,
          ),
        });
        this.resultFilePaths.add(relativePath);
      }
    }
    this.publishResultMutation();
  }

  protected clearResults(): void {
    this.resultStorage.length = 0;
    this.resultFilePaths.clear();
    this.fileCount.value = 0;
    this.publishResultMutation();
  }

  protected appendResults(results: readonly WorkspaceSearchResult[]): void {
    if (results.length === 0) return;
    this.resultStorage.push(...results);
    for (const result of results) {
      this.resultFilePaths.add(result.relativePath);
    }
    this.publishResultMutation();
  }

  protected publishResultMutation(): void {
    this.fileCount.value = this.resultFilePaths.size;
    this.resultVersion.value++;
  }

  protected parseGlobList(text: string): readonly string[] {
    return text
      .split(',')
      .map((glob) => glob.trim())
      .filter((glob) => glob.length > 0);
  }
}

export namespace WorkspaceSearchWorkspace {
  export const $Class = $WorkspaceSearchWorkspace;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface WorkspaceSearchWorkspaceOptions {
  readonly workspaceRoot: () => string;
  readonly openDocumentHandles: () => readonly DocumentHandle.Model[];
  readonly backend?: WorkspaceSearchBackend.Instance;
}

export type WorkspaceSearchFlowState =
  'idle' | 'searching' | 'ready' | 'unavailable' | 'failed';
