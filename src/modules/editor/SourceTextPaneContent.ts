// The source-text editor as a PaneContent citizen — the same seam a terminal, an agent, and the
// file tree occupy. It is the first NATIVE-SURFACE citizen: it owns OpenTUI renderables (a gutter
// and a SelectableText code body) and paints them itself, because native selection and the
// layout-anchored terminal caret are the whole point of the product's hottest surface. Rewriting
// that into a host-painted StyledText would cost both and buy uniformity of appearance only.
//
// The host owns the SLOT (the bordered editor area, its background, its border colour) and mounts
// nothing of this content's own. This content builds the gutter and code renderables, mounts them
// into the slot, drives the `EditorPane` controller (wrap window, coordinate mapping, native
// selection, drag, go-to-definition, wheel), and reports back the region it painted so host-owned
// overlays — the editor scrollbars, an out-of-band image placement — anchor to what was drawn.
//
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
// invariant: The source text editor is a pane content citizen (src/modules/ui/ui.invariants.md)
import {
  TextRenderable,
  type BoxRenderable,
  type CliRenderer,
  type KeyEvent,
  type StyledText,
} from '@opentui/core';
import { computed, type Ref } from 'vue';
import { SelectableText } from '../ui/SelectableText';
import { EditorPane } from './EditorPane';
import type { EditorFrameAttribution } from './EditorFrameAttribution';
import type {
  PaneContent,
  PaneNativeSurfacePort,
  PaneRenderContext,
  PaneSurfaceRegion,
  PaneTextSelectionPort,
} from '../ui/PaneContent.interface';
import type { Palette } from '../theme/ThemePalettes';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { FindBar } from '../search/FindBar';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';

