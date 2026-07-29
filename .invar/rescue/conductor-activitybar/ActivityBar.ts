// Standalone VS Code-style activity strip. The reviewer mounts rootRenderable at the far-left
// edge, supplies effective shortcut labels, and owns sidebar switching. This view only projects
// active/hover state, maps pointer cells to view identifiers, and emits selection callbacks.
//
// invariant: Appearance is data with a capability fallback (project.invariants.md)
// invariant: A tooltip never intercepts input (src/modules/ui/ui.invariants.md)
// invariant: Renderables hold no model state (src/modules/ui/ui.invariants.md)

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type CliRenderer,
  type Renderable,
  type TextOptions,
} from '@opentui/core';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import { lineWidth } from '../editor/editor.coordinates';
import type { Theme } from '../theme/Theme';
import type { IconSet } from '../theme/ThemeIcons';
import type { Tooltip } from './Tooltip';

export type ActivityBarViewIdentifier =
  'explorer' | 'search' | 'sourceControl' | 'settings';
export type ActivityBarVisualState = 'idle' | 'hover' | 'active';

export interface ActivityBarCallbacks {
  onSelectView: (viewIdentifier: ActivityBarViewIdentifier) => void;
}

export type ActivityBarShortcutLabels = Readonly<
  Record<ActivityBarViewIdentifier, string>
>;

export interface ActivityBarOptions {
  activeView?: ActivityBarViewIdentifier;
  parentRenderable?: Renderable;
  shortcutLabels: ActivityBarShortcutLabels;
  width?: number;
}

interface ActivityBarItem {
  viewIdentifier: ActivityBarViewIdentifier;
  label: string;
  group: 'top' | 'bottom';
}

interface ActivityIconSet extends IconSet {
  activity?: Partial<Record<ActivityBarViewIdentifier, string>>;
}

export const ACTIVITY_BAR_DEFAULT_WIDTH = 3;

export const ACTIVITY_BAR_ITEMS: readonly ActivityBarItem[] = [
  { viewIdentifier: 'explorer', label: 'Explorer', group: 'top' },
  { viewIdentifier: 'search', label: 'Search', group: 'top' },
  { viewIdentifier: 'sourceControl', label: 'Source Control', group: 'top' },
  { viewIdentifier: 'settings', label: 'Settings', group: 'bottom' },
];

const TOP_ACTIVITY_BAR_ITEMS = ACTIVITY_BAR_ITEMS.filter(
  (item) => item.group === 'top',
);

class $ActivityBar {
  readonly rootRenderable: BoxRenderable;
  readonly itemRenderables = new Map<
    ActivityBarViewIdentifier,
    TextRenderable
  >();

  get activeView() {
    return ref<ActivityBarViewIdentifier>(
      this.options.activeView ?? 'explorer',
    );
  }

  get hoveredView() {
    return ref<ActivityBarViewIdentifier | null>(null);
  }

  constructor(
    public readonly renderer: CliRenderer,
    public readonly theme: Theme.Instance,
    public readonly tooltip: Tooltip.Instance,
    public readonly callbacks: ActivityBarCallbacks,
    public readonly options: ActivityBarOptions,
  ) {
    const activityBarWidth = options.width ?? ACTIVITY_BAR_DEFAULT_WIDTH;
    this.rootRenderable = this.createBoxRenderable({
      id: 'activity-bar',
      width: activityBarWidth,
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      onSizeChange: () => this.update(),
    });

    for (const item of ACTIVITY_BAR_ITEMS) {
      const itemRenderable = this.createTextRenderable({
        id: `activity-bar-${item.viewIdentifier}`,
        position: 'absolute',
        left: 0,
        width: activityBarWidth,
        height: 1,
        content: '',
        selectable: false,
      });
      this.itemRenderables.set(item.viewIdentifier, itemRenderable);
      this.rootRenderable.add(itemRenderable);
    }

    this.rootRenderable.onMouseMove = (event) => {
      this.pointAtPosition(
        event.x - this.rootRenderable.x,
        event.y - this.rootRenderable.y,
        event.x,
        event.y,
      );
    };
    this.rootRenderable.onMouseOut = () => this.clearHover();
    this.rootRenderable.onMouseDown = (event) => {
      this.tooltip.clear();
      this.clickAtPosition(
        event.x - this.rootRenderable.x,
        event.y - this.rootRenderable.y,
      );
    };

    (options.parentRenderable ?? renderer.root).add(this.rootRenderable);
    this.update(activityBarWidth, renderer.height);
  }

