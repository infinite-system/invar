import { Files } from '../system/Files';
import { DiffView } from '../diff/DiffView';
import type { Ref } from 'vue';
import type { FindBarTarget } from '../search/FindBar';
import type {
  EditorSurfaceContent,
  EditorSurfaceContentContext,
  EditorSurfaceKeyEvent,
} from '../ui/EditorSurfaceContents';
import type { GitComparisonRequest, GitWorkspace } from './GitWorkspace';

// One mounted comparison of two revisions. Constructed only by `GitComparisonSurface`.
//
// invariant: Base and current stay unambiguous (src/modules/diff/diff.invariants.md)
// invariant: Diff selection reuses shared drag behavior (src/modules/diff/diff.invariants.md)

class $GitComparisonContent implements EditorSurfaceContent {
  constructor(
    protected readonly gitWorkspace: GitWorkspace.Model,
    request: GitComparisonRequest,
    protected readonly context: EditorSurfaceContentContext,
    protected readonly layoutRevision?: Ref<number>,
  ) {
    const workspace = this.gitWorkspace.workspace;
    this.displayedPath =
      Files.Class.confineToRoot(workspace.root, request.currentVersionPath) ??
      request.currentVersionPath;
    this.view = this.createComparisonView(request);
  }

  readonly displayedPath: string;

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createComparisonView(
    request: GitComparisonRequest,
  ): DiffView.Instance {
    const context = this.context;
    const hostWorkspace = this.gitWorkspace.workspace;
    const view = new DiffView.Class(context.renderer, context.theme, {
      previousVersionText: request.previousVersionText,
      currentVersionText: request.currentVersionText,
      previousVersionPath: request.previousVersionPath,
      currentVersionPath: request.currentVersionPath,
      documentSyntax: hostWorkspace.documentSyntax,
      parentRenderable: context.container,
      onOpenFull: () => {
        // Comparison requests carry workspace-relative paths. Resolve through the host's existing
        // confinement seam before promoting the working side to a real editable tab.
        const currentWorkingPath = Files.Class.confineToRoot(
          hostWorkspace.root,
          request.currentVersionPath,
        );
        if (currentWorkingPath) hostWorkspace.openFileInTab(currentWorkingPath);
      },
      onNextChange: () => context.requestRender(),
      onPrevChange: () => context.requestRender(),
      onPointTooltip: (text, column, row) =>
        context.tooltip.point(text, column, row),
      onClearTooltip: () => context.tooltip.clear(),
    });
    view.attachSettings(
      context.settings,
      this.gitWorkspace.diffSplitRatioSetting,
    );
    view.attachFindBar(context.findBar, context.mountIdentity);
    return view;
  }

  protected readonly view: DiffView.Instance;
  // The first paint at the REAL laid-out height cannot happen at construction: the reactive paint
  // runs before OpenTUI lays out the freshly swapped container, so root height is still 0. The frame
  // loop repaints until the height stops changing.
  protected lastLaidOutHeight = -1;

  get comparisonView(): DiffView.Instance {
    return this.view;
  }

  update(): void {
    this.view.update();
  }

  tick(deltaTimeSeconds: number): boolean {
    let live = this.view.tickScrollMomentum(deltaTimeSeconds);
    const laidOutHeight = Number(this.view.rootRenderable.height) || 0;
    if (laidOutHeight !== this.lastLaidOutHeight) {
      this.lastLaidOutHeight = laidOutHeight;
      this.view.update(); // now at the real height -> renders the full window
      if (this.layoutRevision) this.layoutRevision.value += 1;
      live = true; // keep frames coming until the height stabilizes
    }
    return live;
  }

  // Editor-context keys drive the comparison's synced aligned-row panes, not the hidden buffer:
  // n/p jump changes, Enter promotes the working side to a real editable tab, Esc closes.
  handleKey(key: EditorSurfaceKeyEvent): boolean {
    // Ctrl+Shift+Up/Down jump CHANGES (what F7 / Shift+F7 used to do). The chord belongs to this
    // SURFACE, not to the host's binding floor: the surface holds the editor column, so it owns the
    // key, and outside a comparison the very same chord stays the editor's jump-with-extend. Arrows
    // carry the direction and the ESC [ 1;6A form decodes on legacy terminals as well as under kitty.
    // invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
    if (key.ctrl && key.shift && (key.name === 'up' || key.name === 'down')) {
      if (key.name === 'up') this.view.jumpToPreviousChange();
      else this.view.jumpToNextChange();
      return true;
    }
    switch (key.name) {
      case 'up':
        this.view.moveByKeyboardAlignedRows(-1);
        return true;
      case 'down':
        this.view.moveByKeyboardAlignedRows(1);
        return true;
      case 'pageup':
        this.view.pageByKeyboard(-1);
        return true;
      case 'pagedown':
        this.view.pageByKeyboard(1);
        return true;
      case 'left':
        this.view.moveByKeyboardColumns(-1);
        return true;
      case 'right':
        this.view.moveByKeyboardColumns(1);
        return true;
      case 'n':
        this.view.jumpToNextChange();
        return true;
      case 'p':
        this.view.jumpToPreviousChange();
        return true;
      case 'return':
        if (key.ctrl) return false;
        this.view.openFull();
        return true;
      case 'escape':
        this.yieldKeyboardToSourceEditor();
        return true;
      default:
        return false;
    }
  }

  // The comparison has no embedded source editor: its two panes are read-only revisions, so the
  // shared movement verbs drive the aligned-row window and Escape dismisses the comparison entirely.
  scrollFocusedPaneByRows(rowDelta: number): void {
    this.view.moveByKeyboardAlignedRows(rowDelta);
  }

  pageFocusedPane(direction: -1 | 1): void {
    this.view.pageByKeyboard(direction);
  }

  selectAllInFocusedPane(): void {
    this.view.selectAllInActivePane();
  }

  yieldKeyboardToSourceEditor(): void {
    this.gitWorkspace.release();
  }

  /** Null: the comparison labels its own panes `Base (HEAD)` / `Current (working)` in its header.
   *  invariant: Base and current stay unambiguous (src/modules/diff/diff.invariants.md) */
  readonly focusedPaneTitle = null;

  findTarget(): FindBarTarget | null {
    return this.view.findTarget();
  }

  copySelection(): Promise<number> | null {
    return this.view.copySelection();
  }

  dispose(): void {
    this.view.dispose();
  }
}

export namespace GitComparisonContent {
  export const $Class = $GitComparisonContent;
  export let Class = $GitComparisonContent;
  export type Model = InstanceType<typeof Class>;
}
