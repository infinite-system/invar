import type { CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import type { LayoutSlots } from '../layout/LayoutSlots';
import type { Settings } from '../settings/Settings';
import type { Palette } from '../theme/ThemePalettes';
import { SplitterElement } from './SplitterElement';

class $PaneSplitters {
  constructor(protected readonly dependencies: PaneSplittersDependencies) {
    // The drag writes the LIVE slot, which belongs to the workspace on screen, and persists the
    // same number as the size a fresh workspace starts at. Two writes, two meanings: one is this
    // workspace's geometry, the other is the application default for the next session.
    // invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
    this.sidebar = new SplitterElement.Class({
      renderer: dependencies.renderer,
      identifier: 'sidebar-divider',
      orientation: 'vertical',
      reportUnit: 'cells',
      initialSize: dependencies.layoutSlots.primaryDockColumns.value,
      minimumSize: 1,
      maximumSize: dependencies.maximumSidebarSize,
      pointerDirection: () =>
        dependencies.settings.sidebarPosition.value === 'left' ? 1 : -1,
      currentSize: () => dependencies.layoutSlots.primaryDockColumns.value,
      onSizeChange: (width) => {
        dependencies.layoutSlots.primaryDockColumns.value = Math.round(width);
      },
      onDragEnd: () => {
        dependencies.settings.sidebarWidth.value =
          dependencies.layoutSlots.primaryDockColumns.value;
        dependencies.settings.save();
      },
    });
  }

  readonly sidebar: SplitterElement.Model;

  updateAppearance(palette: Palette): void {
    this.sidebar.updateAppearance(palette);
  }
}

export namespace PaneSplitters {
  export const $Class = $PaneSplitters;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface PaneSplittersDependencies {
  renderer: CliRenderer;
  settings: Settings.Instance;
  layoutSlots: LayoutSlots.Instance;
  maximumSidebarSize: () => number;
}
