import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import { CommandScoring } from '../commands/CommandScoring';
import { TextInputModel, type TextInputAction } from '../text/TextInputModel';
import { Files } from '../system/Files';
import { Logging } from '../system/Logging';
import { Processes, type RunResult } from '../system/Processes';

// invariant: Editable text fields share one input model (project.invariants.md)
class $QuickOpen {
  /** Upper bound on entries the open-project navigator classifies per listing. */
  protected static get SIBLING_FOLDER_ENTRY_LIMIT(): number {
    return 2000;
  }

  protected static get PROJECT_FILE_ENTRY_LIMIT(): number {
    return 2000;
  }

  protected readonly queryInputModel: TextInputModel.Model;

  constructor(readonly options: QuickOpenOptions = {}) {
    this.queryInputModel = this.createQueryInput();
  }

  protected createQueryInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  get open() {
    return ref(false);
  }

  get queryInput(): TextInputModel.Model {
    return this.queryInputModel;
  }
  get query() {
    return this.queryInput.text;
  }

  get mode() {
    return ref<QuickOpenMode>('files');
  }

  get errorMessage() {
    return ref('');
  }

  get fileEnumerationState() {
    return ref<ProjectFileEnumerationState>('idle');
  }

  get fileEnumerationMessage() {
    return ref('');
  }

  get matches() {
    return shallowRef<readonly QuickOpenMatch[]>([]);
  }

  get selectedIndex() {
    return ref(-1);
  }

  // Transient pointer highlight over a result row — never selection truth (mirrors the tree/git panes'
  // hoveredIndex). The renderer paints it as a subtle row background; a click promotes it to selection.
  get hoveredIndex() {
    return ref(-1);
  }

  /** Which gesture the user is making in the path navigator: BROWSING (they moved the highlight with
   *  arrows or a click) or TYPING (any query edit clears it). Not reactive — no renderable reads it;
   *  it only disambiguates what Enter commits, since the listing always auto-highlights row 0. */
  protected selectionMovedByUser = false;

  // True when the CURRENT open-project input path is an existing directory (what Enter would open).
  // Recomputed live on every keystroke in the path navigator; the input paints a warning glyph when
  // false so an un-openable path is obvious at a glance. Always true outside the path navigator.
  get workspacePathOpenable() {
    return ref(true);
  }

  protected projectFiles: readonly string[] = [];
  protected latestEnumerationRequestIdentifier = 0;

  // Path-navigator state (workspacePath mode): the directory currently listed and its subfolders,
  // cached so a keystroke that stays within the same directory re-filters instead of re-reading it.
  protected workspaceDirectory: string | null = null;
  protected workspaceSubfolders: readonly string[] = [];

  /** Open quick-open and replace its candidates with the project files reported by ripgrep. */
  async show(projectRoot: string): Promise<void> {
    const enumerationRequestIdentifier = ++this
      .latestEnumerationRequestIdentifier;
    this.open.value = true;
    this.mode.value = 'files';
    this.queryInput.clear();
    this.errorMessage.value = '';
    this.fileEnumerationState.value = 'loading';
    this.fileEnumerationMessage.value = '';
    this.projectFiles = [];
    this.matches.value = [];
    this.selectedIndex.value = -1;
    this.hoveredIndex.value = -1;
    this.workspacePathOpenable.value = true;

    let enumerationResult: ProjectFileEnumerationResult;
    try {
      enumerationResult = await this.enumerateProjectFiles(projectRoot);
    } catch {
      enumerationResult = {
        files: [],
        state: 'failed',
        message: 'Project file scan failed',
      };
    }

    // invariant: An async result can outlive the state it described (project.invariants.md)
    if (
      enumerationRequestIdentifier !==
        this.latestEnumerationRequestIdentifier ||
      !this.open.value
    ) {
      return;
    }

    this.projectFiles = enumerationResult.files;
    this.fileEnumerationState.value = enumerationResult.state;
    this.fileEnumerationMessage.value = enumerationResult.message;
    this.refilter();
  }

  /** Replace the query and synchronously rebuild the ranked candidate list. */
  setQuery(text: string): void {
    this.queryInput.setValue(text);
    this.onQueryEdited();
  }

  insertQuery(text: string): void {
    if (!this.queryInput.insert(text)) return;
    this.onQueryEdited();
  }

