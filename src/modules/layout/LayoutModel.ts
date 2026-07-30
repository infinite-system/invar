import { Static } from 'ivue/extras';

// invariant: Layout slots derive from one configuration (src/modules/layout/layout.invariants.md)
class $LayoutModel {
  protected static get MINIMUM_EDITOR_ROWS(): number {
    return 1;
  }

  protected static get BOTTOM_PANEL_SPLITTER_ROWS(): number {
    return 1;
  }

  protected static get RIGHT_DOCK_SPLITTER_COLUMNS(): number {
    return 1;
  }

  protected static get MINIMUM_RIGHT_DOCK_COLUMNS(): number {
    return 1;
  }

  /** The largest share of the terminal row the right dock may claim. The editor is the prominent
   *  actor, so the dock is a bounded minority of the row at every width. */
  // invariant: The right dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
  protected static get MAXIMUM_RIGHT_DOCK_PROPORTION(): number {
    return 0.3;
  }

  // invariant: Default panel height scales with the viewport (src/modules/layout/layout.invariants.md)
  protected static get DEFAULT_BOTTOM_PANEL_PROPORTION(): number {
    return 0.45;
  }

  static defaultBottomPanelRows(totalRows: number): number {
    return Math.max(
      3,
      Math.round(
        Math.max(1, Math.floor(totalRows)) *
          this.DEFAULT_BOTTOM_PANEL_PROPORTION,
      ),
    );
  }

  static maximumUnexpandedBottomPanelRows(totalRows: number): number {
    return Math.max(
      1,
      Math.floor(totalRows) -
        this.MINIMUM_EDITOR_ROWS -
        this.BOTTOM_PANEL_SPLITTER_ROWS,
    );
  }

  protected static activityBarColumns(options: LayoutModelOptions): number {
    return options.activityBarVisible
      ? Math.max(0, Math.floor(options.activityBarColumns))
      : 0;
  }

  protected static rightActivityBarColumns(
    options: LayoutModelOptions,
  ): number {
    return options.rightActivityBarVisible
      ? Math.max(0, Math.floor(options.activityBarColumns))
      : 0;
  }

  /** The whole left group: activity bar, sidebar, and the sidebar splitter. */
  protected static primaryDockGroupColumns(
    options: LayoutModelOptions,
  ): number {
    const sidebarColumns = options.primaryDockVisible
      ? Math.max(1, Math.floor(options.sidebarColumns))
      : 0;
    const primaryDockSplitterColumns = options.primaryDockVisible ? 1 : 0;
    return (
      this.activityBarColumns(options) +
      sidebarColumns +
      primaryDockSplitterColumns
    );
  }

  /** The columns the editor center and the right dock divide between them: the row minus the left
   *  group, the right-dock splitter, and the right activity bar. */
  protected static sharedEditorAndRightDockColumns(
    options: LayoutModelOptions,
  ): number {
    return Math.max(
      0,
      Math.max(1, Math.floor(options.totalColumns)) -
        this.primaryDockGroupColumns(options) -
        this.RIGHT_DOCK_SPLITTER_COLUMNS -
        this.rightActivityBarColumns(options),
    );
  }

  /** The widest right dock this layout allows. Two bounds apply and the smaller one wins: a fixed
   *  share of the whole row, and one column less than an even split of what the editor center and
   *  the dock share, which keeps the editor strictly wider. */
  // invariant: The right dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
  static maximumRightDockColumns(options: LayoutModelOptions): number {
    const totalColumns = Math.max(1, Math.floor(options.totalColumns));
    const proportionalBound = Math.floor(
      totalColumns * this.MAXIMUM_RIGHT_DOCK_PROPORTION,
    );
    const editorPrecedenceBound = Math.floor(
      (this.sharedEditorAndRightDockColumns(options) - 1) / 2,
    );
    return Math.max(
      this.MINIMUM_RIGHT_DOCK_COLUMNS,
      Math.min(proportionalBound, editorPrecedenceBound),
    );
  }

  protected static get $layoutPresets(): readonly LayoutPreset[] {
    const presets: readonly LayoutPreset[] = [
      {
        identifier: 'default',
        label: 'Default',
        primaryDockVisible: true,
        rightDockVisible: true,
        bottomPanelVisible: true,
        sidebarPosition: 'left',
        panelAlignment: 'center',
        leftDockVerticalSpan: 'full-height',
        rightDockVerticalSpan: 'ends-at-panel',
      },
      {
        identifier: 'full-height-docks',
        label: 'Full-height docks',
        primaryDockVisible: true,
        rightDockVisible: true,
        bottomPanelVisible: true,
        sidebarPosition: 'left',
        panelAlignment: 'center',
        leftDockVerticalSpan: 'full-height',
        rightDockVerticalSpan: 'full-height',
      },
      {
        identifier: 'centered-panel',
        label: 'Centered panel',
        primaryDockVisible: true,
        rightDockVisible: true,
        bottomPanelVisible: true,
        sidebarPosition: 'left',
        panelAlignment: 'center',
        leftDockVerticalSpan: 'ends-at-panel',
        rightDockVerticalSpan: 'ends-at-panel',
      },
      {
        identifier: 'focus',
        label: 'Focus',
        primaryDockVisible: false,
        rightDockVisible: false,
        bottomPanelVisible: false,
        sidebarPosition: 'left',
        panelAlignment: 'center',
        leftDockVerticalSpan: 'full-height',
        rightDockVerticalSpan: 'ends-at-panel',
      },
    ];
    return presets;
  }

