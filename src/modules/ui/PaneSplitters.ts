import type { CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import type { Settings } from '../settings/Settings';
import type { Palette } from '../theme/ThemePalettes';
import { SplitterElement } from './SplitterElement';

class $PaneSplitters {
  readonly sidebar: SplitterElement.Model;

  constructor(protected readonly dependencies: PaneSplittersDependencies) {
    this.sidebar = new SplitterElement.Class({
      renderer: dependencies.renderer,
      identifier: 'sidebar-divider',
      orientation: 'vertical',
      reportUnit: 'cells',
      initialSize: dependencies.settings.sidebarWidth.value,
      minimumSize: 18,
      maximumSize: 70,
      pointerDirection: () =>
        dependencies.settings.sidebarPosition.value === 'left' ? 1 : -1,
      currentSize: () => dependencies.settings.sidebarWidth.value,
      onSizeChange: (width) => {
        dependencies.settings.sidebarWidth.value = Math.round(width);
      },
      onDragEnd: () => dependencies.settings.save(),
    });
  }

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
}