  createBoxRenderable(options: BoxOptions): BoxRenderable {
    return new BoxRenderable(this.renderer, options);
  }

  createTextRenderable(options: TextOptions): TextRenderable {
    return new TextRenderable(this.renderer, options);
  }

  static rowForView(
    viewIdentifier: ActivityBarViewIdentifier,
    width: number,
    height: number,
  ): number | null {
    if (width <= 0 || height <= 0) return null;
    const topItemIndex = TOP_ACTIVITY_BAR_ITEMS.findIndex(
      (item) => item.viewIdentifier === viewIdentifier,
    );
    if (topItemIndex >= 0) return topItemIndex < height ? topItemIndex : null;
    if (viewIdentifier === 'settings' && height > TOP_ACTIVITY_BAR_ITEMS.length)
      return height - 1;
    return null;
  }

  static viewIdentifierAtPosition(
    column: number,
    row: number,
    width: number,
    height: number,
  ): ActivityBarViewIdentifier | null {
    if (column < 0 || column >= width || row < 0 || row >= height) return null;
    for (const item of ACTIVITY_BAR_ITEMS) {
      if (this.rowForView(item.viewIdentifier, width, height) === row)
        return item.viewIdentifier;
    }
    return null;
  }

  static visualStateFor(
    viewIdentifier: ActivityBarViewIdentifier,
    activeView: ActivityBarViewIdentifier,
    hoveredView: ActivityBarViewIdentifier | null,
  ): ActivityBarVisualState {
    if (viewIdentifier === activeView) return 'active';
    if (viewIdentifier === hoveredView) return 'hover';
    return 'idle';
  }

  rowForView(
    viewIdentifier: ActivityBarViewIdentifier,
    width = this.activityBarWidth(),
    height = this.activityBarHeight(),
  ): number | null {
    return $ActivityBar.rowForView(viewIdentifier, width, height);
  }

  viewIdentifierAtPosition(
    column: number,
    row: number,
    width = this.activityBarWidth(),
    height = this.activityBarHeight(),
  ): ActivityBarViewIdentifier | null {
    return $ActivityBar.viewIdentifierAtPosition(column, row, width, height);
  }

  visualStateForView(
    viewIdentifier: ActivityBarViewIdentifier,
  ): ActivityBarVisualState {
    return $ActivityBar.visualStateFor(
      viewIdentifier,
      this.activeView.value,
      this.hoveredView.value,
    );
  }

  setActiveView(viewIdentifier: ActivityBarViewIdentifier): void {
    if (this.activeView.value === viewIdentifier) return;
    this.activeView.value = viewIdentifier;
    this.update();
  }

  selectView(viewIdentifier: ActivityBarViewIdentifier): void {
    this.callbacks.onSelectView(viewIdentifier);
  }

  clickAtPosition(
    column: number,
    row: number,
    width = this.activityBarWidth(),
    height = this.activityBarHeight(),
  ): ActivityBarViewIdentifier | null {
    const viewIdentifier = this.viewIdentifierAtPosition(
      column,
      row,
      width,
      height,
    );
    if (viewIdentifier) this.selectView(viewIdentifier);
    return viewIdentifier;
  }

