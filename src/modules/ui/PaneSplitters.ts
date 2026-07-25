// The pane-splitter controller: the two draggable dividers that resize panes — the sidebar↔editor
// width divider (a SplitterModel bound to settings.sidebarWidth) and the git changes↔log height
// divider (bound to the workspace's git split ratio). Both capture the drag target on mousedown so a
// 1-cell strip survives the drag, update LIVE on every tick, and persist exactly ONCE on release
// (a synchronous settings write at mouse-move frequency would stall the frame loop).
//
// RootView mounts the SplitterElement renderables; geometry, hover, drag capture, and palette state
// remain inside the shared element seam.
import type { BoxRenderable, CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import type { Settings } from '../settings/Settings';
import type { Palette } from '../theme/ThemePalettes';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import { SplitterElement } from './SplitterElement';
class $PaneSplitters {
    readonly sidebar: SplitterElement.Model;
    readonly git: SplitterElement.Model;
    constructor(protected readonly deps: PaneSplittersDeps) {
        this.sidebar = new SplitterElement.Class({
            renderer: deps.renderer,
            identifier: 'sidebar-divider',
            orientation: 'vertical',
            reportUnit: 'cells',
            initialSize: deps.settings.sidebarWidth.value,
            minimumSize: 18,
            maximumSize: 70,
            pointerDirection: () => deps.settings.sidebarPosition.value === 'left' ? 1 : -1,
            currentSize: () => deps.settings.sidebarWidth.value,
            onSizeChange: (width) => {
                deps.settings.sidebarWidth.value = Math.round(width);
            },
            onDragEnd: () => deps.settings.save(),
        });
        this.git = new SplitterElement.Class({
            renderer: deps.renderer,
            identifier: 'git-split-divider',
            orientation: 'horizontal',
            reportUnit: 'ratio',
            initialSize: deps.workspaceSet.active.gitSplitRatio,
            minimumSize: 0.1,
            maximumSize: 0.9,
            currentSize: () => deps.workspaceSet.active.gitSplitRatio,
            currentExtentCells: () => Math.max(1, Number(deps.sidebar.height) - 2),
            onSizeChange: (ratio) => deps.workspaceSet.active.setGitSplit(ratio),
            onDragEnd: () => deps.workspaceSet.active.persistGitSplit(),
        });
        this.git.renderable.position = 'absolute';
        this.git.renderable.visible = false;
    }
    updateAppearance(palette: Palette): void {
        this.sidebar.updateAppearance(palette);
        this.git.updateAppearance(palette);
    }
}
export namespace PaneSplitters {
    export const $Class = $PaneSplitters;
    export let Class = Reactive($Class);
    export type Instance = typeof Class.Instance;
}
export interface PaneSplittersDeps {
    renderer: CliRenderer;
    settings: Settings.Instance;
    workspaceSet: WorkspaceSet.Instance;
    sidebar: BoxRenderable;
}