class $SourceTextPaneContent
  implements PaneContent, PaneNativeSurfacePort, PaneTextSelectionPort
{
  // Gutter (line numbers + fold controls) and code are SEPARATE renderables so the code buffer
  // holds only code — OpenTUI's native selection then never shades the gutter on a multi-line
  // span, and code-local selection coords are pure display columns.
  protected readonly gutterBody: TextRenderable;
  protected readonly codeBody: SelectableText.Model;
  protected readonly controller: EditorPane.Instance;
  protected readonly paintRevision: Ref<string>;
  /** What the pane shows with no document open — the first thing a new user reads. */
  protected static get emptyState(): string {
    return [
      '',
      '   Invar — a terminal code workspace',
      '',
      '   ↑/↓  navigate files      Enter  open / expand',
      '   Tab  switch pane         Ctrl+P command palette',
      '   Ctrl+Q or F10  quit   (VS Code: Ctrl+X then Ctrl+C)',
      '',
    ].join('\n');
  }

  constructor(protected readonly deps: SourceTextPaneContentDeps) {
    this.gutterBody = new TextRenderable(deps.renderer, {
      id: 'editor-gutter',
      content: '',
    });
    this.codeBody = new SelectableText.Class(deps.renderer, {
      id: 'editor-code',
      content: '',
      // selectable:false — OpenTUI's OWN mouse-drag selection is a second writer of selection state
      // that the model never sees: its highlight appeared on drag, then the next paint's
      // applySelection() (reading the EMPTY model selection) wiped it — the human-QA
      // "selection appears then disappears" bug. The model is the one writer; the controller's
      // mouse handlers drive cursor+anchor, and the native selection is only ever set from them.
      selectable: false,
      flexGrow: 1,
      // The RENDERABLE never soft-wraps — the renderable wrapping text itself would desync the
      // gutter and every row-based mapping (caret Y, selection rows, click hit-testing). Word wrap
      // is a MODE handled ABOVE this layer: wrap-OFF renders one file line per visual row (long
      // lines clip; horizontal scroll covers the rest); wrap-ON feeds pre-wrapped SEGMENT rows from
      // the pure mapping layer (EditorWrap.ts), so this stays 'none' in both modes.
      // invariant: One visible file line is one visual row when word wrap is off (src/modules/ui/ui.invariants.md)
      wrapMode: 'none',
    });
    deps.slot.add(this.gutterBody);
    deps.slot.add(this.codeBody);
    this.controller = this.createController();
    this.paintRevision = computed(() => this.readPaintRevision());
  }

  protected createController(): EditorPane.Instance {
    return new EditorPane.Class({
      renderer: this.deps.renderer,
      editorArea: this.deps.slot,
      gutterBody: this.gutterBody,
      codeBody: this.codeBody,
      workspaceSet: this.deps.workspaceSet,
      findBar: this.deps.findBar,
      settings: this.deps.settings,
      theme: this.deps.theme,
      frameAttribution: this.deps.frameAttribution,
      tooltip: this.deps.tooltip,
      readPalette: this.deps.readPalette,
      editorViewportHeight: this.deps.viewportRows,
      editorViewportWidth: this.deps.viewportColumns,
      focusSourceEditor: this.deps.focusSourceEditor,
      hover: this.deps.hover,
    });
  }

  // --- identity -----------------------------------------------------------

  get id(): string {
    return 'source-text';
  }

  get kind(): string {
    return 'source-text';
  }

  /** A contributed title (a dirty marker, a source-control label) or none — the host paints its
   *  own focused/idle legend when a content names nothing. */
  get title(): string {
    return this.contributedTitle?.text ?? '';
  }

  get titleColor(): string | undefined {
    return this.contributedTitle?.color;
  }

  protected get contributedTitle(): { text: string; color: string } | null {
    const workspace = this.deps.workspaceSet.active;
    return workspace.editorContributions.title(workspace.editor);
  }

  get renderRevision(): Readonly<Ref<string>> {
    return this.paintRevision;
  }

  /** Everything a paint reads that can change without one. Nothing observes it today — the frame
   *  effect tracks these same signals directly through the paint — but the seam promises an async
   *  producer can repaint through it, and this is that signal for source text. */
  protected readPaintRevision(): string {
    const editor = this.deps.workspaceSet.active.editor;
    return [
      editor.document.revision.value,
      editor.cursor.line.value,
      editor.cursor.col.value,
      editor.viewport.scrollTop.value,
      editor.viewport.scrollLeft.value,
      editor.foldRevision.value,
    ].join(':');
  }

  // --- the native surface --------------------------------------------------

  /** The named ports this pane publishes. `native-surface` says it paints its own renderables;
   *  `text-selection` is the shared copy surface a terminal publishes too, so the clipboard path
   *  resolves an identifier instead of importing the editor. */
  capability<Port>(identifier: string): Port | null {
    switch (identifier) {
      case 'native-surface':
      case 'text-selection':
        return this as unknown as Port;
      default:
        return null;
    }
  }

  /** Paint the gutter and code renderables for this region, then apply the native selection — in
   *  that order, inside one call, so the selection can never map onto the previous frame's buffer. */
  paint(context: PaneRenderContext): void {
    const palette = context.palette;
    // A raster document (an image file) shows through the same code surface: no gutter, no syntax
    // text. The raster projection answers what the cells must show and places any out-of-band
    // graphics itself; it returns null for ordinary source text and clears a stale placement then.
    // invariant: An image buffer replaces the code text and leaves other files untouched (src/modules/image/image.invariants.md)
    const rasterCells = this.deps.rasterProjection({
      column: this.codeBody.x,
      row: this.codeBody.y,
      columns: Math.max(1, context.width),
      rows: Math.max(1, context.height),
    });
    if (rasterCells !== null) {
      this.gutterBody.width = 0;
      this.gutterBody.content = '';
      this.codeBody.content = rasterCells;
    } else {
      const rendered = this.controller.renderEditor();
      if (rendered) {
        this.gutterBody.width = this.gutterWidth();
        this.gutterBody.content = rendered.gutter;
        this.codeBody.content = rendered.code;
      } else {
        this.gutterBody.width = 0;
        this.gutterBody.content = '';
        this.codeBody.content = $SourceTextPaneContent.emptyState;
      }
    }
    this.codeBody.fg = palette.fg;
    this.codeBody.selectionBg = palette.selection;
    this.controller.applySelection();
  }

  /** Gutter width in cells for the current document: "NN " (line number + space) + 1 marker cell. */
  protected gutterWidth(): number {
    return (
      String(this.deps.workspaceSet.active.editor.document.lineCount).length +
      1 +
      2
    );
  }

  /** WHERE the caret sits, in screen cells. WHETHER this pane owns the keyboard is the host's
   *  ladder — the same one that ranks a modal overlay over the right dock over the bottom panel.
   *  invariant: The caret renders at the cursor display column (src/modules/ui/ui.invariants.md) */
  caretAnchor(): { column: number; row: number } | null {
    const editor = this.deps.workspaceSet.active.editor;
    if (!editor.hasDocument.value) return null;
    if (this.deps.workspaceSet.active.activeFileIsImage) return null;
    const position = this.controller.visualPosition(
      editor.cursor.line.value,
      editor.cursor.col.value,
    );
    if (typeof position !== 'object') return null;
    return {
      column: this.codeBody.x + position.column,
      row: this.codeBody.y + position.rowIndex,
    };
  }

  /** The code surface's laid-out screen rectangle. Null before the first layout, when every
   *  extent still reads zero and no overlay may anchor to it. */
  surfaceRegion(): PaneSurfaceRegion | null {
    const columns = Number(this.codeBody.width);
    const rows = Number(this.codeBody.height);
    if (!columns || !rows) return null;
    return {
      column: Number(this.codeBody.x),
      row: Number(this.codeBody.y),
      columns,
      rows,
    };
  }

  // --- the shared copy surface --------------------------------------------

  hasSelection(): boolean {
    return this.deps.workspaceSet.active.editor.hasSelection;
  }

  copySelection(): Promise<number> {
    return this.deps.workspaceSet.active.editor.copySelection();
  }

  // --- host callbacks ------------------------------------------------------

  /** Source-text keystrokes are owned by the command layer (bindings resolved in the `editor`
   *  context, then the workspace's edit commands), not by this seam. The pane declares no
   *  keybinding context and claims no key, so nothing routes twice while that is true. */
  handleKey(_key: KeyEvent): boolean {
    return false;
  }

  /** The slot is laid out by Yoga and this content reads its own extent from the layout, so a host
   *  telling it a size would be a second, staler source of the same number. */
  onResize(_columns: number, _rows: number): void {}

  onFocus(): void {
    this.deps.workspaceSet.active.focusEditor();
  }

  onBlur(): void {}

  /** Advance the selection-drag edge auto-scroll; true while it still needs frames. */
  tickScroll(deltaSeconds: number): boolean {
    return this.controller.tickDrag(deltaSeconds);
  }

  /** Release what this pane brought into the host: the views its workspace's provider created, and
   *  the renderables it mounted into the slot. This is what `releasePane` is for a pane runtime —
   *  a withdrawn source-text pane must leave no live view and no renderable still painting. */
  dispose(): void {
    this.deps.releaseSourceTextViews();
    this.deps.slot.remove(this.gutterBody);
    this.deps.slot.remove(this.codeBody);
    this.gutterBody.destroyRecursively();
    this.codeBody.destroyRecursively();
  }
}

