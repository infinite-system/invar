import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import { spawnSync } from 'node:child_process';
import { Files } from '../system/Files';
import { Momentum, type MomentumOptions } from '../system/Momentum';
import type { Settings } from '../settings/Settings';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';
import type { Workspace } from '../workspace/Workspace';
import type { DocumentHandle } from '../workspace/DocumentHandle';
import type { DocumentLifecycleContribution } from '../workspace/DocumentLifecycle';
import type { GutterDecorationContribution } from '../workspace/GutterDecorations';
import type { EditorSurfaceClaim } from '../workspace/EditorSurfaceClaims';
import type { NavigationHistoryContributor } from '../navigation/NavigationHistory';
import { GitRepository } from './GitRepository';
import { GitWatcher } from './GitWatcher';
import { GitBlameCache } from './GitBlameCache';
import type { BlameLine } from './GitBlame';
import { CommitLog } from './CommitLog';
import { CommitExpansion } from './CommitExpansion';
import { GitPanel } from './GitPanel';
import { GitRows } from './GitRows';
import { GitLogRows, type CommitLogRow } from './GitLogRows';
import { GitCommands } from './GitCommands';
import { GitParsers } from './GitParsers';
import { GitDocumentState } from './GitDocumentState';

// invariant: N open workspaces do not cost N live GitWatchers (src/modules/workspace/workspace.invariants.md)
// invariant: Workspace activation is view-only (src/modules/workspace/workspace.invariants.md)
// invariant: Document identity survives document instance replacement (src/modules/workspace/workspace.invariants.md)
// invariant: The editor surface answers capabilities, not plugin modes (src/modules/workspace/workspace.invariants.md)
// invariant: Commit selection previews without focus transfer (src/modules/git/git.invariants.md)
// invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
class $GitWorkspace
  implements
    DocumentLifecycleContribution,
    GutterDecorationContribution,
    EditorSurfaceClaim,
    NavigationHistoryContributor
{
  constructor(
    readonly workspace: Workspace.Model,
    splitRatioSetting?: RegisteredSetting<number>,
    diffSplitRatioSetting?: RegisteredSetting<number>,
  ) {
    this.splitRatioSetting =
      splitRatioSetting ?? this.createTransientNumberSetting();
    this.diffSplitRatioSetting =
      diffSplitRatioSetting ?? this.createTransientNumberSetting();
    this.disposeDocumentLifecycle = workspace.documentLifecycle.register(this);
    this.disposeGutterDecorations = workspace.gutterDecorations.register(this);
    this.disposeEditorSurfaceClaim = workspace.editorSurfaces.register(this);
    this.disposeNavigationHistory = workspace.navigationHistory.register(this);
  }

  readonly splitRatioSetting: RegisteredSetting<number>;
  readonly diffSplitRatioSetting: RegisteredSetting<number>;

  protected createTransientNumberSetting(): RegisteredSetting<number> {
    return {
      value: ref(0.5),
      save: () => {},
      dispose: () => {},
    };
  }

  protected readonly disposeDocumentLifecycle: () => void;
  protected readonly disposeGutterDecorations: () => void;
  protected readonly disposeEditorSurfaceClaim: () => void;
  protected readonly disposeNavigationHistory: () => void;
  protected readonly documentStates = new Map<
    DocumentHandle.Model,
    GitDocumentState.Model
  >();
  protected settingsSource: Settings.Instance | null = null;
  protected watcher: GitWatcher.Model | null = null;
  protected blameCache: GitBlameCache.Model | null = null;
  protected logTipProbeGeneration = 0;
  protected diffOpenRequestGeneration = 0;

  panel = new GitPanel.Class();

  // --- the transient comparison, and this contribution's claim over the editor surface ---------
  // A comparison of two revisions is source control's own view: it is transient, never becomes a
  // file tab, and while it is up the active buffer's text is NOT what the user sees. The host used
  // to hold this state and ask itself "is a diff showing?" before every language request; now this
  // contribution holds it and ANSWERS the host's capability questions instead.
  get showingComparison() {
    return ref(false);
  }
  /** Both full-text SIDES of the comparison on screen, or null. The token forces the view host to
   *  rebuild, because the comparison view reconstructs per request. */
  get comparisonRequest() {
    return shallowRef<GitComparisonRequest | null>(null);
  }
  protected comparisonRequestToken = 0;

  /** Put a comparison of two revisions on the editor surface. Selection preserves focus; explicit
   *  activation transfers it after the request becomes the visible comparison. */
  showComparison(
    request: Omit<GitComparisonRequest, 'token'>,
    transferFocus: boolean,
  ): void {
    this.workspace.navigationHistory.recordCurrentState();
    this.comparisonRequest.value = {
      token: ++this.comparisonRequestToken,
      ...request,
    };
    this.showingComparison.value = true;
    if (transferFocus) this.workspace.focusEditor();
    this.workspace.navigationHistory.recordCurrentState();
  }

  // --- EditorSurfaceClaim -----------------------------------------------------------------------
  readonly identifier = 'sourceControl.comparison';
  get occupyingEditorSurface(): boolean {
    return this.showingComparison.value;
  }
  /** A comparison REPLACES the active buffer's text, so the active document is not presented — and
   *  with `activeDocumentIsKeyboardTarget` omitted, it takes the keyboard too. */
  get activeDocumentIsPresented(): boolean {
    return !this.showingComparison.value;
  }
  release(): void {
    this.showingComparison.value = false;
    this.comparisonRequest.value = null;
  }

  // --- NavigationHistoryContributor --------------------------------------------------------------
  captureCurrentState(): GitComparisonRequest | null {
    const request = this.comparisonRequest.value;
    if (
      !this.showingComparison.value ||
      !request ||
      this.workspace.editorSurfaces.occupyingClaim !== this
    ) {
      return null;
    }
    return { ...request };
  }

  restoreState(payload: unknown): boolean {
    if (!this.isComparisonRequest(payload)) return false;
    this.comparisonRequestToken = Math.max(
      this.comparisonRequestToken,
      payload.token,
    );
    this.comparisonRequest.value = { ...payload };
    this.showingComparison.value = true;
    this.workspace.focusEditor();
    return true;
  }

  samePlace(previousPayload: unknown, nextPayload: unknown): boolean {
    return (
      this.isComparisonRequest(previousPayload) &&
      this.isComparisonRequest(nextPayload) &&
      previousPayload.token === nextPayload.token
    );
  }

  protected isComparisonRequest(
    payload: unknown,
  ): payload is GitComparisonRequest {
    if (typeof payload !== 'object' || payload === null) return false;
    const candidate = payload as Partial<GitComparisonRequest>;
    return (
      typeof candidate.token === 'number' &&
      typeof candidate.previousVersionText === 'string' &&
      typeof candidate.currentVersionText === 'string' &&
      typeof candidate.previousVersionPath === 'string' &&
      typeof candidate.currentVersionPath === 'string'
    );
  }

  get repository() {
    return shallowRef<GitRepository.Instance | null>(null);
  }
  get changedCount(): number {
    const repository = this.repository.value;
    return repository
      ? repository.staged.value.length +
          repository.unstaged.value.length +
          repository.untracked.value.length
      : 0;
  }
  get repositoryScanCompleted(): boolean {
    return this.repository.value?.lastRefreshAt.value != null;
  }

  get commitLog() {
    return shallowRef<CommitLog.Instance | null>(null);
  }

  get commitExpansion() {
    return shallowRef<CommitExpansion.Instance | null>(null);
  }

  protected get watcherStatusRevision() {
    return ref(0);
  }

  protected get GitCommands() {
    return GitCommands.Class;
  }

  protected projectNameForRoot(absoluteRoot: string): string {
    const result = spawnSync(
      'git',
      [
        '-C',
        absoluteRoot,
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
      ],
      { encoding: 'utf8', timeout: 2000 },
    );
    if (result.status !== 0) return '';
    const commonDirectory = result.stdout.trim();
    return commonDirectory
      ? Files.Class.basename(Files.Class.dirname(commonDirectory))
      : '';
  }

  settingsAttached(settings: Settings.Instance): void {
    this.settingsSource = settings;
  }

  suspended(): void {
    this.watcher?.dispose();
    this.watcher = null;
    this.blameCache?.dispose();
    this.blameCache = null;
    for (const state of this.documentStates.values()) state.invalidate();
  }

  resumed(): void {
    if (this.workspace.root && this.repository.value && !this.watcher) {
      this.activateResources();
    }
    if (this.workspace.root && !this.blameCache) {
      this.blameCache = new GitBlameCache.Class(this.workspace.root);
    }
    const activeHandle = this.workspace.activeDocumentHandle;
    if (activeHandle) void this.refreshDocumentHead(activeHandle);
  }

  disposed(): void {
    this.suspended();
    this.disposeNavigationHistory();
    this.disposeDocumentLifecycle();
    this.disposeGutterDecorations();
    this.disposeEditorSurfaceClaim();
    this.documentStates.clear();
    this.repository.value?.dispose();
    this.repository.value = null;
    this.commitLog.value = null;
    this.commitExpansion.value = null;
  }

  protected activateResources(): void {
    const repository = this.repository.value;
    if (!repository) return;
    this.watcher?.dispose();
    const viewPainted = this.workspace.nextViewPaint();
    let watcher: GitWatcher.Model;
    watcher = new GitWatcher.Class(this.workspace.root, repository, {
      onReconciled: () => {
        void this.reconcileLogTip();
        const activeHandle = this.workspace.activeDocumentHandle;
        if (activeHandle) void this.refreshDocumentHead(activeHandle);
      },
      onWatchSetEstablished: () => {
        if (this.watcher === watcher) {
          this.watcherStatusRevision.value += 1;
        }
      },
      viewPainted,
    });
    this.watcher = watcher;
    void viewPainted.then(() => {
      if (this.watcher === watcher) void repository.refresh();
    });
  }

  opened(handle: DocumentHandle.Model): void;
  opened(root: string): void;
  opened(rootOrHandle: string | DocumentHandle.Model): void {
    if (typeof rootOrHandle === 'string') {
      this.openedWorkspace(rootOrHandle);
      return;
    }
    const handle = rootOrHandle;
    if (!this.documentStates.has(handle)) {
      this.documentStates.set(handle, new GitDocumentState.Class(handle));
    }
  }

  protected openedWorkspace(root: string): void {
    const absoluteRoot = Files.Class.absolute(root);
    const projectName = this.projectNameForRoot(absoluteRoot);
    if (projectName) this.workspace.name.value = projectName;
    const metadataPath = Files.Class.join(absoluteRoot, '.git');
    this.workspace.worktreeName.value =
      Files.Class.exists(metadataPath) && !Files.Class.isDir(metadataPath)
        ? Files.Class.basename(absoluteRoot) || null
        : null;
    this.repository.value = new GitRepository.Class(root);
    this.commitLog.value = new CommitLog.Class(root);
    this.commitExpansion.value = new CommitExpansion.Class(root);
    this.activateResources();
    this.blameCache?.dispose();
    this.blameCache = new GitBlameCache.Class(root);
  }

  becameActive(handle: DocumentHandle.Model): void {
    if (!this.documentStates.has(handle)) this.opened(handle);
    void this.refreshDocumentHead(handle);
  }

  closed(handle: DocumentHandle.Model): void {
    this.documentStates.get(handle)?.invalidate();
    this.documentStates.delete(handle);
  }

  revision(handle: DocumentHandle.Model): unknown {
    return this.documentStates.get(handle)?.decorationRevision ?? 0;
  }

  byLine(handle: DocumentHandle.Model) {
    return this.documentStates.get(handle)?.decorationsByLine() ?? new Map();
  }

  protected async refreshDocumentHead(
    handle: DocumentHandle.Model,
  ): Promise<void> {
    const state = this.documentStates.get(handle);
    const document = handle.document;
    if (!state || !document || !document.path) return;
    const confinedPath = Files.Class.confineToRoot(
      this.workspace.root,
      document.path,
    );
    const requestGeneration = state.beginHeadRequest();
    if (confinedPath === null) {
      state.applyHeadText(requestGeneration, null);
      return;
    }
    const relativePath = Files.Class.relative(
      this.workspace.root,
      document.path,
    );
    const result = await this.GitCommands.fileAtRef(
      this.workspace.root,
      'HEAD',
      relativePath,
    );
    if (this.documentStates.get(handle) !== state) return;
    state.applyHeadText(
      requestGeneration,
      result.code === 0 ? result.stdout : null,
    );
  }

  get activeLineBlame(): BlameLine | null {
    const handle = this.workspace.activeDocumentHandle;
    const document = handle?.document;
    if (
      !handle ||
      !document ||
      !this.blameCache ||
      !this.repository.value ||
      this.showingComparison.value
    ) {
      return null;
    }
    return this.blameCache.lineBlame(
      document.path,
      this.workspace.editor.cursor.line.value,
    );
  }

  get hasLiveWatcher(): boolean {
    return this.watcher !== null;
  }

  get activationIgnoreQuerySubprocessCount(): number {
    void this.watcherStatusRevision.value;
    return this.watcher?.activationIgnoreQuerySubprocesses ?? 0;
  }

  get activationWatchedDirectoryCount(): number {
    void this.watcherStatusRevision.value;
    return this.watcher?.activationWatchedDirectories ?? 0;
  }

  get activationCompleted(): boolean {
    void this.watcherStatusRevision.value;
    return this.watcher?.activationCompleted ?? false;
  }

  get tabDetail(): string {
    const branch = this.repository.value?.branch.value ?? '';
    if (branch === '(detached)') {
      const head = this.repository.value?.head.value ?? '';
      return head ? head.slice(0, 7) : '(detached)';
    }
    return branch;
  }

  get splitRatio(): number {
    return this.splitRatioSetting.value.value;
  }

  setSplit(ratio: number): void {
    const clampedRatio = Math.max(0.15, Math.min(0.85, ratio));
    this.panel.setSplit(clampedRatio);
    this.splitRatioSetting.value.value = clampedRatio;
  }

  persistSplit(): void {
    this.splitRatioSetting.save();
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

  show(): void {
    this.workspace.focusPrimaryPane('git');
    void this.repository.value?.refresh().then(() => this.reconcileLogTip());
    void this.commitLog.value?.ensureRange(0, 50);
  }

  protected expandedEntries() {
    return this.commitExpansion.value?.entries.value ?? [];
  }

  logFlatEnd(): number {
    const end =
      this.commitLog.value?.knownEnd.value ?? Number.POSITIVE_INFINITY;
    return GitLogRows.Class.totalFlatRows(this.expandedEntries(), end);
  }

  logRowAt(flatIndex: number): CommitLogRow | null {
    const commitLog = this.commitLog.value;
    if (!commitLog || flatIndex < 0) return null;
    return (
      GitLogRows.Class.commitLogRows(
        flatIndex,
        1,
        this.expandedEntries(),
        (commitIndex) => commitLog.rows(commitIndex, 1)[0],
        commitLog.knownEnd.value,
      )[0] ?? null
    );
  }

  ensureLogWindow(flatTop: number, count = 50): void {
    const commitLog = this.commitLog.value;
    if (!commitLog) return;
    const firstCommitIndex = GitLogRows.Class.commitIndexAtFlatRow(
      this.expandedEntries(),
      Math.max(0, flatTop),
    );
    void commitLog.ensureRange(firstCommitIndex, count);
  }

  async reconcileLogTip(): Promise<void> {
    const repository = this.repository.value;
    const commitLog = this.commitLog.value;
    if (!repository || !commitLog) return;
    const probeGeneration = ++this.logTipProbeGeneration;
    const viewedBranch = commitLog.branch.value;
    let actualTipSha = '';
    if (viewedBranch === undefined) {
      actualTipSha = repository.head.value;
    } else {
      const result = await this.GitCommands.revParse(
        commitLog.cwd,
        `refs/heads/${viewedBranch}`,
      );
      if (
        probeGeneration !== this.logTipProbeGeneration ||
        this.commitLog.value !== commitLog ||
        commitLog.branch.value !== viewedBranch
      ) {
        return;
      }
      if (result.code !== 0) {
        this.selectLogBranch(null);
        return;
      }
      actualTipSha = result.stdout.trim();
    }
    if (
      !actualTipSha ||
      commitLog.loadedTipSha === null ||
      commitLog.loadedTipSha === actualTipSha
    ) {
      return;
    }
    this.commitExpansion.value?.reset();
    commitLog.reset();
    this.ensureLogWindow(this.panel.logScrollTop.value);
  }

  async localLogBranches(): Promise<string[]> {
    const commitLog = this.commitLog.value;
    if (!commitLog) return [];
    const result = await this.GitCommands.localBranches(commitLog.cwd);
    return result.code === 0
      ? GitParsers.Class.parseLocalBranches(result.stdout)
      : [];
  }

  selectLogBranch(branchName: string | null): void {
    const commitLog = this.commitLog.value;
    if (!commitLog) return;
    const checkedOutBranch = this.repository.value?.branch.value ?? '';
    const normalizedBranch =
      branchName === null || branchName === checkedOutBranch
        ? undefined
        : branchName;
    if (commitLog.branch.value === normalizedBranch) return;
    this.logTipProbeGeneration += 1;
    this.commitExpansion.value?.reset();
    commitLog.setBranch(normalizedBranch);
    this.panel.region.value = 'log';
    this.panel.logIndex.value = 0;
    this.panel.logScrollTop.value = 0;
    this.ensureLogWindow(0);
  }

  async cycleLogBranch(): Promise<void> {
    const branchNames = await this.localLogBranches();
    if (branchNames.length === 0) return;
    const checkedOutBranch = this.repository.value?.branch.value ?? '';
    const viewedBranch = this.commitLog.value?.branch.value ?? checkedOutBranch;
    const viewedIndex = branchNames.indexOf(viewedBranch);
    const nextBranch = branchNames[(viewedIndex + 1) % branchNames.length];
    if (nextBranch !== undefined) this.selectLogBranch(nextBranch);
  }

  previewLogRow(flatIndex: number): void {
    void this.showLogRowComparison(flatIndex, false);
  }

  activateLogRow(flatIndex: number): void {
    void this.showLogRowComparison(flatIndex, true);
  }

  expandLogRow(flatIndex: number): void {
    const row = this.logRowAt(flatIndex);
    const expansion = this.commitExpansion.value;
    if (row?.kind !== 'commit' || !row.record || !expansion) return;
    void expansion.expand(row.commitIndex, row.record.sha);
  }

  toggleLogRow(flatIndex: number): void {
    const row = this.logRowAt(flatIndex);
    const expansion = this.commitExpansion.value;
    if (row?.kind !== 'commit' || !row.record || !expansion) return;
    const wasExpanded = expansion.isExpanded(row.record.sha);
    expansion.toggle(row.commitIndex, row.record.sha);
    if (wasExpanded) {
      this.selectCollapsedCommitHeader(row.commitIndex);
      return;
    }
    this.previewLogRow(flatIndex);
  }

  protected async showLogRowComparison(
    flatIndex: number,
    transferFocus: boolean,
  ): Promise<void> {
    const requestGeneration = ++this.diffOpenRequestGeneration;
    const row = this.logRowAt(flatIndex);
    const expansion = this.commitExpansion.value;
    if (!row || !expansion) return;
    if (row.kind === 'commitFile') {
      await this.loadCommitFileDiff(
        row.sha,
        row.path,
        transferFocus,
        requestGeneration,
      );
      return;
    }
    if (row.kind !== 'commit' || !row.record) return;
    await expansion.expand(row.commitIndex, row.record.sha);
    if (requestGeneration !== this.diffOpenRequestGeneration) return;
    const expandedCommit = expansion.entries.value.find(
      (entry) => entry.sha === row.record?.sha,
    );
    const firstChangedFile = expandedCommit?.files?.[0];
    if (!firstChangedFile) return;
    await this.loadCommitFileDiff(
      row.record.sha,
      firstChangedFile.path,
      transferFocus,
      requestGeneration,
    );
  }

  collapseLogRow(flatIndex: number): void {
    const row = this.logRowAt(flatIndex);
    const expansion = this.commitExpansion.value;
    if (!row || !expansion) return;
    const sha = row.kind === 'commit' ? row.record?.sha : row.sha;
    if (!sha || !expansion.isExpanded(sha)) return;
    expansion.collapse(sha);
    this.selectCollapsedCommitHeader(row.commitIndex);
  }

  protected selectCollapsedCommitHeader(commitIndex: number): void {
    const expansion = this.commitExpansion.value;
    if (!expansion) return;
    const headerFlatIndex = GitLogRows.Class.commitFlatIndex(
      expansion.entries.value,
      commitIndex,
    );
    this.panel.logIndex.value = headerFlatIndex;
    if (this.panel.logScrollTop.value > headerFlatIndex) {
      this.panel.logScrollTop.value = headerFlatIndex;
    }
  }

  protected async fileTextAtReference(
    reference: string,
    filePath: string,
  ): Promise<string> {
    const result = await this.GitCommands.fileAtRef(
      this.workspace.root,
      reference,
      filePath,
    );
    return result.code === 0 ? result.stdout : '';
  }

  async openCommitFileDiff(
    sha: string,
    filePath: string,
    transferFocus = true,
  ): Promise<void> {
    const requestGeneration = ++this.diffOpenRequestGeneration;
    await this.loadCommitFileDiff(
      sha,
      filePath,
      transferFocus,
      requestGeneration,
    );
  }

  protected async loadCommitFileDiff(
    sha: string,
    filePath: string,
    transferFocus: boolean,
    requestGeneration: number,
  ): Promise<void> {
    const previousVersionText = await this.fileTextAtReference(
      `${sha}^`,
      filePath,
    );
    const currentVersionText = await this.fileTextAtReference(sha, filePath);
    if (requestGeneration !== this.diffOpenRequestGeneration) return;
    this.showComparison(
      {
        previousVersionText,
        currentVersionText,
        previousVersionPath: `${filePath} @ ${sha.slice(0, 7)}^`,
        currentVersionPath: filePath,
      },
      transferFocus,
    );
  }

  protected workingFileText(filePath: string): string {
    const absolutePath = Files.Class.join(this.workspace.root, filePath);
    if (!Files.Class.exists(absolutePath) || Files.Class.isDir(absolutePath)) {
      return '';
    }
    try {
      return Files.Class.read(absolutePath);
    } catch {
      return '';
    }
  }

  async openChangeAtRow(rowIndex: number): Promise<void> {
    const repository = this.repository.value;
    if (!repository) return;
    const rows = GitRows.Class.buildChangeRows(
      repository.staged.value,
      repository.unstaged.value,
      repository.untracked.value,
    );
    const row = rows[rowIndex];
    if (row?.kind !== 'file') return;
    const requestGeneration = ++this.diffOpenRequestGeneration;
    let previousVersionText = '';
    let currentVersionText = '';
    if (row.bucket === 'staged') {
      previousVersionText = await this.fileTextAtReference('HEAD', row.path);
      currentVersionText = await this.fileTextAtReference('', row.path);
    } else if (row.bucket === 'unstaged') {
      previousVersionText = await this.fileTextAtReference('', row.path);
      currentVersionText = this.workingFileText(row.path);
    } else {
      currentVersionText = this.workingFileText(row.path);
    }
    if (requestGeneration !== this.diffOpenRequestGeneration) return;
    this.showComparison(
      {
        previousVersionText,
        currentVersionText,
        previousVersionPath: row.path,
        currentVersionPath: row.path,
      },
      true,
    );
  }

  async toggleStageAtRow(rowIndex: number): Promise<void> {
    const repository = this.repository.value;
    if (!repository) return;
    const rows = this.currentChangeRows();
    const row = rows[rowIndex];
    if (row?.kind !== 'file') return;
    if (row.bucket === 'staged') await repository.unstage([row.path]);
    else await repository.stage([row.path]);
    await repository.refresh();
  }

  currentChangeRows() {
    const repository = this.repository.value;
    return repository
      ? GitRows.Class.buildChangeRows(
          repository.staged.value,
          repository.unstaged.value,
          repository.untracked.value,
        )
      : [];
  }

  protected selectedFileRows(): Array<{
    path: string;
    bucket: 'staged' | 'unstaged' | 'untracked';
  }> {
    const selectedPaths = this.panel.selectedPaths.value;
    return this.currentChangeRows().filter(
      (
        row,
      ): row is {
        kind: 'file';
        path: string;
        bucket: 'staged' | 'unstaged' | 'untracked';
        glyph: string;
      } => row.kind === 'file' && selectedPaths.has(row.path),
    );
  }

  async stageSelected(): Promise<void> {
    const repository = this.repository.value;
    const targets = this.selectedFileRows().filter(
      (row) => row.bucket !== 'staged',
    );
    if (!repository || targets.length === 0) return;
    await repository.stage(targets.map((row) => row.path));
    await repository.refresh();
  }

  async unstageSelected(): Promise<void> {
    const repository = this.repository.value;
    const targets = this.selectedFileRows().filter(
      (row) => row.bucket === 'staged',
    );
    if (!repository || targets.length === 0) return;
    await repository.unstage(targets.map((row) => row.path));
    await repository.refresh();
  }

  requestDiscardAtRow(rowIndex: number): void {
    const row = this.currentChangeRows()[rowIndex];
    if (row?.kind !== 'file') return;
    this.panel.confirmDiscard.value = {
      paths: [row.path],
      buckets: new Map([[row.path, row.bucket]]),
    };
  }

  requestDiscardSelected(): void {
    const targets = this.selectedFileRows();
    if (targets.length === 0) return;
    this.panel.confirmDiscard.value = {
      paths: targets.map((row) => row.path),
      buckets: new Map(targets.map((row) => [row.path, row.bucket])),
    };
  }

  async confirmDiscard(): Promise<void> {
    const pending = this.panel.confirmDiscard.value;
    const repository = this.repository.value;
    this.panel.confirmDiscard.value = null;
    if (!pending || !repository) return;
    for (const filePath of pending.paths) {
      const bucket = pending.buckets.get(filePath);
      if (bucket) {
        await this.GitCommands.discard(this.workspace.root, filePath, bucket);
      }
    }
    this.panel.clearSelectedPaths();
    await repository.refresh();
  }

  cancelDiscard(): void {
    this.panel.confirmDiscard.value = null;
  }

  scrollLog(rowDelta: number): void {
    const end = this.logFlatEnd();
    const maximumScrollTop = Number.isFinite(end)
      ? Math.max(0, end - 1)
      : this.panel.logScrollTop.value + Math.max(0, rowDelta);
    this.panel.logScrollTop.value = Math.max(
      0,
      Math.min(this.panel.logScrollTop.value + rowDelta, maximumScrollTop),
    );
    this.ensureLogWindow(this.panel.logScrollTop.value);
  }

  impulseLog(rowDelta: number): void {
    Momentum.Class.queueImpulse(this.panel.logMomentum.value, rowDelta);
  }

  impulseChanges(rowDelta: number): void {
    Momentum.Class.queueImpulse(this.panel.changesMomentum.value, rowDelta);
  }

  impulseChangesHorizontal(columnDelta: number): void {
    Momentum.Class.queueImpulse(
      this.panel.changesHorizontalMomentum.value,
      columnDelta,
    );
  }

  impulseLogHorizontal(columnDelta: number): void {
    Momentum.Class.queueImpulse(
      this.panel.logHorizontalMomentum.value,
      columnDelta,
    );
  }

  haltLogScroll(): void {
    this.panel.logMomentum.value = Momentum.Class.halt();
  }

  haltChangesScroll(): void {
    this.panel.changesMomentum.value = Momentum.Class.halt();
  }

  tickScroll(deltaSeconds: number): boolean {
    const logStep = Momentum.Class.stepMomentum(
      this.panel.logMomentum.value,
      deltaSeconds,
      this.flingMomentum,
    );
    this.panel.logMomentum.value = logStep.momentum;
    if (logStep.rows !== 0) this.scrollLog(logStep.rows);

    const changesStep = Momentum.Class.stepMomentum(
      this.panel.changesMomentum.value,
      deltaSeconds,
      this.flingMomentum,
    );
    this.panel.changesMomentum.value = changesStep.momentum;
    if (changesStep.rows !== 0) {
      const changesRegionHeight = Math.max(
        1,
        Math.max(
          2,
          Math.floor(
            this.workspace.editor.viewport.height.value * this.splitRatio,
          ),
        ) - 1,
      );
      const maximumScrollTop = Math.max(
        0,
        this.currentChangeRows().length - changesRegionHeight,
      );
      this.panel.changesScrollTop.value = Math.max(
        0,
        Math.min(
          this.panel.changesScrollTop.value + changesStep.rows,
          maximumScrollTop,
        ),
      );
    }

    const changesHorizontalStep = Momentum.Class.stepMomentum(
      this.panel.changesHorizontalMomentum.value,
      deltaSeconds,
    );
    this.panel.changesHorizontalMomentum.value = changesHorizontalStep.momentum;
    if (changesHorizontalStep.rows !== 0) {
      this.panel.scrollChangesByColumns(changesHorizontalStep.rows);
    }

    const logHorizontalStep = Momentum.Class.stepMomentum(
      this.panel.logHorizontalMomentum.value,
      deltaSeconds,
    );
    this.panel.logHorizontalMomentum.value = logHorizontalStep.momentum;
    if (logHorizontalStep.rows !== 0) {
      this.panel.scrollLogByColumns(logHorizontalStep.rows);
    }

    return [
      logStep.momentum,
      changesStep.momentum,
      changesHorizontalStep.momentum,
      logHorizontalStep.momentum,
    ].some((momentum) => Momentum.Class.isMoving(momentum));
  }

  get renderVersion() {
    const repository = this.repository.value;
    const commitLog = this.commitLog.value;
    void repository?.branch.value;
    void repository?.head.value;
    void repository?.staged.value;
    void repository?.unstaged.value;
    void repository?.untracked.value;
    void repository?.refreshing.value;
    void commitLog?.cache.value;
    void commitLog?.knownEnd.value;
    void commitLog?.branch.value;
    void this.commitExpansion.value?.entries.value;
    void this.panel.changesIndex.value;
    void this.panel.logIndex.value;
    void this.panel.logScrollTop.value;
    void this.panel.changesScrollTop.value;
    void this.panel.logScrollLeft.value;
    void this.panel.changesScrollLeft.value;
    void this.panel.changesHovered.value;
    void this.panel.logHovered.value;
    void this.panel.confirmDiscard.value;
    void this.panel.splitRatio.value;
    void this.panel.selectedPaths.value;
    for (const state of this.documentStates.values()) {
      void state.headText.value;
      void state.hasHeadText.value;
    }
    return Date.now();
  }
}

export namespace GitWorkspace {
  export const $Class = $GitWorkspace;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

/** The two full-text SIDES of a comparison the source-control plugin puts on the editor surface
 *  (the token forces the view host to rebuild). */
export interface GitComparisonRequest {
  token: number;
  previousVersionText: string;
  currentVersionText: string;
  previousVersionPath: string;
  currentVersionPath: string;
}
