// The editor content-area mount controller: owns WHAT occupies the editor column — the plain editor,
// a CONTRIBUTED surface (a source-control comparison today; any plugin's surface tomorrow), or the
// Markdown source+preview split — and the lifecycle of the mounted instance.
//
// It knows the contributed surface only through `EditorSurfaceContents`: an identity string that
// keys the instance, a `create` that builds it into a definite-size container, and the generic
// content contract. It never imports, names, or types a plugin's view. The Markdown split is still
// mounted by name here; that is extraction step 3 in project.canvas-census.md.
//
// RootView constructs the container renderables and calls sync() / tickContributedSurface() /
// tickMarkdown().
import type { BoxRenderable, CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import { MarkdownSplitView } from '../markdown/MarkdownSplitView';
import { Files } from '../system/Files';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { Theme } from '../theme/Theme';
import type { Settings } from '../settings/Settings';
import type { FindBar } from '../search/FindBar';
import type { Tooltip } from './Tooltip';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type {
  EditorSurfaceContent,
  EditorSurfaceContents,
} from './EditorSurfaceContents';
class $EditorContentMount {
  protected surface: EditorSurfaceContent | null = null;
  protected mountedSurfaceIdentity = '';
  protected markdown: MarkdownSplitView.Instance | null = null;
  protected shownMarkdownIdentifier = '';
  protected mounted: 'editor' | 'surface' | 'markdown' | null = 'editor';
  constructor(protected readonly deps: EditorContentMountDeps) {}
  /** The mounted contributed surface (or null); read by the find target, the frame loop, and the
   *  key/clipboard routing — all of which see only the generic contract. */
  get contributedSurface(): EditorSurfaceContent | null {
    return this.surface;
  }
  /** The active MarkdownSplitView (or null); read by the caret, status bar, find target, editor pane. */
  get markdownSplitView(): MarkdownSplitView.Instance | null {
    return this.markdown;
  }
  protected unmount(): void {
    const { editorColumn, editorArea, surfaceContainer, markdownContainer } =
      this.deps;
    if (this.mounted === 'editor') editorColumn.remove(editorArea);
    else if (this.mounted === 'surface') editorColumn.remove(surfaceContainer);
    else if (this.mounted === 'markdown')
      editorColumn.remove(markdownContainer);
    this.mounted = null;
  }
  protected mount(content: 'editor' | 'surface' | 'markdown'): void {
    const { editorColumn, editorArea, surfaceContainer, markdownContainer } =
      this.deps;
    if (this.mounted === content) return;
    this.unmount();
    if (content === 'editor') editorColumn.add(editorArea);
    else if (content === 'surface') editorColumn.add(surfaceContainer);
    else editorColumn.add(markdownContainer);
    this.mounted = content;
  }
  protected releaseMarkdown(): void {
    if (!this.markdown) return;
    if (this.mounted === 'markdown') this.unmount();
    this.markdown.dispose();
    this.markdown = null;
    this.shownMarkdownIdentifier = '';
  }
  /** Build or tear down the contributed surface so the mounted instance matches the claiming
   *  provider's identity. */
  protected syncContributedSurface(): void {
    const {
      renderer,
      theme,
      settings,
      findBar,
      keybindings,
      tooltip,
      editorSurfaceContents,
      surfaceContainer,
    } = this.deps;
    const provider = editorSurfaceContents.claimingProvider;
    const surfaceIdentity = provider?.mountIdentity() ?? '';
    if (surfaceIdentity === this.mountedSurfaceIdentity) return;
    this.mountedSurfaceIdentity = surfaceIdentity;
    if (this.surface) {
      if (this.mounted === 'surface') this.unmount();
      this.surface.dispose();
      this.surface = null;
    }
    if (!provider || !surfaceIdentity) return;
    this.surface = provider.create({
      renderer,
      theme,
      settings,
      findBar,
      keybindings,
      tooltip,
      container: surfaceContainer, // definite-size host (added below in place of editorArea)
      mountIdentity: surfaceIdentity,
      requestRender: () => renderer.requestRender(),
    });
  }
  sync(): void {
    // invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
    const {
      renderer,
      theme,
      settings,
      findBar,
      workspaceSet,
      keybindings,
      tooltip,
      editorArea,
      markdownContainer,
    } = this.deps;
    this.syncContributedSurface();
    const markdownIdentifier = workspaceSet.active.showingMarkdownPreview
      ? `${workspaceSet.active.root}:${workspaceSet.active.editor.document.path}`
      : '';
    // A contributed surface wins the column: it claimed it, and the host does not arbitrate between
    // a claim and a mode of the active buffer.
    if (this.surface) {
      this.releaseMarkdown();
      this.mount('surface');
    } else if (markdownIdentifier) {
      if (
        this.shownMarkdownIdentifier !== markdownIdentifier ||
        !this.markdown
      ) {
        this.releaseMarkdown();
        this.shownMarkdownIdentifier = markdownIdentifier;
        this.unmount();
        this.markdown = new MarkdownSplitView.Class(renderer, theme, {
          source: workspaceSet.active.editor.document,
          sourcePath: workspaceSet.active.editor.document.path,
          sourceRenderable: editorArea,
          parentRenderable: markdownContainer,
          settings,
          findBar,
          resolveReference: (reference) =>
            workspaceSet.active.resolveFileReference(reference),
          openReference: (path) => workspaceSet.active.openFileInTab(path),
          showReferenceTooltip: (path, screenColumn, screenRow) => {
            const label = Files.Class.relative(workspaceSet.active.root, path);
            const bindingHint = keybindings.bindingHint(
              'markdown.openHoveredReference',
              'editor',
            );
            tooltip.point(
              `Open ${label} (Ctrl/Cmd+click${bindingHint ? ` · ${bindingHint}` : ''})`,
              screenColumn,
              screenRow,
            );
          },
          clearReferenceTooltip: () => tooltip.clear(),
        });
      }
      this.mount('markdown');
      this.markdown.update();
    } else {
      this.releaseMarkdown();
      this.mount('editor');
    }
    // NOTE: a contributed surface's first paint at its real laid-out height is driven from the FRAME
    // LOOP (tickContributedSurface), NOT here — sync() runs in the reactive paint (fires only on
    // signal changes), which happens BEFORE OpenTUI lays out the freshly-swapped container, so root
    // height is still 0 here. The content owns that settle-repaint itself.
  }
  /** Frame-loop hook: advance the contributed surface's own animations and settle-repaints. */
  tickContributedSurface(deltaTimeSeconds: number): boolean {
    return this.surface?.tick(deltaTimeSeconds) ?? false;
  }
  tickMarkdown(deltaTimeSeconds: number): boolean {
    return this.markdown?.tick(deltaTimeSeconds) ?? false;
  }
  dispose(): void {
    this.markdown?.dispose();
    this.surface?.dispose();
  }
}
export namespace EditorContentMount {
  export const $Class = $EditorContentMount;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}
export interface EditorContentMountDeps {
  renderer: CliRenderer;
  theme: Theme.Instance;
  settings: Settings.Instance;
  findBar: FindBar.Instance;
  workspaceSet: WorkspaceSet.Instance;
  keybindings: KeybindingRegistry.Instance;
  tooltip: Tooltip.Instance;
  editorSurfaceContents: EditorSurfaceContents.Model;
  editorColumn: BoxRenderable;
  editorArea: BoxRenderable;
  /** Definite-size host for whichever contributed surface claims the column. */
  surfaceContainer: BoxRenderable;
  markdownContainer: BoxRenderable;
}
