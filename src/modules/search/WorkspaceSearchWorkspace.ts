import { Reactive } from 'ivue';
import { ref } from 'vue';
import { Files } from '../system/Files';
import { TextInputModel } from '../text/TextInputModel';
import { TextCoordinates } from '../text/TextCoordinates';
import type { TextEdit } from '../text/TextEdit.interface';
import type { DocumentHandle } from '../workspace/DocumentHandle';
import type { SourceTextView } from '../workspace/SourceTextView.interface';
import { TextArena } from '../workspace/TextArena';
import {
  TextPatch,
  type TextPatchDirection,
  type TextPatchVerification,
} from '../workspace/TextPatch';
import type { WorkspaceUndoCoordinator } from '../workspace/WorkspaceUndoCoordinator';
import { TextSearchPattern } from './TextSearchPattern';
import {
  WorkspaceSearchBackend,
  type WorkspaceSearchRequest,
  type WorkspaceSearchResult,
} from './WorkspaceSearchBackend';
import { WorkspaceSearchPathFilter } from './WorkspaceSearchPathFilter';
import { WorkspaceSearchResultTree } from './WorkspaceSearchResultTree';
import {
  WorkspaceReplacementHistory,
  type WorkspaceReplacementLocation,
  type WorkspaceReplacementTransaction,
} from './WorkspaceReplacementHistory';