  applyQueryInputAction(action: TextInputAction): void {
    if (
      action === 'moveRight' &&
      this.mode.value === 'workspacePath' &&
      this.queryInput.isAtEnd
    ) {
      this.navigateIntoSelected();
      return;
    }
    const originalQuery = this.queryInput.value;
    this.queryInput.apply(action);
    if (this.queryInput.value !== originalQuery) this.onQueryEdited();
  }

  protected onQueryEdited(): void {
    this.errorMessage.value = '';
    // Editing the query is the TYPING gesture: the auto-highlighted first row is a listing artifact,
    // not the user's choice, so Enter must commit the typed path until they browse again.
    this.selectionMovedByUser = false;
    this.refilter();
  }

  /**
   * Open the project-folder picker as a LIVE PATH NAVIGATOR (VS Code-style path completion). When the
   * current workspace root is given, the input is prefilled with the ABSOLUTE path of the root's parent
   * directory (trailing slash) so the picker opens listing the parent's subfolders — the current
   * project's siblings. Typing re-roots the listing live; clicking a folder drills into it; Enter opens
   * the current path. Without a root the picker stays a blank free-form path prompt.
   */
  // invariant: The open-project path input is a live directory navigator (src/modules/search/search.invariants.md)
  showWorkspacePath(workspaceRoot?: string): void {
    ++this.latestEnumerationRequestIdentifier;
    this.open.value = true;
    this.mode.value = 'workspacePath';
    this.queryInput.clear();
    this.errorMessage.value = '';
    this.fileEnumerationState.value = 'idle';
    this.fileEnumerationMessage.value = '';
    this.projectFiles = [];
    this.matches.value = [];
    this.selectedIndex.value = -1;
    this.hoveredIndex.value = -1;
    this.workspacePathOpenable.value = true;
    this.workspaceDirectory = null;
    this.workspaceSubfolders = [];
    this.selectionMovedByUser = false;

    if (workspaceRoot === undefined) return;

    const parentDirectory = Files.Class.dirname(
      Files.Class.absolute(workspaceRoot),
    );
    this.setQuery(`${parentDirectory}/`);
  }

  /** Drill into the highlighted subfolder: complete the path with its name + `/` and re-list its
   *  contents. The mouse click and the keyboard both reach the navigator through this one method. */
  // invariant: The open-project path input is a live directory navigator (src/modules/search/search.invariants.md)
  navigateIntoSelected(): void {
    const folderPath = this.matches.value[this.selectedIndex.value]?.path;
    if (folderPath === undefined) return;
    this.setQuery(`${folderPath}/`);
  }

  setError(message: string): void {
    this.errorMessage.value = message;
  }

  /** Move the active match without wrapping beyond either end of the list. */
  moveSelection(delta: number): void {
    const total = this.matches.value.length;
    if (total === 0) {
      this.selectedIndex.value = -1;
      return;
    }

    // Wrap around at both ends (VS Code quick-open parity): arrowing past the last item jumps back to
    // the FIRST ('starts from the top') and past the first wraps to the last — so you never dead-end
    // beyond the visible list. A -1 (no) selection + Down lands on 0. The euclidean modulo keeps the
    // index in [0, total) for any delta sign.
    this.selectedIndex.value =
      (((this.selectedIndex.value + delta) % total) + total) % total;
    this.selectionMovedByUser = true; // arrowing is the BROWSING gesture — Enter commits this row
  }

  /** Click-set the active match to a pointed row (mouse selection); ignored when the row has no match. */
  // invariant: Search results are click-set and highlight-shown (src/modules/search/search.invariants.md)
  setSelectedIndex(index: number): void {
    if (index < 0 || index >= this.matches.value.length) return;
    this.selectedIndex.value = index;
    this.selectionMovedByUser = true; // a click-set row is the user's choice, same as arrowing
  }

  /** Point the transient hover highlight at a row; an out-of-range row (or -1) clears it. */
  setHoveredIndex(index: number): void {
    this.hoveredIndex.value =
      index >= 0 && index < this.matches.value.length ? index : -1;
  }

