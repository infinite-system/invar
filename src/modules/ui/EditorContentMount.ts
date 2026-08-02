// The editor content-area mount controller: owns WHAT occupies the editor column — the plain editor,
// or a CONTRIBUTED surface — and the lifecycle of the mounted instance.
//
// It knows the surface only through `EditorSurfaceContents`: an identity string that keys the
// instance, a `create` that builds it into a definite-size container, and the generic content
// contract. It never imports, names, or types a plugin's view. Both of the surfaces that exist
// today (a source-control comparison, a Markdown source|preview split) arrive this way, including
// the split, which EMBEDS the source editor renderable handed to it in the mount context.
//
// RootView constructs the container renderables and calls sync() / tickContributedSurface().
import type { BoxRenderable, CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
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
  protected mounted: 'editor' | 'surface' | null = 'editor';
  constructor(protected readonly deps: EditorContentMountDeps) {}
  /** The mounted contributed surface (or null); read by the find target, the frame loop, the caret,
   *  the status bar, and the key/clipboard routing — all of which see only the generic contract. */
  get contributedSurface(): EditorSurfaceContent | null {
    return this.surface;
  }
  /** The path presented by the current editor-area occupant. The source editor is the default
   *  occupant; contributed occupants answer through the same content contract. */
  get displayedPath(): string | null {
    if (this.surface) return this.surface.displayedPath;
    const editor = this.deps.workspaceSet.active.editor;
    return editor.hasDocument.value && editor.document.path
      ? editor.document.path
      : null;
  }
  protected unmount(): void {
    const { editorColumn, editorArea, surfaceContainer } = this.deps;
    if (this.mounted === 'editor') editorColumn.remove(editorArea);
    else if (this.mounted === 'surface') editorColumn.remove(surfaceContainer);
    this.mounted = null;
  }
  protected mount(content: 'editor' | 'surface'): void {
    const { editorColumn, editorArea, surfaceContainer } = this.deps;
    if (this.mounted === content) return;
    this.unmount();
    if (content === 'editor') editorColumn.add(editorArea);
    else editorColumn.add(surfaceContainer);
    this.mounted = content;
  }
  sync(): void {
    const {
      renderer,
      theme,
      settings,
      findBar,
      keybindings,
      tooltip,
      editorSurfaceContents,
      editorArea,
      surfaceContainer,
    } = this.deps;
    const provider = editorSurfaceContents.claimingProvider;
    const surfaceIdentity = provider?.mountIdentity() ?? '';
    if (surfaceIdentity !== this.mountedSurfaceIdentity) {
      this.mountedSurfaceIdentity = surfaceIdentity;
      if (this.surface) {
        this.surface.dispose();
        this.surface = null;
      }
      // Detach the editor BEFORE building: a surface that embeds `editorArea` reparents it into one
      // of its own panes, and it must not still be a child of the column when it does.
      this.unmount();
      if (provider && surfaceIdentity) {
        this.surface = provider.create({
          renderer,
          theme,
          settings,
          findBar,
          keybindings,
          tooltip,
          container: surfaceContainer, // definite-size host, added below in place of editorArea
          sourceRenderable: editorArea,
          mountIdentity: surfaceIdentity,
          requestRender: () => renderer.requestRender(),
        });
      }
    }
    if (this.surface) {
      this.mount('surface');
      this.surface.update();
    } else {
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
  dispose(): void {
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
}