/** Per-workspace query, generation, result, and open-document overlay state. */
// invariant: Editable text fields share one input model (project.invariants.md)
class $WorkspaceSearchWorkspace {
  constructor(readonly options: WorkspaceSearchWorkspaceOptions) {
    this.queryInputModel = this.createTextInput();
    this.replacementInputModel = this.createTextInput();
    this.includeInputModel = this.createTextInput();
    this.excludeInputModel = this.createTextInput();
    this.backend = options.backend ?? new WorkspaceSearchBackend.Class();
    this.resultTree = this.createResultTree();
    this.replacementHistory = this.createReplacementHistory();
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
  readonly resultTree: WorkspaceSearchResultTree.Model;
  protected queuedSearchTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly replacementHistory: WorkspaceReplacementHistory.Instance;
  protected nextTransactionNumber = 1;

  protected createTextInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  protected createResultTree(): WorkspaceSearchResultTree.Model {
    return new WorkspaceSearchResultTree.Class();
  }

  protected createReplacementHistory(): WorkspaceReplacementHistory.Instance {
    return new WorkspaceReplacementHistory.Class();
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

  get driftedCount() {
    return ref(0);
  }

  get failedCount() {
    return ref(0);
  }

  get skippedCount() {
    return ref(0);
  }

  get appliedCount() {
    return ref(0);
  }

  get activeTransactionIdentifier() {
    return ref('');
  }

  get canUndo(): boolean {
    return this.replacementHistory.canUndo;
  }

  get canRedo(): boolean {
    return this.replacementHistory.canRedo;
  }

  get providerIdentifier(): string {
    return 'workspace-search';
  }

  prepareReplace(
    results: readonly WorkspaceSearchResult[] = this.resultTree.selectedResults(),
  ): WorkspacePreparedReplacement {
    this.flowState.value = 'verifyingReplace';
    const arena = new TextArena.Class();
    const entries = this.createEntriesFromResults(arena, results);
    const classification = this.classify(entries, 'apply');
    this.publishClassification(classification);
    this.flowState.value = 'awaitingReplaceConsent';
    return {
      direction: 'apply',
      arena,
      transaction: null,
      entries,
      safeEntries: classification.safeEntries,
      driftedEntries: classification.driftedEntries,
      failedEntries: classification.failedEntries,
      tooLarge: !this.replacementHistory.canAcceptArenaByteLength(
        arena.byteLength,
      ),
    };
  }

  prepareUndo(
    transactionIdentifier?: string,
  ): WorkspacePreparedReplacement | null {
    const transaction = transactionIdentifier
      ? this.replacementHistory.find(transactionIdentifier)
      : this.replacementHistory.latest('applied');
    if (!transaction || transaction.state !== 'applied') return null;
    return this.prepareHistoryAction(transaction, 'undo');
  }

  prepareRedo(
    transactionIdentifier?: string,
  ): WorkspacePreparedReplacement | null {
    const transaction = transactionIdentifier
      ? this.replacementHistory.find(transactionIdentifier)
      : this.replacementHistory.latest('undone');
    if (!transaction || transaction.state !== 'undone') return null;
    return this.prepareHistoryAction(transaction, 'redo');
  }

  cancelPreparedAction(prepared: WorkspacePreparedReplacement): void {
    if (prepared.transaction) {
      this.options.undoCoordinator?.cancelRequest(
        this.providerIdentifier,
        prepared.transaction.identifier,
      );
    }
    this.flowState.value = 'ready';
  }

  applyPreparedAction(
    prepared: WorkspacePreparedReplacement,
  ): WorkspaceReplacementOutcome {
    if (prepared.tooLarge) {
      this.cancelPreparedAction(prepared);
      return { appliedEntries: [], driftedEntries: [], failedEntries: [] };
    }
    const eligibleEntries = prepared.safeEntries;
    const applyingState =
      prepared.direction === 'apply'
        ? 'applying'
        : prepared.direction === 'undo'
          ? 'undoing'
          : 'redoing';
    this.flowState.value = applyingState;
    const outcome = this.applyEntries(eligibleEntries, prepared.direction);
    const initiallySkippedCount =
      prepared.driftedEntries.length + prepared.failedEntries.length;
    this.driftedCount.value =
      prepared.driftedEntries.length + outcome.driftedEntries.length;
    this.failedCount.value =
      prepared.failedEntries.length + outcome.failedEntries.length;
    this.skippedCount.value =
      initiallySkippedCount +
      outcome.driftedEntries.length +
      outcome.failedEntries.length;
    this.appliedCount.value = outcome.appliedEntries.length;
    this.errorMessage.value = this.failureMessage(prepared, outcome);

    if (prepared.direction === 'apply') {
      this.finishInitialReplacement(outcome);
      this.flowState.value = 'applied';
    } else if (prepared.transaction) {
      prepared.transaction.state =
        prepared.direction === 'undo' ? 'undone' : 'applied';
      if (prepared.direction === 'undo') {
        this.options.undoCoordinator?.markUndone(
          this.providerIdentifier,
          prepared.transaction.identifier,
        );
        this.flowState.value = 'undone';
      } else {
        this.options.undoCoordinator?.markRedone(
          this.providerIdentifier,
          prepared.transaction.identifier,
        );
        this.flowState.value = 'applied';
      }
      this.activeTransactionIdentifier.value = prepared.transaction.identifier;
    }
    return outcome;
  }

  protected prepareHistoryAction(
    transaction: WorkspaceReplacementTransaction,
    direction: 'undo' | 'redo',
  ): WorkspacePreparedReplacement {
    this.flowState.value =
      direction === 'undo' ? 'verifyingUndo' : 'verifyingRedo';
    const expectedState = direction === 'undo' ? 'applied' : 'undone';
    const entries = transaction.patches.flatMap((patch, index) =>
      patch.state === expectedState
        ? [
            {
              patch,
              location: transaction.locations[index]!,
              result: null,
            },
          ]
        : [],
    );
    const classification = this.classify(entries, direction);
    this.publishClassification(classification);
    this.activeTransactionIdentifier.value = transaction.identifier;
    this.flowState.value =
      direction === 'undo' ? 'awaitingUndoConsent' : 'awaitingRedoConsent';
    return {
      direction,
      arena: transaction.arena,
      transaction,
      entries,
      safeEntries: classification.safeEntries,
      driftedEntries: classification.driftedEntries,
      failedEntries: classification.failedEntries,
      tooLarge: false,
    };
  }

  protected createEntriesFromResults(
    arena: TextArena.Instance,
    results: readonly WorkspaceSearchResult[],
  ): WorkspacePreparedEntry[] {
    const encoder = new TextEncoder();
    const orderedResults = [...results].sort(
      (first, second) =>
        first.absolutePath.localeCompare(second.absolutePath) ||
        first.baselineByteOffset - second.baselineByteOffset,
    );
    return orderedResults.map((result, index) => {
      const previous = orderedResults[index - 1];
      const next = orderedResults[index + 1];
      const removedBytes = encoder.encode(result.matchedText);
      const previousEnd =
        previous?.absolutePath === result.absolutePath
          ? previous.baselineByteOffset +
            encoder.encode(previous.matchedText).byteLength
          : Number.NEGATIVE_INFINITY;
      const nextStart =
        next?.absolutePath === result.absolutePath
          ? next.baselineByteOffset
          : Number.POSITIVE_INFINITY;
      const beforeLength = Math.min(
        result.beforeContextBytes.byteLength,
        Math.max(0, result.baselineByteOffset - previousEnd),
      );
      const afterLength = Math.min(
        result.afterContextBytes.byteLength,
        Math.max(
          0,
          nextStart - (result.baselineByteOffset + removedBytes.byteLength),
        ),
      );
      return {
        patch: TextPatch.Class.createRecorded(arena, {
          path: result.absolutePath,
          searchGeneration: this.queryGeneration.value,
          baselineByteOffset: result.baselineByteOffset,
          removedBytes,
          insertedBytes: encoder.encode(result.replacementText),
          beforeContextBytes: result.beforeContextBytes.slice(
            result.beforeContextBytes.byteLength - beforeLength,
          ),
          afterContextBytes: result.afterContextBytes.slice(0, afterLength),
        }),
        location: {
          absolutePath: result.absolutePath,
          relativePath: result.relativePath,
          line: result.line,
        },
        result,
      };
    });
  }

  protected classify(
    entries: readonly WorkspacePreparedEntry[],
    direction: TextPatchDirection,
  ): WorkspaceReplacementClassification {
    const safeEntries: WorkspacePreparedEntry[] = [];
    const driftedEntries: WorkspacePreparedEntry[] = [];
    const failedEntries: WorkspaceFailedEntry[] = [];
    for (const pathEntries of this.entriesByPath(entries).values()) {
      let source: WorkspaceReplacementSource;
      try {
        source = this.readSource(pathEntries[0]!.patch.path);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failedEntries.push(...pathEntries.map((entry) => ({ entry, reason })));
        continue;
      }
      if (source.readOnly) {
        failedEntries.push(
          ...pathEntries.map((entry) => ({
            entry,
            reason: 'File is read-only.',
          })),
        );
        continue;
      }
      const verifications = TextPatch.Class.verifyGroup(
        source.bytes,
        pathEntries.map((entry) => entry.patch),
        direction,
      );
      verifications.forEach((verification, index) => {
        const entry = pathEntries[index]!;
        if (verification.byteOffset === undefined) driftedEntries.push(entry);
        else safeEntries.push({ ...entry, verification });
      });
    }
    return { safeEntries, driftedEntries, failedEntries };
  }

  protected applyEntries(
    entries: readonly WorkspacePreparedEntry[],
    direction: TextPatchDirection,
  ): WorkspaceReplacementOutcome {
    const appliedEntries: WorkspacePreparedEntry[] = [];
    const driftedEntries: WorkspacePreparedEntry[] = [];
    const failedEntries: WorkspaceFailedEntry[] = [];
    for (const pathEntries of this.entriesByPath(entries).values()) {
      let source: WorkspaceReplacementSource;
      try {
        source = this.readSource(pathEntries[0]!.patch.path);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failedEntries.push(...pathEntries.map((entry) => ({ entry, reason })));
        continue;
      }
      if (source.readOnly) {
        failedEntries.push(
          ...pathEntries.map((entry) => ({
            entry,
            reason: 'File is read-only.',
          })),
        );
        continue;
      }
      const currentEntries: WorkspacePreparedEntry[] = [];
      for (const entry of pathEntries) {
        const verification = entry.patch.verify(source.bytes, direction);
        if (verification.byteOffset === undefined) driftedEntries.push(entry);
        else currentEntries.push({ ...entry, verification });
      }
      if (currentEntries.length === 0) continue;
      const replacement = this.replacementFor(
        source.bytes,
        currentEntries,
        direction,
      );
      const writeFailure = this.writeReplacement(
        source,
        currentEntries,
        replacement.bytes,
        direction,
      );
      if (writeFailure) {
        failedEntries.push(
          ...currentEntries.map((entry) => ({ entry, reason: writeFailure })),
        );
        continue;
      }
      for (const entry of currentEntries) {
        entry.patch.accept(
          {
            kind: 'exact',
            byteOffset: replacement.finalByteOffsets.get(entry.patch)!,
          },
          direction,
        );
        appliedEntries.push(entry);
      }
    }
    return { appliedEntries, driftedEntries, failedEntries };
  }

  protected replacementFor(
    sourceBytes: Uint8Array,
    entries: readonly WorkspacePreparedEntry[],
    direction: TextPatchDirection,
  ): WorkspaceByteReplacement {
    const ordered = [...entries].sort(
      (first, second) =>
        this.verifiedByteOffset(first) - this.verifiedByteOffset(second),
    );
    const finalByteOffsets = new Map<TextPatch.Instance, number>();
    const chunks: Uint8Array[] = [];
    let sourceByteOffset = 0;
    let finalByteOffset = 0;
    for (const entry of ordered) {
      const subjectByteOffset = this.verifiedByteOffset(entry);
      const subjectBytes = entry.patch.subjectBytes(direction);
      const replacementBytes = entry.patch.replacementBytes(direction);
      if (subjectByteOffset < sourceByteOffset) {
        throw new Error('Workspace text patches overlap.');
      }
      const unchanged = sourceBytes.slice(sourceByteOffset, subjectByteOffset);
      chunks.push(unchanged, replacementBytes);
      finalByteOffset += unchanged.byteLength;
      finalByteOffsets.set(entry.patch, finalByteOffset);
      finalByteOffset += replacementBytes.byteLength;
      sourceByteOffset = subjectByteOffset + subjectBytes.byteLength;
    }
    chunks.push(sourceBytes.slice(sourceByteOffset));
    const byteLength = chunks.reduce(
      (total, chunk) => total + chunk.byteLength,
      0,
    );
    const bytes = new Uint8Array(byteLength);
    let writeOffset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, writeOffset);
      writeOffset += chunk.byteLength;
    }
    return { bytes, finalByteOffsets };
  }

