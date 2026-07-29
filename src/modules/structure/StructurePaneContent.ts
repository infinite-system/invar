// The structure navigator as a primary-dock pane content citizen: a cells citizen — the host
// paints the StyledText this returns — switchable beside Files, Git, and Extensions with zero
// host wiring. It projects the ACTIVE workspace's outline, resolved late through the injected
// accessor, exactly like the file-tree pane.
//
// invariant: The structure navigator is a pane content citizen (src/modules/structure/structure.invariants.md)
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';
import { ThemeIcons } from '../theme/ThemeIcons';
import type { StructureWorkspace } from './StructureWorkspace';
import { StructurePaneRenderer } from './StructurePaneRenderer';

class $StructurePaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly activeWorkspace: () => StructureWorkspace.Model,
  ) {}

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
    ].join(':');
  }

  render(context: PaneRenderContext): StyledText {
    const outline = this.activeWorkspace().outline;
    const innerWidth = Math.max(1, context.width);
    return StructurePaneRenderer.Class.render({
      outline,
      structureFocused:
        this.application.workspaceSet.active.focus.value === 'primaryPane' &&
        this.application.primaryDockHost.focused.value,
      palette: context.palette,
      symbolMarks: ThemeIcons.Class.symbolMarksFor(context.glyphLevel),
      height: Math.max(1, context.height),
      innerWidth,
      viewportWidth: Math.max(1, innerWidth - this.scrollbarThicknessCells),
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

  onPointerMove(_column: number, row: number): boolean {
    const outline = this.activeWorkspace().outline;
    const rowIndex = outline.windowTop() + row;
    outline.hoveredIndex.value =
      rowIndex >= 0 && rowIndex < outline.rows.value.length ? rowIndex : -1;
    return true;
  }

  onPointerOut(): void {
    this.activeWorkspace().outline.hoveredIndex.value = -1;
  }

  onPointerDown(_column: number, row: number): boolean {
    const workspace = this.activeWorkspace();
    this.onFocus();
    workspace.haltVerticalScroll();
    const outline = workspace.outline;
    const rowIndex = outline.windowTop() + row;
    if (rowIndex < 0 || rowIndex >= outline.rows.value.length) return false;
    outline.setSelection(rowIndex);
    workspace.activateSelected();
    this.application.requestRender();
    return true;
  }

  onResize(columns: number, rows: number): void {
    const outline = this.activeWorkspace().outline;
    const viewportHeight = Math.max(1, rows);
    const viewportWidth = Math.max(1, columns - this.scrollbarThicknessCells);
    if (outline.viewportHeight.value !== viewportHeight) {
      outline.viewportHeight.value = viewportHeight;
    }
    if (outline.viewportWidth.value !== viewportWidth) {
      outline.viewportWidth.value = viewportWidth;
    }
  }

  onFocus(): void {
    this.application.workspaceSet.active.focusPrimaryPane('structure');
  }

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