  /** Return the path to open. The caller owns opening the file/folder and closing quick-open. In
   *  files mode this is the selected file. In the path-navigator the target depends on which gesture
   *  the user is making, because the listing ALWAYS auto-highlights its first row: while BROWSING
   *  (arrow keys or a click moved the highlight) the highlighted subfolder commits — arrowing down and
   *  pressing Enter must open the row you are looking at, not the parent the input still names (the
   *  reported defect). While TYPING (any query edit resets the gesture) the input path commits
   *  verbatim, so a fully typed path still opens exactly what was typed. */
  // invariant: Quick Open activates the selected entry (src/modules/search/search.invariants.md)
  activate(): string | null {
    if (this.mode.value === 'workspacePath') {
      const browsedFolderPath = this.selectionMovedByUser
        ? this.matches.value[this.selectedIndex.value]?.path
        : undefined;
      if (browsedFolderPath !== undefined) {
        return this.stripTrailingSlash(browsedFolderPath);
      }
      const workspacePath = this.stripTrailingSlash(this.query.value.trim());
      return workspacePath.length > 0 ? workspacePath : null;
    }
    return this.matches.value[this.selectedIndex.value]?.path ?? null;
  }

  close(): void {
    ++this.latestEnumerationRequestIdentifier;
    this.open.value = false;
    this.mode.value = 'files';
    this.queryInput.clear();
    this.errorMessage.value = '';
    this.fileEnumerationState.value = 'idle';
    this.fileEnumerationMessage.value = '';
    this.projectFiles = [];
    this.matches.value = [];
    this.selectedIndex.value = -1;
    this.hoveredIndex.value = -1;
    this.workspacePathOpenable.value = true;
    this.selectionMovedByUser = false;
  }

  protected async enumerateProjectFiles(
    projectRoot: string,
  ): Promise<ProjectFileEnumerationResult> {
    // invariant: File enumeration failures stay visible (src/modules/search/search.invariants.md)
    if (this.options.enumerateProjectFiles) {
      return {
        files: await this.options.enumerateProjectFiles(projectRoot),
        state: 'complete',
        message: '',
      };
    }

    const ripgrepResult = await this.runProcess(['rg', '--files'], projectRoot);
    if (
      ripgrepResult.ok ||
      (ripgrepResult.code === 1 && ripgrepResult.stderr.length === 0)
    ) {
      return {
        files: this.pathsFromProcessOutput(ripgrepResult.stdout),
        state: 'complete',
        message: '',
      };
    }
    // Fallback when ripgrep is not installed: git's tracked + untracked-non-ignored files (the same
    // .gitignore-respecting set rg --files gives). Keeps go-to-file working on a machine without rg.
    const gitResult = await this.runProcess(
      ['git', 'ls-files', '--cached', '--others', '--exclude-standard'],
      projectRoot,
    );
    if (gitResult.ok) {
      return {
        files: this.pathsFromProcessOutput(gitResult.stdout),
        state: 'complete',
        message: '',
      };
    }

    const directoryWalkResult =
      this.enumerateProjectFilesByDirectoryWalk(projectRoot);
    if (directoryWalkResult.ok) {
      const projectFileEntryLimit = (this.constructor as typeof $QuickOpen)
        .PROJECT_FILE_ENTRY_LIMIT;
      return {
        files: directoryWalkResult.files,
        state: 'degraded',
        message: directoryWalkResult.entryLimitReached
          ? `Bounded folder scan reached ${projectFileEntryLimit} entries`
          : 'Bounded folder scan',
      };
    }
    return {
      files: [],
      state: 'failed',
      message: 'Project files unavailable',
    };
  }

  protected runProcess(
    argumentVector: string[],
    workingDirectory: string,
  ): Promise<RunResult> {
    if (this.options.runProcess) {
      return this.options.runProcess(argumentVector, workingDirectory);
    }
    return Processes.Class.run(argumentVector, workingDirectory);
  }

  protected pathsFromProcessOutput(output: string): readonly string[] {
    return output.split('\n').filter((filePath) => filePath.length > 0);
  }

  protected enumerateProjectFilesByDirectoryWalk(
    projectRoot: string,
  ): ProjectFileWalkResult {
    const pendingRelativeDirectories = [''];
    const projectFiles: string[] = [];
    const projectFileEntryLimit = (this.constructor as typeof $QuickOpen)
      .PROJECT_FILE_ENTRY_LIMIT;
    let nextDirectoryIndex = 0;
    let inspectedEntryCount = 0;
    let entryLimitReached = false;

    while (nextDirectoryIndex < pendingRelativeDirectories.length) {
      const relativeDirectory =
        pendingRelativeDirectories[nextDirectoryIndex++] ?? '';
      const directoryPath =
        relativeDirectory.length === 0
          ? projectRoot
          : Files.Class.join(projectRoot, relativeDirectory);
      const listingResult = this.listDirectoryNamesResult(directoryPath);
      if (!listingResult.ok) {
        if (relativeDirectory.length === 0) {
          return { ok: false, files: [], entryLimitReached: false };
        }
        continue;
      }

      const entryNames = [...listingResult.entryNames].sort();
      for (const entryName of entryNames) {
        if (inspectedEntryCount >= projectFileEntryLimit) {
          entryLimitReached = true;
          break;
        }
        inspectedEntryCount++;
        if (entryName === '.git') continue;

        const relativeEntryPath =
          relativeDirectory.length === 0
            ? entryName
            : Files.Class.join(relativeDirectory, entryName);
        const entryPath = Files.Class.join(projectRoot, relativeEntryPath);
        let entryIsDirectory: boolean;
        try {
          entryIsDirectory = this.isDirectory(entryPath);
        } catch {
          continue;
        }
        if (entryIsDirectory) {
          pendingRelativeDirectories.push(relativeEntryPath);
        } else {
          projectFiles.push(relativeEntryPath);
        }
      }
      if (entryLimitReached) break;
    }

    return { ok: true, files: projectFiles, entryLimitReached };
  }