  protected writeReplacement(
    source: WorkspaceReplacementSource,
    entries: readonly WorkspacePreparedEntry[],
    replacementBytes: Uint8Array,
    direction: TextPatchDirection,
  ): string {
    if (source.view) {
      const edits = entries.map((entry) =>
        this.textEditFor(source.bytes, entry, direction),
      );
      const appliedCount =
        source.view.applyTextEditsAsExternalTransaction(edits);
      if (appliedCount !== edits.length)
        return 'Open document changed before mutation.';
      const writtenBytes = new TextEncoder().encode(source.view.document.text);
      if (!this.bytesEqual(writtenBytes, replacementBytes)) {
        return 'Open document read-back did not match the replacement.';
      }
      return '';
    }
    const result = Files.Class.replaceBytesIfUnchanged(
      source.path,
      source.bytes,
      replacementBytes,
    );
    return result.replaced ? '' : result.reason;
  }

  protected textEditFor(
    sourceBytes: Uint8Array,
    entry: WorkspacePreparedEntry,
    direction: TextPatchDirection,
  ): TextEdit {
    const startByteOffset = this.verifiedByteOffset(entry);
    const subjectBytes = entry.patch.subjectBytes(direction);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return {
      start: this.positionAtByteOffset(sourceBytes, startByteOffset),
      end: this.positionAtByteOffset(
        sourceBytes,
        startByteOffset + subjectBytes.byteLength,
      ),
      expectedText: decoder.decode(subjectBytes),
      replacementText: decoder.decode(entry.patch.replacementBytes(direction)),
    };
  }

