// The structure navigator as a right-dock pane content citizen: a cells citizen — the host
// paints the StyledText this returns — occupying the dock beside the file it outlines with zero
// host wiring. It projects the ACTIVE workspace's outline, resolved late through the injected
// accessor, exactly like the file-tree pane.
//
// invariant: The structure navigator is a pane content citizen (src/modules/structure/structure.invariants.md)
// invariant: The outline projection has one depth and filter policy (src/modules/structure/structure.invariants.md)
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type {
  PaneContent,
  PaneRenderContext,
  PaneTextInputPort,
} from '../ui/PaneContent.interface';
import type { TextInputAction } from '../text/TextInputModel';
import { TextInputKey } from '../text/TextInputKey';
import { ThemeIcons } from '../theme/ThemeIcons';
import type { StructureWorkspace } from './StructureWorkspace';
import { StructurePaneRenderer } from './StructurePaneRenderer';

class $StructurePaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly activeWorkspace: () => StructureWorkspace.Model,
  ) {}

  protected filterCaretColumn = 0;

  get id(): string {
    return 'structure';
  }

  get title(): string {
    return 'Structure';
  }

  get activityLabel(): string {
    return 'Structure';
  }

  get icon(): string {
    // The one symbol-mark table: the pane's switcher glyph is the 'type' class mark — the same
    // mark a class carries inside the outline — so no second icon vocabulary appears.
    return ThemeIcons.Class.symbolMarkFor(
      this.application.theme.glyphLevel.value,
      'type',
    );
  }

  get activityAction(): string {
    return 'view.showStructure';
  }

  get activityBadge(): number {
    return 0;
  }

  get keybindingContext(): string {
    return 'structure';
  }

  get renderRevision() {
    return computed(() => this.readRenderVersion());
  }

  protected readRenderVersion(): string {
    void this.application.workspaceSet.activeWorkspaceIndex.value;
    const outline = this.activeWorkspace().outline;
    return [
      outline.version.value,
      outline.status.value,
      outline.selectedIndex.value,
      outline.hoveredIndex.value,
      outline.scrollTop.value,
      outline.viewportHeight.value,
      outline.viewportWidth.value,
      outline.filterInput.text.value,
      outline.filterInput.caret.value,
      outline.depth,
      outline.depthIsOverridden,
    ].join(':');
  }

  render(context: PaneRenderContext): StyledText {
    const outline = this.activeWorkspace().outline;
    const innerWidth = Math.max(1, context.width);
    return StructurePaneRenderer.Class.render({
      outline,
      structureFocused: context.focused,
      palette: context.palette,
      symbolMarks: ThemeIcons.Class.symbolMarksFor(context.glyphLevel),
      filterInput: outline.filterInput,
      searchGlyph: ThemeIcons.Class.findIconsFor(context.glyphLevel).search,
      foldOpenGlyph: ThemeIcons.Class.glyphFor(context.glyphLevel, 'foldOpen'),
      foldClosedGlyph: ThemeIcons.Class.glyphFor(
        context.glyphLevel,
        'foldClosed',
      ),
      setFilterCaretColumn: (column) => {
        this.filterCaretColumn = column;
      },
      height: Math.max(1, context.height - 1),
      innerWidth,
      viewportWidth: Math.max(1, innerWidth - this.scrollbarThicknessCells),
    });
  }

  caret(): { column: number; row: number } {
    return { column: this.filterCaretColumn, row: 0 };
  }

  capability<Port>(identifier: string): Port | null {
    return identifier === 'text-input'
      ? (this as unknown as PaneTextInputPort as Port)
      : null;
  }

  applyInputAction(action: TextInputAction): void {
    this.activeWorkspace().outline.applyFilterInputAction(action);
  }

  handleKey(key: KeyEvent): boolean {
    if (!TextInputKey.Class.isTypedCharacter(key)) return false;
    this.activeWorkspace().outline.insertFilterText(key.sequence);
    return true;
  }

  handlePaste(text: string): boolean {
    this.activeWorkspace().outline.insertFilterText(text);
    return true;
  }

  onWheel(rowDelta: number): boolean {
    this.activeWorkspace().impulseVerticalScroll(rowDelta);
    this.application.requestRender();
    return true;
  }

  protected foldControlColumn(rowIndex: number): number {
    const row = this.activeWorkspace().outline.rows.value[rowIndex];
    return row ? 1 + row.depth * 2 : -1;
  }

  onPointerMove(_column: number, row: number): boolean {
    const outline = this.activeWorkspace().outline;
    const rowIndex = outline.windowTop() + row - 1;
    outline.hoveredIndex.value =
      row > 0 && rowIndex >= 0 && rowIndex < outline.rows.value.length
        ? rowIndex
        : -1;
    return true;
  }

  onPointerOut(): void {
    this.activeWorkspace().outline.hoveredIndex.value = -1;
  }

  onPointerDown(column: number, row: number): boolean {
    const workspace = this.activeWorkspace();
    workspace.haltVerticalScroll();
    if (row === 0) {
      this.application.requestRender();
      return true;
    }
    const outline = workspace.outline;
    const rowIndex = outline.windowTop() + row - 1;
    if (rowIndex < 0 || rowIndex >= outline.rows.value.length) return false;
    outline.setSelection(rowIndex);
    if (
      column === this.foldControlColumn(rowIndex) &&
      outline.rows.value[rowIndex]?.hasChildren
    ) {
      outline.toggleSelectedFold();
    } else if (workspace.activateSelected()) {
      this.application.rightDockHost.blur();
    }
    this.application.requestRender();
    return true;
  }

  onResize(columns: number, rows: number): void {
    const outline = this.activeWorkspace().outline;
    const viewportHeight = Math.max(1, rows - 1);
    const viewportWidth = Math.max(1, columns - this.scrollbarThicknessCells);
    if (outline.viewportHeight.value !== viewportHeight) {
      outline.viewportHeight.value = viewportHeight;
    }
    if (outline.viewportWidth.value !== viewportWidth) {
      outline.viewportWidth.value = viewportWidth;
    }
  }

  onFocus(): void {}

  onBlur(): void {}

  dispose(): void {}

  get scrollTop(): number {
    return this.activeWorkspace().outline.scrollTop.value;
  }

  get scrollContentRows(): number {
    return this.activeWorkspace().outline.rows.value.length;
  }

  get scrollViewportRows(): number {
    return this.activeWorkspace().outline.viewportHeight.value;
  }

  get scrollbarRowOffset(): number {
    return 1;
  }

  haltScrollMomentum(): void {
    this.activeWorkspace().haltVerticalScroll();
  }

  scrollToLine(line: number): void {
    const outline = this.activeWorkspace().outline;
    outline.scrollBy(line - outline.scrollTop.value);
  }

  protected get scrollbarThicknessCells(): number {
    return Math.max(
      1,
      Math.round(this.application.settings.scrollbarThickness.value),
    );
  }
}

export namespace StructurePaneContent {
  export const $Class = $StructurePaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