  protected listDirectoryNamesResult(
    directory: string,
  ): DirectoryNameListingResult {
    if (this.options.listDirectoryNames) {
      try {
        return {
          ok: true,
          entryNames: this.options.listDirectoryNames(directory),
        };
      } catch {
        return { ok: false, entryNames: [] };
      }
    }
    const listingResult = Files.Class.listNamesResult(directory);
    return {
      ok: listingResult.ok,
      entryNames: listingResult.entryNames,
    };
  }

  /**
   * List a directory's subfolders for the navigator, HARDENED against the two ways this froze the app:
   *   - a directory with an unbounded number of entries — capped at SIBLING_FOLDER_ENTRY_LIMIT so the
   *     synchronous per-entry classification can never run longer than that fixed ceiling; and
   *   - a single pathological entry (broken symlink, vanished race, permission trap) whose stat throws —
   *     each classification is wrapped so one bad entry is skipped, never propagated as a hang or throw.
   * The fully-injected `enumerateSiblingFolders` seam bypasses this (navigator-logic tests); the default
   * builds on the `listDirectoryNames` + `isDirectory` seams so the cap + guard stay unit-testable.
   */
  protected enumerateSiblingFolders(
    parentDirectory: string,
  ): readonly string[] {
    if (this.options.enumerateSiblingFolders) {
      return this.options.enumerateSiblingFolders(parentDirectory);
    }
    const entryNames = this.listDirectoryNames(parentDirectory);
    const siblingFolderEntryLimit = (this.constructor as typeof $QuickOpen)
      .SIBLING_FOLDER_ENTRY_LIMIT;
    const cappedEntryNames =
      entryNames.length > siblingFolderEntryLimit
        ? entryNames.slice(0, siblingFolderEntryLimit)
        : entryNames;
    if (entryNames.length > siblingFolderEntryLimit) {
      Logging.Class.info(
        `QuickOpen: ${parentDirectory} has ${entryNames.length} entries; listing the first ${siblingFolderEntryLimit}`,
      );
    }
    const subfolderPaths: string[] = [];
    for (const entryName of cappedEntryNames) {
      const entryPath = Files.Class.join(parentDirectory, entryName);
      let entryIsDirectory = false;
      try {
        entryIsDirectory = this.isDirectory(entryPath);
      } catch {
        // A bad entry (broken symlink, race, permission trap) is skipped, never allowed to throw/hang.
        entryIsDirectory = false;
      }
      if (entryIsDirectory) subfolderPaths.push(entryPath);
    }
    return subfolderPaths;
  }

  protected listDirectoryNames(directory: string): readonly string[] {
    if (this.options.listDirectoryNames)
      return this.options.listDirectoryNames(directory);
    return Files.Class.listNames(directory);
  }

  protected isDirectory(path: string): boolean {
    if (this.options.isDirectory) return this.options.isDirectory(path);
    return Files.Class.isDir(path);
  }

  protected refilter(): void {
    if (this.mode.value === 'workspacePath') {
      this.refilterWorkspacePath();
      return;
    }

    const query = this.query.value;
    const scoredMatches: QuickOpenMatch[] = [];

    for (const filePath of this.projectFiles) {
      const score = CommandScoring.Class.fuzzyScore(query, filePath);
      if (score >= 0) scoredMatches.push({ path: filePath, score });
    }

    scoredMatches.sort(
      (firstMatch, secondMatch) =>
        firstMatch.score - secondMatch.score ||
        (firstMatch.path < secondMatch.path
          ? -1
          : firstMatch.path > secondMatch.path
            ? 1
            : 0),
    );
    this.matches.value = scoredMatches;
    this.selectedIndex.value = scoredMatches.length > 0 ? 0 : -1;
  }