  protected positionAtByteOffset(
    sourceBytes: Uint8Array,
    byteOffset: number,
  ): { line: number; column: number } {
    const prefix = new TextDecoder('utf-8', { fatal: true }).decode(
      sourceBytes.slice(0, byteOffset),
    );
    const lineBreak = /\r\n|\n|\r/g;
    let line = 0;
    let lineStart = 0;
    let match: RegExpExecArray | null;
    while ((match = lineBreak.exec(prefix)) !== null) {
      line++;
      lineStart = match.index + match[0].length;
    }
    const lineText = prefix.slice(lineStart);
    return {
      line,
      column: TextCoordinates.Class.u16ToGrapheme(lineText, lineText.length),
    };
  }

  protected verifiedByteOffset(entry: WorkspacePreparedEntry): number {
    const byteOffset = entry.verification?.byteOffset;
    if (byteOffset === undefined) {
      throw new Error('A workspace replacement entry is not verified.');
    }
    return byteOffset;
  }

  protected readSource(path: string): WorkspaceReplacementSource {
    const view = this.options.sourceTextViewForPath?.(path) ?? null;
    if (view) {
      if (view.document.binary.value)
        throw new Error('Binary files cannot be replaced.');
      return {
        path,
        bytes: new TextEncoder().encode(view.document.text),
        view,
        readOnly: view.readOnly.value,
      };
    }
    const bytes = Files.Class.readBytes(path);
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { path, bytes, view: null, readOnly: Files.Class.isReadOnly(path) };
  }