  static presets(): readonly LayoutPreset[] {
    return this.$layoutPresets;
  }

  static matchingPresetIdentifier(values: LayoutPresetValues): string | null {
    return (
      this.$layoutPresets.find(
        (preset) =>
          preset.primaryDockVisible === values.primaryDockVisible &&
          preset.rightDockVisible === values.rightDockVisible &&
          preset.bottomPanelVisible === values.bottomPanelVisible &&
          preset.sidebarPosition === values.sidebarPosition &&
          preset.panelAlignment === values.panelAlignment &&
          preset.leftDockVerticalSpan === values.leftDockVerticalSpan &&
          preset.rightDockVerticalSpan === values.rightDockVerticalSpan,
      )?.identifier ?? null
    );
  }

  static resolve(options: LayoutModelOptions): LayoutSlotGeometry {
    const totalColumns = Math.max(1, Math.floor(options.totalColumns));
    const totalRows = Math.max(1, Math.floor(options.totalRows));
    const primaryDockVisible = options.primaryDockVisible;
    const activityBarColumns = this.activityBarColumns(options);
    const sidebarColumns = primaryDockVisible
      ? Math.max(1, Math.floor(options.sidebarColumns))
      : 0;
    const primaryDockSplitterColumns = primaryDockVisible ? 1 : 0;
    const rightDockSplitterColumns = options.rightDockVisible
      ? this.RIGHT_DOCK_SPLITTER_COLUMNS
      : 0;
    // The requested width is a REQUEST, not the answer. The bound is re-applied on every resolve,
    // so a terminal resize re-clamps it and a wider terminal restores the user's dragged width.
    // invariant: The right dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
    const rightDockColumns = options.rightDockVisible
      ? Math.min(
          Math.max(
            this.MINIMUM_RIGHT_DOCK_COLUMNS,
            Math.floor(options.rightDockColumns),
          ),
          this.maximumRightDockColumns(options),
        )
      : 0;
    const rightActivityBarColumns = this.rightActivityBarColumns(options);
    const rightDockGroupColumns =
      (options.rightDockVisible
        ? rightDockColumns + rightDockSplitterColumns
        : 0) + rightActivityBarColumns;
    const primaryDockGroupColumns = this.primaryDockGroupColumns(options);
    const editorColumns = Math.max(
      1,
      totalColumns - primaryDockGroupColumns - rightDockGroupColumns,
    );

    let editorLeft: number;
    let activityBarLeft: number;
    let sidebarLeft: number;
    let sidebarSplitterLeft: number;
    if (options.sidebarPosition === 'left') {
      activityBarLeft = 0;
      sidebarLeft = activityBarColumns;
      sidebarSplitterLeft = sidebarLeft + sidebarColumns;
      editorLeft = sidebarSplitterLeft + primaryDockSplitterColumns;
    } else {
      editorLeft = 0;
      sidebarSplitterLeft = editorColumns;
      sidebarLeft = sidebarSplitterLeft + primaryDockSplitterColumns;
      activityBarLeft = sidebarLeft + sidebarColumns;
    }
    const editorRight = editorLeft + editorColumns;
    const rightDockSplitterLeft =
      options.sidebarPosition === 'left'
        ? editorRight
        : activityBarLeft + activityBarColumns;
    const rightDockLeft = rightDockSplitterLeft + rightDockSplitterColumns;
    const rightActivityBarLeft = rightDockLeft + rightDockColumns;

    const bottomPanelExpanded =
      options.bottomPanelVisible && (options.bottomPanelExpanded ?? false);
    const maximumPanelBoxRows =
      this.maximumUnexpandedBottomPanelRows(totalRows);
    const unexpandedPanelBoxRows = options.bottomPanelVisible
      ? Math.max(
          1,
          Math.min(Math.floor(options.bottomPanelRows), maximumPanelBoxRows),
        )
      : 0;
    const panelBoxRows = bottomPanelExpanded
      ? totalRows
      : unexpandedPanelBoxRows;
    const unexpandedPanelSplitterTop = options.bottomPanelVisible
      ? Math.max(0, totalRows - unexpandedPanelBoxRows - 1)
      : totalRows;
    const panelSplitterTop = options.bottomPanelVisible
      ? bottomPanelExpanded
        ? 0
        : unexpandedPanelSplitterTop
      : totalRows;
    const editorRows = bottomPanelExpanded
      ? 0
      : options.bottomPanelVisible
        ? Math.max(1, panelSplitterTop)
        : totalRows;
    const primaryDockRows = primaryDockVisible
      ? this.dockRows(
          options.leftDockVerticalSpan,
          options.bottomPanelVisible,
          unexpandedPanelSplitterTop,
          totalRows,
        )
      : 0;
    const rightDockRows = options.rightDockVisible
      ? this.dockRows(
          options.rightDockVerticalSpan,
          options.bottomPanelVisible,
          unexpandedPanelSplitterTop,
          totalRows,
        )
      : 0;

    const panelLeft = editorLeft;
    let panelRight = this.panelRight(
      options.panelAlignment,
      editorRight,
      totalColumns - rightActivityBarColumns,
    );
    if (
      options.rightDockVisible &&
      options.rightDockVerticalSpan === 'full-height'
    ) {
      panelRight = Math.min(panelRight, rightDockSplitterLeft);
    }

    return {
      activityBar: {
        left: activityBarLeft,
        top: 0,
        width: activityBarColumns,
        height: activityBarColumns > 0 ? totalRows : 0,
      },
      sidebar: {
        left: sidebarLeft,
        top: 0,
        width: sidebarColumns,
        height: primaryDockRows,
      },
      sidebarSplitter: {
        left: sidebarSplitterLeft,
        top: 0,
        width: primaryDockSplitterColumns,
        height: primaryDockRows,
      },
      editorCenter: {
        left: editorLeft,
        top: 0,
        width: editorColumns,
        height: editorRows,
      },
      rightDockSplitter: {
        left: rightDockSplitterLeft,
        top: 0,
        width: rightDockSplitterColumns,
        height: rightDockRows,
      },
      rightDock: {
        left: options.rightDockVisible ? rightDockLeft : rightDockSplitterLeft,
        top: 0,
        width: rightDockColumns,
        height: rightDockRows,
      },
      rightActivityBar: {
        left: rightActivityBarLeft,
        top: 0,
        width: rightActivityBarColumns,
        height: rightActivityBarColumns > 0 ? totalRows : 0,
      },
      bottomPanelSplitter: {
        left: panelLeft,
        top: panelSplitterTop,
        width: panelRight - panelLeft,
        height:
          options.bottomPanelVisible && !bottomPanelExpanded
            ? this.BOTTOM_PANEL_SPLITTER_ROWS
            : 0,
      },
      bottomPanel: {
        left: panelLeft,
        top: bottomPanelExpanded
          ? 0
          : panelSplitterTop + (options.bottomPanelVisible ? 1 : 0),
        width: panelRight - panelLeft,
        height: panelBoxRows,
      },
    };
  }