  /**
   * The path navigator: split the input at the LAST `/` into the directory being browsed and the
   * filter segment after it. List that directory's subfolders (re-reading the filesystem only when the
   * directory changes — a keystroke within it re-filters the cache), rank them by the filter segment
   * (fuzzy, closest first; an empty segment lists all), and set them as the selectable open-targets.
   */
  // invariant: The open-project path input is a live directory navigator (src/modules/search/search.invariants.md)
  protected refilterWorkspacePath(): void {
    const query = this.query.value;
    const lastSlashIndex = query.lastIndexOf('/');
    const directoryPrefix =
      lastSlashIndex >= 0 ? query.slice(0, lastSlashIndex + 1) : '';
    const filterSegment =
      lastSlashIndex >= 0 ? query.slice(lastSlashIndex + 1) : query;

    // Live validity for the alert affordance: the path Enter would open is an existing directory.
    // invariant: An un-openable open-project path is flagged live (src/modules/search/search.invariants.md)
    const candidatePath = this.stripTrailingSlash(query.trim());
    this.workspacePathOpenable.value =
      candidatePath.length > 0 && this.isDirectory(candidatePath);

    if (directoryPrefix !== this.workspaceDirectory) {
      this.workspaceDirectory = directoryPrefix;
      this.workspaceSubfolders =
        directoryPrefix.length === 0
          ? []
          : this.enumerateSiblingFolders(
              this.directoryForListing(directoryPrefix),
            );
    }

    const scoredFolders: QuickOpenMatch[] = [];
    for (const folderPath of this.workspaceSubfolders) {
      const folderName = Files.Class.basename(folderPath);
      const score =
        filterSegment.length === 0
          ? 0
          : CommandScoring.Class.fuzzyScore(filterSegment, folderName);
      if (score >= 0) scoredFolders.push({ path: folderPath, score });
    }

    scoredFolders.sort(
      (firstFolder, secondFolder) =>
        firstFolder.score - secondFolder.score ||
        (firstFolder.path < secondFolder.path
          ? -1
          : firstFolder.path > secondFolder.path
            ? 1
            : 0),
    );
    this.matches.value = scoredFolders;
    this.selectedIndex.value = scoredFolders.length > 0 ? 0 : -1;
  }

  /** Directory to enumerate for a `dir/` prefix, keeping root `/` intact. */
  protected directoryForListing(directoryPrefix: string): string {
    if (directoryPrefix === '/') return '/';
    return directoryPrefix.endsWith('/')
      ? directoryPrefix.slice(0, -1)
      : directoryPrefix;
  }

  /** Strip one trailing slash for opening a path, keeping root `/` intact. */
  protected stripTrailingSlash(path: string): string {
    if (path === '/') return '/';
    return path.endsWith('/') ? path.slice(0, -1) : path;
  }
}

export namespace QuickOpen {
  export const $Class = Static($QuickOpen);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface QuickOpenMatch {
  path: string;
  score: number;
}

export type ProjectFileEnumerator = (
  projectRoot: string,
) => Promise<readonly string[]>;

export type ProcessRunner = (
  argumentVector: string[],
  workingDirectory: string,
) => Promise<RunResult>;

export type SiblingFolderEnumerator = (
  parentDirectory: string,
) => readonly string[];

export type DirectoryNameLister = (directory: string) => readonly string[];

export type DirectoryPredicate = (path: string) => boolean;

export interface QuickOpenOptions {
  enumerateProjectFiles?: ProjectFileEnumerator;
  runProcess?: ProcessRunner;
  enumerateSiblingFolders?: SiblingFolderEnumerator;
  listDirectoryNames?: DirectoryNameLister;
  isDirectory?: DirectoryPredicate;
}

export type QuickOpenMode = 'files' | 'workspacePath';

export type ProjectFileEnumerationState =
  'idle' | 'loading' | 'complete' | 'degraded' | 'failed';

export interface ProjectFileEnumerationResult {
  files: readonly string[];
  state: Exclude<ProjectFileEnumerationState, 'idle' | 'loading'>;
  message: string;
}

export interface ProjectFileWalkResult {
  ok: boolean;
  files: readonly string[];
  entryLimitReached: boolean;
}

export interface DirectoryNameListingResult {
  ok: boolean;
  entryNames: readonly string[];
}