  pointAtPosition(
    column: number,
    row: number,
    screenColumn: number,
    screenRow: number,
    width = this.activityBarWidth(),
    height = this.activityBarHeight(),
  ): ActivityBarViewIdentifier | null {
    const viewIdentifier = this.viewIdentifierAtPosition(
      column,
      row,
      width,
      height,
    );
    if (this.hoveredView.value !== viewIdentifier)
      this.hoveredView.value = viewIdentifier;
    if (!viewIdentifier) {
      this.tooltip.clear();
      this.update(width, height);
      return null;
    }

    const item = ACTIVITY_BAR_ITEMS.find(
      (candidate) => candidate.viewIdentifier === viewIdentifier,
    );
    if (item) {
      const shortcutLabel = this.options.shortcutLabels[viewIdentifier];
      this.tooltip.point(
        `${item.label} (${shortcutLabel})`,
        screenColumn,
        screenRow,
        'auto',
      );
    }
    this.update(width, height);
    return viewIdentifier;
  }

  clearHover(): void {
    if (this.hoveredView.value !== null) this.hoveredView.value = null;
    this.tooltip.clear();
    this.update();
  }

  update(
    width = this.activityBarWidth(),
    height = this.activityBarHeight(),
  ): void {
    const palette = this.theme.palette;
    this.rootRenderable.backgroundColor = palette.panel;

    for (const item of ACTIVITY_BAR_ITEMS) {
      const itemRenderable = this.itemRenderables.get(item.viewIdentifier);
      if (!itemRenderable) continue;
      const itemRow = this.rowForView(item.viewIdentifier, width, height);
      itemRenderable.visible = itemRow !== null;
      if (itemRow === null) continue;

      itemRenderable.top = itemRow;
      itemRenderable.width = width;
      itemRenderable.content = this.centeredIconRow(
        this.iconForView(item.viewIdentifier),
        width,
      );
      const visualState = this.visualStateForView(item.viewIdentifier);
      itemRenderable.fg =
        visualState === 'active'
          ? palette.accent
          : visualState === 'hover'
            ? palette.fg
            : palette.dim;
      itemRenderable.bg =
        visualState === 'active'
          ? palette.selection
          : visualState === 'hover'
            ? palette.cursorLine
            : palette.panel;
    }
  }

  iconForView(viewIdentifier: ActivityBarViewIdentifier): string {
    const activityIcons = (this.theme.icons as ActivityIconSet).activity;
    const contributedIcon = activityIcons?.[viewIdentifier];
    if (contributedIcon) return contributedIcon;

    switch (viewIdentifier) {
      case 'explorer':
        return this.theme.icons.folderClosed;
      case 'search':
        return this.theme.actionIcons.open;
      case 'sourceControl':
        return this.theme.icons.ext.git ?? this.theme.actionIcons.stage;
      case 'settings':
        return this.theme.icons.ext.toml ?? this.theme.actionIcons.discard;
    }
  }

  dispose(): void {
    this.tooltip.clear();
    try {
      (this.options.parentRenderable ?? this.renderer.root).remove(
        this.rootRenderable,
      );
      this.rootRenderable.destroyRecursively();
    } catch {
      // Disposal is idempotent from the caller's perspective.
    }
  }

  private activityBarWidth(): number {
    return (
      this.rootRenderable.width ||
      this.options.width ||
      ACTIVITY_BAR_DEFAULT_WIDTH
    );
  }

  private activityBarHeight(): number {
    return this.rootRenderable.height || this.renderer.height;
  }

  private centeredIconRow(icon: string, width: number): string {
    const visibleIconWidth = Math.min(width, lineWidth(icon));
    const leftPadding = Math.max(0, Math.floor((width - visibleIconWidth) / 2));
    const rightPadding = Math.max(0, width - visibleIconWidth - leftPadding);
    return `${' '.repeat(leftPadding)}${icon}${' '.repeat(rightPadding)}`;
  }
}

export namespace ActivityBar {
  export const $Class = $ActivityBar;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}
