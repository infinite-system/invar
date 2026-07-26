import type { BoxRenderable, CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import type { Settings } from '../settings/Settings';
import { ScrollGesture } from './ScrollGesture';
import type { PanelHost } from './PanelHost';
import type { Tooltip } from './Tooltip';

// invariant: Plugin panes use the shared pane and popup hosts (ui.invariants.md)
class $Sidebar {
  constructor(protected readonly dependencies: SidebarDependencies) {
    this.wireHandlers();
  }

  protected wireHandlers(): void {
    const {
      sidebar,
      contentBody,
      primaryDockHost,
      tooltip,
      settings,
      renderer,
    } = this.dependencies;
    const localColumn = (screenColumn: number): number =>
      screenColumn - contentBody.x;
    const localRow = (screenRow: number): number => screenRow - contentBody.y;

    sidebar.onMouseScroll = (event) => {
      const direction = event.scroll?.direction;
      if (!direction) return;
      const step = ScrollGesture.Class.wheelStep(event, settings);
      const horizontal =
        direction === 'left' ||
        direction === 'right' ||
        ScrollGesture.Class.modifierHeld(
          event,
          settings.horizontalScrollModifier.value,
        );
      const backward = direction === 'left' || direction === 'up';
      const content = primaryDockHost.activeContent;
      if (horizontal) {
        content?.onHorizontalWheel?.((backward ? -1 : 1) * step);
      } else {
        content?.onWheel?.((direction === 'up' ? -1 : 1) * step, {
          column: localColumn(event.x),
          row: localRow(event.y),
          modifiers: event.modifiers,
        });
      }
      renderer.requestRender();
    };
    sidebar.onMouseMove = (event) => {
      tooltip.clear();
      primaryDockHost.activeContent?.onPointerMove?.(
        localColumn(event.x),
        localRow(event.y),
      );
    };
    sidebar.onMouseOut = () => {
      primaryDockHost.activeContent?.onPointerOut?.();
      tooltip.clear();
    };
    sidebar.onMouseDown = (event) => {
      primaryDockHost.focus();
      primaryDockHost.activeContent?.onFocus();
      primaryDockHost.activeContent?.onPointerDown?.(
        localColumn(event.x),
        localRow(event.y),
        {
          screenColumn: event.x,
          screenRow: event.y,
          button: event.button,
          modifiers: event.modifiers,
        },
      );
      renderer.requestRender();
    };
  }
}

export namespace Sidebar {
  export const $Class = $Sidebar;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface SidebarDependencies {
  renderer: CliRenderer;
  sidebar: BoxRenderable;
  contentBody: { x: number; y: number };
  primaryDockHost: PanelHost.Instance;
  tooltip: Tooltip.Instance;
  settings: Settings.Instance;
}