  protected static dockRows(
    verticalSpan: DockVerticalSpan,
    bottomPanelVisible: boolean,
    panelSplitterTop: number,
    totalRows: number,
  ): number {
    if (!bottomPanelVisible || verticalSpan === 'full-height') {
      return totalRows;
    }
    return Math.max(1, panelSplitterTop);
  }

  protected static panelRight(
    alignment: PanelAlignment,
    editorRight: number,
    totalColumns: number,
  ): number {
    return alignment === 'right' ? totalColumns : editorRight;
  }
}

export namespace LayoutModel {
  export const $Class = Static($LayoutModel);
  export let Class = $Class;
}

export type SidebarPosition = 'left' | 'right';

export type PanelAlignment = 'center' | 'right';

export type DockVerticalSpan = 'full-height' | 'ends-at-panel';

export interface LayoutConfigurationValues {
  sidebarPosition: SidebarPosition;
  panelAlignment: PanelAlignment;
  leftDockVerticalSpan: DockVerticalSpan;
  rightDockVerticalSpan: DockVerticalSpan;
}

export interface LayoutPresetValues extends LayoutConfigurationValues {
  primaryDockVisible: boolean;
  rightDockVisible: boolean;
  bottomPanelVisible: boolean;
}

export interface LayoutPreset extends LayoutPresetValues {
  identifier: string;
  label: string;
}

export interface LayoutRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayoutModelOptions {
  totalColumns: number;
  totalRows: number;
  primaryDockVisible: boolean;
  activityBarVisible: boolean;
  activityBarColumns: number;
  rightActivityBarVisible?: boolean;
  sidebarColumns: number;
  sidebarPosition: SidebarPosition;
  rightDockVisible: boolean;
  rightDockColumns: number;
  bottomPanelVisible: boolean;
  bottomPanelExpanded?: boolean;
  bottomPanelRows: number;
  panelAlignment: PanelAlignment;
  leftDockVerticalSpan: DockVerticalSpan;
  rightDockVerticalSpan: DockVerticalSpan;
}

export interface LayoutSlotGeometry {
  activityBar: LayoutRectangle;
  sidebar: LayoutRectangle;
  sidebarSplitter: LayoutRectangle;
  editorCenter: LayoutRectangle;
  rightDockSplitter: LayoutRectangle;
  rightDock: LayoutRectangle;
  rightActivityBar: LayoutRectangle;
  bottomPanelSplitter: LayoutRectangle;
  bottomPanel: LayoutRectangle;
}
