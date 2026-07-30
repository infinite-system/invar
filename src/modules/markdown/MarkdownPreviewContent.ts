import { Files } from '../system/Files';
import {
  MarkdownSplitView,
  type MarkdownPreviewSide,
} from './MarkdownSplitView';
import type { FindBarTarget } from '../search/FindBar';
import type {
  EditorSurfaceContent,
  EditorSurfaceContentContext,
  EditorSurfaceKeyEvent,
} from '../ui/EditorSurfaceContents';
import type { Workspace } from '../workspace/Workspace';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';

// One mounted source | preview split. Constructed only by `MarkdownPreviewSurface`.
//
// Unlike a comparison, this surface EMBEDS the host's real editor renderable in its left pane, so
// the active document stays the presented one and every language capability keeps working. Only the
// KEYBOARD moves, and only while the rendered pane holds focus.
//
// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
// invariant: Markdown view mode persists across Markdown documents (src/modules/markdown/markdown.invariants.md)
// invariant: A file reference opens from rendered Markdown (src/modules/markdown/markdown.invariants.md)
// invariant: Markdown preview selection reuses shared drag behavior (src/modules/markdown/markdown.invariants.md)
class $MarkdownPreviewContent implements EditorSurfaceContent {
  constructor(
    protected readonly workspace: Workspace.Model,
    protected readonly context: EditorSurfaceContentContext,
    protected readonly splitRatioSetting: RegisteredSetting<number>,
    protected readonly previewSide: MarkdownPreviewSide = 'left',
    protected readonly scrollSyncSetting?: RegisteredSetting<boolean>,
    protected readonly viewOnly = false,
  ) {
    this.view = this.createSplitView();
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createSplitView(): MarkdownSplitView.Instance {
    const context = this.context;
    const workspace = this.workspace;
    return new MarkdownSplitView.Class(context.renderer, context.theme, {
      source: workspace.editor.document,
      sourcePath: workspace.editor.document.path,
      sourceRenderable: context.sourceRenderable,
      parentRenderable: context.container,
      settings: context.settings,
      splitRatioSetting: this.splitRatioSetting,
      scrollSyncSetting: this.scrollSyncSetting,
      previewSide: this.previewSide,
      findBar: context.findBar,
      sourceScrollTop: () => workspace.editor.viewport.scrollTop.value,
      sourceLineAtViewportTop: () => workspace.editor.lineAtViewportTop(),
      scrollSourceLineToViewportTop: (lineIndex) =>
        workspace.editor.scrollLineToViewportTop(lineIndex),
      resolveReference: (reference) =>
        workspace.resolveFileReference(reference),
      referenceIsExternal: (reference) =>
        workspace.referenceIsExternal(reference),
      // Open + focus, the #235 open-seam pattern: the user asked for the file, so the keyboard
      // follows it — without the focus move, editor-context chords (Back/Forward) stay dead
      // after a click-open.
      openReference: (path) => {
        workspace.openFileInTab(path);
        workspace.focus.value = 'editor';
      },
      showReferenceTooltip: (path, screenColumn, screenRow) => {
        const label = Files.Class.relative(workspace.root, path);
        const bindingHint = context.keybindings.bindingHint(
          'markdown.openHoveredReference',
          'editor',
        );
        context.tooltip.point(
          `Open ${label} (Ctrl/Cmd+click${bindingHint ? ` · ${bindingHint}` : ''})`,
          screenColumn,
          screenRow,
        );
      },
      clearReferenceTooltip: () => context.tooltip.clear(),
      // invariant: An unresolvable Markdown link states why (src/modules/markdown/markdown.invariants.md)
      notifyUnresolvedReference: (target, screenColumn, screenRow, gesture) => {
        const message = workspace.referenceIsExternal(target)
          ? `External link — not opened here: ${target}`
          : `Link target not found: ${target}`;
        context.tooltip.point(message, screenColumn, screenRow);
        if (gesture === 'activate') this.view.linkNotice.value = message;
      },
      viewOnly: this.viewOnly,
    });
  }

  protected readonly view: MarkdownSplitView.Instance;

  /** The mounted split, for the plugin's own status projection and hovered-reference command. */
  get splitView(): MarkdownSplitView.Instance {
    return this.view;
  }

  get previewFocused(): boolean {
    return this.view.previewFocused;
  }

  /** The preview pane's own retained find query — the observable proof that the two panes keep
   *  separate engines.
   *  invariant: Markdown panes keep independent find state (src/modules/markdown/markdown.invariants.md) */
  previewFindQuery(): string {
    return (
      this.context.findBar.engineFor(this.view.previewFindTargetIdentifier())
        ?.query.value ?? ''
    );
  }

  update(): void {
    this.view.update();
  }

  tick(deltaTimeSeconds: number): boolean {
    return this.view.tick(deltaTimeSeconds);
  }

  /** No keys are taken outright: every movement below arrives through a REBINDABLE host command, so
   *  a remapped chord still drives the preview. */
  handleKey(_key: EditorSurfaceKeyEvent): boolean {
    return false;
  }

  scrollFocusedPaneByRows(rowDelta: number): void {
    this.view.moveByKeyboardRows(rowDelta);
  }

  pageFocusedPane(direction: -1 | 1): void {
    this.view.pageByKeyboard(direction);
  }

  selectAllInFocusedPane(): void {
    this.view.selectAll();
  }

  /** Escape hands the keyboard back to the embedded source editor. It does NOT close the split —
   *  the preview mode is per tab and only its own toggle changes it. */
  yieldKeyboardToSourceEditor(): void {
    if (this.viewOnly) return;
    this.view.focusSource();
  }

  get focusedPaneTitle(): string | null {
    return this.view.previewFocused ? 'Markdown Preview' : null;
  }

  findTarget(): FindBarTarget | null {
    // invariant: Markdown panes keep independent find state (src/modules/markdown/markdown.invariants.md)
    return this.view.previewFocused ? this.view.findTarget() : null;
  }

  copySelection(): Promise<number> | null {
    return this.view.previewFocused ? this.view.copySelection() : null;
  }

  dispose(): void {
    this.view.dispose();
  }
}

export namespace MarkdownPreviewContent {
  export const $Class = $MarkdownPreviewContent;
  export let Class = $MarkdownPreviewContent;
  export type Model = InstanceType<typeof Class>;
}
