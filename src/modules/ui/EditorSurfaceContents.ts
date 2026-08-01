import type { BoxRenderable, CliRenderer } from '@opentui/core';
import type { FindBar, FindBarTarget } from '../search/FindBar';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import type { Tooltip } from './Tooltip';

// The host side of the editor-surface slot: a registry of CONTRIBUTED occupants for the editor
// column. `EditorSurfaceClaims` (workspace) answers what the host's own behaviour depends on; this
// registry answers who paints, who is ticked, who consumes a key, who owns a find target, and who
// can yield a selection to the clipboard — without the host importing, constructing, or naming any
// of them.
//
// The member set is derived from the sites that previously reached a concrete view BY NAME
// (`activeDiffView()`, `activeMarkdownSplitView()`), not invented: the frame loop's two named ticks,
// the 45-line inline key switch in Bootstrap, the find-target chain in RootView, and the copy chain.
// It is deliberately a SUBSET of the established `PaneContent` vocabulary — same words, same
// meanings — because the editor column is the same shape of slot as a dock, not a new one.
//
// Providers activate BEFORE the view exists (plugins are activated before buildRootView), so a
// provider is registered early and its content is CREATED LAZILY at mount time with a
// view-supplied context.
//
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
class $EditorSurfaceContents {
  protected readonly providers = new Set<EditorSurfaceContentProvider>();

  register(provider: EditorSurfaceContentProvider): () => void {
    this.providers.add(provider);
    return () => this.providers.delete(provider);
  }

  /** The provider claiming the surface, or null while nothing does. First registered wins, so
   *  registration order is precedence order. */
  get claimingProvider(): EditorSurfaceContentProvider | null {
    for (const provider of this.providers) {
      if (provider.mountIdentity() !== '') return provider;
    }
    return null;
  }

  /** Called from the host's paint effect so a provider can subscribe the signals its surface paints
   *  from (a persisted split ratio, say). Mirrors the `renderRevision` touch the dock hosts already
   *  do for their pane contents. Every registered provider is asked, claiming or not: the signal can
   *  change while the surface is unmounted and must still be observed when it next mounts. */
  observePaintSignals(): void {
    for (const provider of this.providers) provider.observePaintSignals?.();
  }
}

export namespace EditorSurfaceContents {
  export const $Class = $EditorSurfaceContents;
  export let Class = $EditorSurfaceContents;
  export type Model = InstanceType<typeof Class>;
}

/** A contribution that can occupy the editor column. */
export interface EditorSurfaceContentProvider {
  /** Stable identity, for probes and status projection. */
  readonly identifier: string;
  /** A non-empty string while this provider claims the surface. The VALUE keys the mounted
   *  instance: a different identity tears the old content down and builds a new one, which is how a
   *  fresh request replaces a stale view. Empty means "not claiming". */
  mountIdentity(): string;
  /** Build the content into the supplied container. Called once per distinct mount identity. */
  create(context: EditorSurfaceContentContext): EditorSurfaceContent;
  /** Optional: read the reactive signals this provider's surface paints from, so the host's paint
   *  effect re-runs when they change. Called inside that effect; read only, never mutate. */
  observePaintSignals?(): void;
}

/** A mounted occupant of the editor column. */
export interface EditorSurfaceContent {
  /** Repaint. Called after the container reaches its real laid-out height and on model changes. */
  update(): void;
  /** Advance owned animations and settle-repaints for one frame; true keeps the frame loop live. */
  tick(deltaSeconds: number): boolean;
  /** Consume an editor-context key before the keybinding registry sees it; true if handled. Use for
   *  keys the surface owns OUTRIGHT; movement that the user can rebind goes through the verbs below,
   *  so it stays reachable from a remapped chord. */
  handleKey(key: EditorSurfaceKeyEvent): boolean;
  /** Scroll the surface's focused pane by signed rows, driven by the host's movement commands so the
   *  bindings remain rebindable and the acceleration curve stays shared. */
  scrollFocusedPaneByRows(rowDelta: number): void;
  /** Page the focused pane one viewport in `direction`. */
  pageFocusedPane(direction: -1 | 1): void;
  /** Select everything in the focused pane. */
  selectAllInFocusedPane(): void;
  toggleWordWrap?(): void;
  readonly wordWrapEnabled?: boolean;
  goToSourceLine?(oneBasedLine: number): void;
  goToBottom?(): void;
  /** Clear transient pointer state when host chrome covers the surface at the pointer cell. */
  clearPointerHover?(): void;
  /** Give the keyboard back to the source editor — Escape's meaning for a surface that embeds it,
   *  and for one that replaces it, dismissal. */
  yieldKeyboardToSourceEditor(): void;
  /** Name of the focused pane for the status bar, or null when the surface labels its panes itself
   *  and the host should say nothing. */
  readonly focusedPaneTitle: string | null;
  /** The find/replace target this content owns, or null to fall through to the source editor. */
  findTarget(): FindBarTarget | null;
  /** Copy this content's own selection to the clipboard, resolving the number of characters that
   *  landed there — the host publishes that count as the observable proof that copy copied. Null
   *  when this content owns no selection and the source editor should be copied instead. */
  copySelection(): Promise<number> | null;
  /** Release renderables, effects, and find engines. */
  dispose(): void;
}

/** What a content is handed to build itself into the editor column. */
export interface EditorSurfaceContentContext {
  readonly renderer: CliRenderer;
  readonly theme: Theme.Instance;
  readonly settings: Settings.Instance;
  readonly findBar: FindBar.Instance;
  readonly keybindings: KeybindingRegistry.Instance;
  readonly tooltip: Tooltip.Instance;
  /** Definite-size host box, already mounted in the editor column. */
  readonly container: BoxRenderable;
  /** The source editor's renderable. A surface that EMBEDS the editor (a source|preview split) moves
   *  it into one of its own panes; a surface that replaces the editor ignores it. */
  readonly sourceRenderable: BoxRenderable;
  /** The provider's own mount identity for this instance — a stable per-instance find-engine key. */
  readonly mountIdentity: string;
  readonly requestRender: () => void;
}

/** The subset of a terminal key event an editor-surface content reads. Structurally satisfied by
 *  OpenTUI's `KeyEvent`, so the host passes its event straight through. */
export interface EditorSurfaceKeyEvent {
  readonly name: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
}
