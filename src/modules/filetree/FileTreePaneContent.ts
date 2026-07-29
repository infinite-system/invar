import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';
import type { FileTreeWorkspace } from './FileTreeWorkspace';
import { TreePaneRenderer } from './TreePaneRenderer';

// invariant: The file tree is a pane content citizen (src/modules/ui/ui.invariants.md)
// invariant: The file tree costs only what is expanded and visible (src/modules/filetree/filetree.invariants.md)
// invariant: Selection is item-anchored click-set keyboard-moved and stays (src/modules/ui/ui.invariants.md)
class $FileTreePaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly activeWorkspace: () => FileTreeWorkspace.Model,
  ) {}

  get id(): string {
    return 'files';
  }

  get title(): string {
    return 'Files';
  }

  get activityLabel(): string {
    return 'Explorer';
  }

  get icon(): string {
    return this.application.theme.glyph('activityFiles');
  }

  get activityAction(): string {
    return 'view.showFiles';
  }

  get activityBadge(): number {
    return 0;
  }

  get keybindingContext(): string {
    return 'files';
  }

  get renderRevision() {
    return computed(() => this.readRenderVersion());
  }

  protected readRenderVersion(): string {
    void this.application.workspaceSet.activeWorkspaceIndex.value;
    const tree = this.activeWorkspace().tree;
    return [
      tree.version.value,
      tree.selectedIndex.value,
      tree.hoveredIndex.value,
      tree.scrollTop.value,
      tree.scrollLeft.value,
      tree.viewportHeight.value,
      tree.viewportWidth.value,
    ].join(':');
  }

  render(context: PaneRenderContext): StyledText {
    const tree = this.activeWorkspace().tree;
    const innerWidth = Math.max(1, context.width);
    return TreePaneRenderer.Class.render({
      tree,
      filesFocused:
        this.application.workspaceSet.active.focus.value === 'primaryPane' &&
        this.application.primaryDockHost.focused.value,
      palette: context.palette,
      icon: (name, isDirectory, expanded) =>
        this.application.theme.icon(name, isDirectory, expanded),
      height: Math.max(1, context.height),
      innerWidth,
      viewportWidth: Math.max(1, innerWidth - this.scrollbarThicknessCells),
      windowTop: tree.windowTop(),
    });
  }

  handleKey(_key: KeyEvent): boolean {
    return false;
  }

  onWheel(rowDelta: number): boolean {
    this.activeWorkspace().impulseVerticalScroll(rowDelta);
    this.application.requestRender();
    return true;
  }

  onHorizontalWheel(columnDelta: number): boolean {
    this.activeWorkspace().impulseHorizontalScroll(columnDelta);
    this.application.requestRender();
    return true;
  }

  onPointerMove(_column: number, row: number): boolean {
    const tree = this.activeWorkspace().tree;
    const rowIndex = tree.windowTop() + row;
    tree.hoveredIndex.value =
      rowIndex >= 0 && rowIndex < tree.rows.length ? rowIndex : -1;
    return true;
  }

  onPointerOut(): void {
    this.activeWorkspace().tree.hoveredIndex.value = -1;
  }

  onPointerDown(_column: number, row: number): boolean {
    const workspace = this.activeWorkspace();
    this.onFocus();
    workspace.haltVerticalScroll();
    const rowIndex = workspace.tree.windowTop() + row;
    if (rowIndex < 0 || rowIndex >= workspace.tree.rows.length) return false;
    workspace.tree.setSelection(rowIndex);
    workspace.activateSelected();
    this.application.requestRender();
    return true;
  }

  onResize(columns: number, rows: number): void {
    const tree = this.activeWorkspace().tree;
    const viewportHeight = Math.max(1, rows);
    const viewportWidth = Math.max(1, columns - this.scrollbarThicknessCells);
    if (tree.viewportHeight.value !== viewportHeight) {
      tree.viewportHeight.value = viewportHeight;
    }
    if (tree.viewportWidth.value !== viewportWidth) {
      tree.viewportWidth.value = viewportWidth;
      tree.clampHorizontalScroll();
    }
  }

  onFocus(): void {
    this.application.workspaceSet.active.focusPrimaryPane('files');
  }

  onBlur(): void {}

  dispose(): void {}

  get scrollTop(): number {
    return this.activeWorkspace().tree.scrollTop.value;
  }

  get scrollContentRows(): number {
    return this.activeWorkspace().tree.rows.length;
  }

  get scrollViewportRows(): number {
    return this.activeWorkspace().tree.viewportHeight.value;
  }

  haltScrollMomentum(): void {
    this.activeWorkspace().haltVerticalScroll();
  }

  scrollToLine(line: number): void {
    this.activeWorkspace().tree.scrollTop.value = line;
  }

  get scrollLeft(): number {
    return this.activeWorkspace().tree.scrollLeft.value;
  }

  get scrollContentColumns(): number {
    return this.activeWorkspace().tree.contentWidth;
  }

  get scrollViewportColumns(): number {
    return this.activeWorkspace().tree.viewportWidth.value;
  }

  haltHorizontalScrollMomentum(): void {
    this.activeWorkspace().haltHorizontalScroll();
  }

  scrollToColumn(column: number): void {
    this.activeWorkspace().tree.scrollLeft.value = column;
  }

  protected get scrollbarThicknessCells(): number {
    return Math.max(
      1,
      Math.round(this.application.settings.scrollbarThickness.value),
    );
  }
}

export namespace FileTreePaneContent {
  export const $Class = $FileTreePaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