export namespace SourceTextPaneContent {
  export const $Class = $SourceTextPaneContent;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface SourceTextPaneContentDeps {
  renderer: CliRenderer;
  /** The bordered editor area the host owns and this content mounts its renderables into. */
  slot: BoxRenderable;
  workspaceSet: WorkspaceSet.Instance;
  findBar: FindBar.Instance;
  settings: Settings.Instance;
  theme: Theme.Instance;
  frameAttribution: EditorFrameAttribution.Model;
  tooltip: import('../ui/Tooltip').Tooltip.Instance;
  readPalette: () => Palette;
  /** The slot's interior rows and the code surface's usable columns, both host-derived from the
   *  laid-out slot (the host owns the slot, so it owns its extent). */
  viewportRows: () => number;
  viewportColumns: () => number;
  /** Hand the keyboard back to the source editor — a click in the source pane while a contributed
   *  surface's own pane holds it (no-op when no surface is mounted). */
  focusSourceEditor: () => void;
  /** The LSP hover-card handle: a mouse-move over a symbol points it; leaving the code clears it. */
  hover: EditorPaneHoverPort;
  /** What the code cells must show when the active document is a raster (an image file), or null
   *  when it is ordinary source text. An out-of-band graphics tier places its own payload for the
   *  given region and returns an empty string, so the cells under it stay blank. */
  rasterProjection: (region: PaneSurfaceRegion) => StyledText | string | null;
  /** Release every source-text view this workspace's provider created. */
  releaseSourceTextViews: () => void;
}

export interface EditorPaneHoverPort {
  pointAt(
    position: { line: number; column: number },
    screenX: number,
    screenY: number,
  ): void;
  clear(): void;
  pointerOffSymbol(): void;
}