  protected entriesByPath(
    entries: readonly WorkspacePreparedEntry[],
  ): Map<string, WorkspacePreparedEntry[]> {
    const entriesByPath = new Map<string, WorkspacePreparedEntry[]>();
    for (const entry of entries) {
      const pathEntries = entriesByPath.get(entry.patch.path) ?? [];
      pathEntries.push(entry);
      entriesByPath.set(entry.patch.path, pathEntries);
    }
    return entriesByPath;
  }

  protected finishInitialReplacement(
    outcome: WorkspaceReplacementOutcome,
  ): void {
    if (outcome.appliedEntries.length === 0) return;
    const identifier = `workspace-replace-${this.nextTransactionNumber++}`;
    const retainedArena = new TextArena.Class();
    const retainedPatches = outcome.appliedEntries.map((entry) => {
      const patch = entry.patch;
      const retainedPatch = TextPatch.Class.createRecorded(retainedArena, {
        path: patch.path,
        searchGeneration: patch.searchGeneration,
        baselineByteOffset: patch.baselineByteOffset,
        removedBytes: patch.arena.bytes(patch.removedTextSlice),
        insertedBytes: patch.arena.bytes(patch.insertedTextSlice),
        beforeContextBytes: patch.arena.bytes(patch.beforeContextSlice),
        afterContextBytes: patch.arena.bytes(patch.afterContextSlice),
      });
      retainedPatch.accept(
        { kind: 'exact', byteOffset: patch.appliedByteOffset },
        'apply',
      );
      return retainedPatch;
    });
    const transaction: WorkspaceReplacementTransaction = {
      identifier,
      arena: retainedArena,
      patches: retainedPatches,
      locations: outcome.appliedEntries.map((entry) => entry.location),
      complete: true,
      state: 'applied',
    };
    const historyResult = this.replacementHistory.add(transaction);
    if (!historyResult.accepted) {
      throw new Error(
        'Workspace replacement history rejected a verified transaction.',
      );
    }
    for (const evictedIdentifier of historyResult.evictedTransactionIdentifiers) {
      this.options.undoCoordinator?.removeTransaction(
        this.providerIdentifier,
        evictedIdentifier,
      );
    }
    this.options.undoCoordinator?.registerTransaction(
      this.providerIdentifier,
      identifier,
      [
        ...new Set(
          transaction.locations.map((location) => location.absolutePath),
        ),
      ],
    );
    this.activeTransactionIdentifier.value = identifier;
    const appliedResults = outcome.appliedEntries.flatMap((entry) =>
      entry.result ? [entry.result] : [],
    );
    this.removeResults(appliedResults);
  }

  protected removeResults(results: readonly WorkspaceSearchResult[]): void {
    const removed = new Set(results);
    for (let index = this.resultStorage.length - 1; index >= 0; index--) {
      if (removed.has(this.resultStorage[index]!))
        this.resultStorage.splice(index, 1);
    }
    this.resultFilePaths.clear();
    for (const result of this.resultStorage)
      this.resultFilePaths.add(result.relativePath);
    this.publishResultMutation();
  }

  protected publishClassification(
    classification: WorkspaceReplacementClassification,
  ): void {
    this.driftedCount.value = classification.driftedEntries.length;
    this.failedCount.value = classification.failedEntries.length;
    this.skippedCount.value =
      classification.driftedEntries.length +
      classification.failedEntries.length;
    this.appliedCount.value = 0;
  }

  protected failureMessage(
    prepared: WorkspacePreparedReplacement,
    outcome: WorkspaceReplacementOutcome,
  ): string {
    const lines = [
      ...prepared.driftedEntries.map(
        (entry) =>
          `${entry.location.relativePath}:${entry.location.line + 1} changed.`,
      ),
      ...outcome.driftedEntries.map(
        (entry) =>
          `${entry.location.relativePath}:${entry.location.line + 1} changed before mutation.`,
      ),
      ...prepared.failedEntries.map(
        ({ entry, reason }) =>
          `${entry.location.relativePath}:${entry.location.line + 1} failed: ${reason}`,
      ),
      ...outcome.failedEntries.map(
        ({ entry, reason }) =>
          `${entry.location.relativePath}:${entry.location.line + 1} failed: ${reason}`,
      ),
    ];
    return lines.join('\n');
  }

