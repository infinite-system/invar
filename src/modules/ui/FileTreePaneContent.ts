import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { PaneContent, PaneRenderContext } from './PaneContent';
import { TreePaneRenderer } from './TreePaneRenderer';

// invariant: The file tree is a pane content citizen (src/modules/ui/ui.invariants.md)
// invariant: The file tree costs only what is expanded and visible (src/modules/workspace/workspace.invariants.md)
// invariant: Selection is item-anchored click-set keyboard-moved and stays (src/modules/ui/ui.invariants.md)
class $FileTreePaneContent implements PaneContent {
  constructor(
    protected readonly dependencies: FileTreePaneContentDependencies,
  ) {}

  get id(): string {
    return 'files';
  }

  get title(): string {
    return 'Files';
  }

  get icon(): string {
    return this.dependencies.icon('', true, true);
  }

  get renderRevision() {
    return ref(0);
  }

  render(context: PaneRenderContext): StyledText {
    const tree = this.dependencies.workspaceSet.active.tree;
    const innerWidth = Math.max(1, context.width);
    return TreePaneRenderer.Class.render({
      tree,
      filesFocused:
        this.dependencies.workspaceSet.active.focus.value === 'files',
      palette: context.palette,
      icon: this.dependencies.icon,
      height: Math.max(1, context.height),
      innerWidth,
      viewportWidth: Math.max(
        1,
        innerWidth - this.dependencies.scrollbarThicknessCells(),
      ),
      windowTop: tree.windowTop(),
    });
  }

  handleKey(_key: KeyEvent): boolean {
    return false;
  }

  onWheel(rowDelta: number): boolean {
    this.dependencies.workspaceSet.active.impulseTreeScroll(rowDelta);
    this.requestRender();
    return true;
  }

  onHorizontalWheel(columnDelta: number): boolean {
    this.dependencies.workspaceSet.active.impulseTreeHorizontalScroll(
      columnDelta,
    );
    this.requestRender();
    return true;
  }

  onPointerMove(_column: number, row: number): boolean {
    const tree = this.dependencies.workspaceSet.active.tree;
    const rowIndex = tree.windowTop() + row;
    tree.hoveredIndex.value =
      rowIndex >= 0 && rowIndex < tree.rows.length ? rowIndex : -1;
    this.requestRender();
    return true;
  }

  onPointerOut(): void {
    this.dependencies.workspaceSet.active.tree.hoveredIndex.value = -1;
    this.requestRender();
  }

  onPointerDown(_column: number, row: number): boolean {
    const workspace = this.dependencies.workspaceSet.active;
    workspace.focusFiles();
    workspace.haltTreeScroll();
    const rowIndex = workspace.tree.windowTop() + row;
    if (rowIndex < 0 || rowIndex >= workspace.tree.rows.length) return false;
    workspace.tree.setSelection(rowIndex);
    workspace.activate();
    this.requestRender();
    return true;
  }

  onResize(columns: number, rows: number): void {
    const tree = this.dependencies.workspaceSet.active.tree;
    const viewportHeight = Math.max(1, rows);
    const viewportWidth = Math.max(
      1,
      columns - this.dependencies.scrollbarThicknessCells(),
    );
    if (tree.viewportHeight.value !== viewportHeight) {
      tree.viewportHeight.value = viewportHeight;
    }
    if (tree.viewportWidth.value !== viewportWidth) {
      tree.viewportWidth.value = viewportWidth;
      tree.clampHorizontalScroll();
    }
  }

  onFocus(): void {
    this.dependencies.workspaceSet.active.focusFiles();
  }

  onBlur(): void {}

  dispose(): void {}

  protected requestRender(): void {
    this.renderRevision.value += 1;
  }
}

export namespace FileTreePaneContent {
  export const $Class = $FileTreePaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface FileTreePaneContentDependencies {
  workspaceSet: WorkspaceSet.Instance;
  icon: (
    name: string,
    isDirectory: boolean,
    expanded: boolean,
  ) => string;
  scrollbarThicknessCells: () => number;
}
