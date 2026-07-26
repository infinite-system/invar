import { Files } from '../system/Files';
import { DiffView } from '../diff/DiffView';
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
  ) {
    this.view = this.createComparisonView(request);
  }

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
    });
    view.attachSettings(context.settings); // live scroll physics, same as the editor
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
      live = true; // keep frames coming until the height stabilizes
    }
    return live;
  }

  // Editor-context keys drive the comparison's synced aligned-row panes, not the hidden buffer:
  // n/p jump changes, Enter promotes the working side to a real editable tab, Esc closes.
  handleKey(key: EditorSurfaceKeyEvent): boolean {
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
        this.gitWorkspace.release();
        return true;
      default:
        return false;
    }
  }

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