  protected bytesEqual(first: Uint8Array, second: Uint8Array): boolean {
    if (first.byteLength !== second.byteLength) return false;
    for (let byteIndex = 0; byteIndex < first.byteLength; byteIndex++) {
      if (first[byteIndex] !== second[byteIndex]) return false;
    }
    return true;
  }

  queueSearch(): void {
    if (this.queuedSearchTimer !== null) clearTimeout(this.queuedSearchTimer);
    this.flowState.value = 'queued';
    this.queuedSearchTimer = setTimeout(() => {
      this.queuedSearchTimer = null;
      void this.search();
    }, 120);
  }

  async search(): Promise<readonly WorkspaceSearchResult[]> {
    if (this.queuedSearchTimer !== null) {
      clearTimeout(this.queuedSearchTimer);
      this.queuedSearchTimer = null;
    }
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
    this.publishResultMutation();
    this.overlayOpenDocuments(openDocumentHandles, request);
    this.flowState.value = 'ready';
    return this.results;
  }

  cancel(): void {
    if (this.queuedSearchTimer !== null) {
      clearTimeout(this.queuedSearchTimer);
      this.queuedSearchTimer = null;
    }
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
      if (matches.length === 0) continue;
      const sourceContext = WorkspaceSearchBackend.Class.sourceContext(
        document.text,
      );
      for (const match of matches) {
        if (this.resultStorage.length >= maximumMatchCount) {
          this.limited.value = true;
          this.publishResultMutation();
          return;
        }
        this.resultStorage.push(
          WorkspaceSearchBackend.Class.resultForMatchInSource(
            relativePath,
            handle.path,
            match,
            pattern.expandReplacement(request.replacementText, match),
            sourceContext,
          ),
        );
        this.resultFilePaths.add(relativePath);
      }
    }
    this.publishResultMutation();
  }

  protected clearResults(): void {
    this.resultStorage.length = 0;
    this.resultFilePaths.clear();
    this.fileCount.value = 0;
    this.resultTree.reset();
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
    this.resultTree.updateResults(
      this.resultStorage,
      this.limited.value,
      this.replacementInput.value.length > 0,
    );
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
  readonly sourceTextViewForPath?: (path: string) => SourceTextView | null;
  readonly undoCoordinator?: WorkspaceUndoCoordinator.Instance;
  readonly backend?: WorkspaceSearchBackend.Instance;
}

export type WorkspaceSearchFlowState =
  | 'idle'
  | 'queued'
  | 'searching'
  | 'ready'
  | 'verifyingReplace'
  | 'awaitingReplaceConsent'
  | 'applying'
  | 'applied'
  | 'verifyingUndo'
  | 'awaitingUndoConsent'
  | 'undoing'
  | 'undone'
  | 'verifyingRedo'
  | 'awaitingRedoConsent'
  | 'redoing'
  | 'unavailable'
  | 'failed';

export interface WorkspacePreparedReplacement {
  readonly direction: TextPatchDirection;
  readonly arena: TextArena.Instance;
  readonly transaction: WorkspaceReplacementTransaction | null;
  readonly entries: readonly WorkspacePreparedEntry[];
  readonly safeEntries: readonly WorkspacePreparedEntry[];
  readonly driftedEntries: readonly WorkspacePreparedEntry[];
  readonly failedEntries: readonly WorkspaceFailedEntry[];
  readonly tooLarge: boolean;
}

export interface WorkspacePreparedEntry {
  readonly patch: TextPatch.Instance;
  readonly location: WorkspaceReplacementLocation;
  readonly result: WorkspaceSearchResult | null;
  readonly verification?: TextPatchVerification;
}

export interface WorkspaceFailedEntry {
  readonly entry: WorkspacePreparedEntry;
  readonly reason: string;
}

export interface WorkspaceReplacementOutcome {
  readonly appliedEntries: readonly WorkspacePreparedEntry[];
  readonly driftedEntries: readonly WorkspacePreparedEntry[];
  readonly failedEntries: readonly WorkspaceFailedEntry[];
}

interface WorkspaceReplacementClassification {
  readonly safeEntries: WorkspacePreparedEntry[];
  readonly driftedEntries: WorkspacePreparedEntry[];
  readonly failedEntries: WorkspaceFailedEntry[];
}

interface WorkspaceReplacementSource {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly view: SourceTextView | null;
  readonly readOnly: boolean;
}

interface WorkspaceByteReplacement {
  readonly bytes: Uint8Array;
  readonly finalByteOffsets: ReadonlyMap<TextPatch.Instance, number>;
}
