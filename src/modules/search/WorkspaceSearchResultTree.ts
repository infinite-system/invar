import { Reactive } from 'ivue';
import { Static } from 'ivue/extras';
import { ref } from 'vue';
import { WrapText } from '../ui/WrapText';
import type { WorkspaceSearchResult } from './WorkspaceSearchBackend';

// invariant: Cost tracks the actively observed set (project.invariants.md)
class $WorkspaceSearchResultTree {
  static get LIMIT_NOTICE_TEXT(): string {
    return 'Results limited to 20,000 matches. Narrow the search to see more.';
  }

  protected readonly collapsedFilePaths = new Set<string>();
  protected readonly dismissedResultKeys = new Set<string>();
  protected results: readonly WorkspaceSearchResult[] = [];
  protected limited = false;
  protected replacementPreviewsVisible = false;
  protected readonly rowStorage: WorkspaceSearchTreeRow[] = [];

  get version() {
    return ref(0);
  }

  get selectedIndex() {
    return ref(-1);
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

  get rows(): readonly WorkspaceSearchTreeRow[] {
    void this.version.value;
    return this.rowStorage;
  }

  get selectedCount(): number {
    return Math.max(0, this.results.length - this.dismissedResultKeys.size);
  }

  selectedResults(): readonly WorkspaceSearchResult[] {
    return this.results.filter(
      (result) => !this.dismissedResultKeys.has(this.resultKey(result)),
    );
  }

  reset(): void {
    this.results = [];
    this.limited = false;
    this.replacementPreviewsVisible = false;
    this.collapsedFilePaths.clear();
    this.dismissedResultKeys.clear();
    this.rowStorage.length = 0;
    this.selectedIndex.value = -1;
    this.hoveredIndex.value = -1;
    this.scrollTop.value = 0;
    this.version.value++;
  }

  updateResults(
    results: readonly WorkspaceSearchResult[],
    limited = false,
    replacementPreviewsVisible = false,
  ): void {
    this.results = results;
    this.limited = limited;
    this.replacementPreviewsVisible = replacementPreviewsVisible;
    this.rebuildRows();
  }

  toggleFile(relativePath: string): void {
    if (this.collapsedFilePaths.has(relativePath)) {
      this.collapsedFilePaths.delete(relativePath);
    } else {
      this.collapsedFilePaths.add(relativePath);
    }
    this.rebuildRows();
  }

  dismiss(result: WorkspaceSearchResult): void {
    this.dismissedResultKeys.add(this.resultKey(result));
    this.rebuildRows();
  }

  rowIsDismissed(row: WorkspaceSearchTreeRow): boolean {
    return row.result
      ? this.dismissedResultKeys.has(this.resultKey(row.result))
      : false;
  }

  setSelection(index: number): void {
    if (this.rowStorage.length === 0) {
      this.selectedIndex.value = -1;
      return;
    }
    this.selectedIndex.value = Math.max(
      0,
      Math.min(index, this.rowStorage.length - 1),
    );
    this.revealSelected();
  }

  moveSelection(delta: number): void {
    if (this.rowStorage.length === 0) return;
    const start = this.selectedIndex.value < 0 ? 0 : this.selectedIndex.value;
    this.setSelection(start + delta);
  }

  selectedRow(): WorkspaceSearchTreeRow | null {
    return this.rowStorage[this.selectedIndex.value] ?? null;
  }

  setViewportSize(width: number, height: number): void {
    const widthChanged = this.viewportWidth.value !== Math.max(1, width);
    this.viewportWidth.value = Math.max(1, width);
    this.viewportHeight.value = Math.max(1, height);
    if (widthChanged && this.limited) this.rebuildRows();
    else this.clampScroll();
  }

  scrollBy(delta: number): void {
    this.scrollTop.value += delta;
    this.clampScroll();
  }

  protected revealSelected(): void {
    const selectedIndex = this.selectedIndex.value;
    if (selectedIndex < this.scrollTop.value) {
      this.scrollTop.value = selectedIndex;
    } else if (
      selectedIndex >=
      this.scrollTop.value + this.viewportHeight.value
    ) {
      this.scrollTop.value = selectedIndex - this.viewportHeight.value + 1;
    }
    this.clampScroll();
  }

  protected clampScroll(): void {
    this.scrollTop.value = Math.max(
      0,
      Math.min(
        this.scrollTop.value,
        Math.max(0, this.rowStorage.length - this.viewportHeight.value),
      ),
    );
  }

  protected rebuildRows(): void {
    const previousSelected = this.selectedRow();
    const resultsByFile = new Map<string, WorkspaceSearchResult[]>();
    for (const result of this.results) {
      const fileResults = resultsByFile.get(result.relativePath) ?? [];
      fileResults.push(result);
      resultsByFile.set(result.relativePath, fileResults);
    }
    this.rowStorage.length = 0;
    for (const [relativePath, fileResults] of resultsByFile) {
      const collapsed = this.collapsedFilePaths.has(relativePath);
      this.rowStorage.push({
        kind: 'file',
        relativePath,
        result: null,
        matchCount: fileResults.length,
        collapsed,
      });
      if (collapsed) continue;
      for (const result of fileResults) {
        this.rowStorage.push({
          kind: 'match',
          relativePath,
          result,
          matchCount: 0,
          collapsed: false,
        });
        if (this.replacementPreviewsVisible) {
          this.rowStorage.push({
            kind: 'replacementPreview',
            relativePath,
            result,
            matchCount: 0,
            collapsed: false,
          });
        }
      }
    }
    if (this.limited) {
      for (const noticeText of this.limitNoticeLines()) {
        this.rowStorage.push({
          kind: 'limitNotice',
          relativePath: '',
          result: null,
          matchCount: 0,
          collapsed: false,
          noticeText,
        });
      }
    }
    const nextSelectedIndex = previousSelected
      ? this.rowStorage.findIndex(
          (row) =>
            row.kind === previousSelected.kind &&
            row.relativePath === previousSelected.relativePath &&
            this.optionalResultKey(row.result) ===
              this.optionalResultKey(previousSelected.result),
        )
      : -1;
    this.selectedIndex.value =
      nextSelectedIndex >= 0
        ? nextSelectedIndex
        : this.rowStorage.length > 0
          ? Math.min(
              Math.max(0, this.selectedIndex.value),
              this.rowStorage.length - 1,
            )
          : -1;
    this.hoveredIndex.value = -1;
    this.clampScroll();
    this.version.value++;
  }

  protected optionalResultKey(result: WorkspaceSearchResult | null): string {
    return result ? this.resultKey(result) : '';
  }

  protected resultKey(result: WorkspaceSearchResult): string {
    return [
      result.relativePath,
      result.line,
      result.startUtf16Offset,
      result.endUtf16Offset,
    ].join(':');
  }

  protected limitNoticeLines(): readonly string[] {
    const width = Math.max(1, this.viewportWidth.value - 2);
    const resultTreeClass = this
      .constructor as typeof $WorkspaceSearchResultTree;
    return WrapText.Class.wrap(resultTreeClass.LIMIT_NOTICE_TEXT, width);
  }
}

export namespace WorkspaceSearchResultTree {
  export const $Class = Static($WorkspaceSearchResultTree);
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface WorkspaceSearchTreeRow {
  readonly kind: 'file' | 'match' | 'replacementPreview' | 'limitNotice';
  readonly relativePath: string;
  readonly result: WorkspaceSearchResult | null;
  readonly matchCount: number;
  readonly collapsed: boolean;
  readonly noticeText?: string;
}
