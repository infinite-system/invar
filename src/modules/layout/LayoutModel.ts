import { Static } from 'ivue/extras';

// invariant: Layout slots derive from one configuration (src/modules/layout/layout.invariants.md)
class $LayoutModel {
  protected static get MINIMUM_EDITOR_ROWS(): number {
    return 1;
  }

  protected static get BOTTOM_PANEL_SPLITTER_ROWS(): number {
    return 1;
  }

  protected static get BOTTOM_PANEL_TAB_ROWS(): number {
    return 1;
  }

  protected static get RIGHT_DOCK_SPLITTER_COLUMNS(): number {
    return 1;
  }

  protected static get MINIMUM_DOCK_CONTENT_COLUMNS(): number {
    return 1;
  }

  /** The largest share of the terminal row either complete dock group may claim. */
  // invariant: Each dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
  protected static get MAXIMUM_DOCK_PROPORTION(): number {
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
    // invariant: An unexpanded bottom panel leaves one editor row (src/modules/layout/layout.invariants.md)
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

  protected static primaryDockChromeColumns(
    options: LayoutModelOptions,
  ): number {
    const primaryDockSplitterColumns = options.primaryDockVisible ? 1 : 0;
    return this.activityBarColumns(options) + primaryDockSplitterColumns;
  }

  protected static rightDockChromeColumns(options: LayoutModelOptions): number {
    return (
      (options.rightDockVisible ? this.RIGHT_DOCK_SPLITTER_COLUMNS : 0) +
      this.rightActivityBarColumns(options)
    );
  }

  protected static maximumDockContentColumns(
    totalColumns: number,
    otherDockGroupColumns: number,
    dockChromeColumns: number,
  ): number {
    const proportionalBound = Math.floor(
      totalColumns * this.MAXIMUM_DOCK_PROPORTION,
    );
    const sharedEditorAndDockGroupColumns = Math.max(
      0,
      totalColumns - otherDockGroupColumns,
    );
    const editorPrecedenceBound =
      Math.floor((sharedEditorAndDockGroupColumns - 1) / 2) - dockChromeColumns;
    return Math.max(
      this.MINIMUM_DOCK_CONTENT_COLUMNS,
      Math.min(proportionalBound, editorPrecedenceBound),
    );
  }

  protected static requestedPrimaryDockGroupColumns(
    options: LayoutModelOptions,
  ): number {
    const contentColumns = options.primaryDockVisible
      ? Math.max(
          this.MINIMUM_DOCK_CONTENT_COLUMNS,
          Math.floor(options.sidebarColumns),
        )
      : 0;
    return this.primaryDockChromeColumns(options) + contentColumns;
  }

  protected static requestedRightDockGroupColumns(
    options: LayoutModelOptions,
  ): number {
    const contentColumns = options.rightDockVisible
      ? Math.max(
          this.MINIMUM_DOCK_CONTENT_COLUMNS,
          Math.floor(options.rightDockColumns),
        )
      : 0;
    return this.rightDockChromeColumns(options) + contentColumns;
  }

  /** The widest primary-dock content this layout allows after its activity bar and splitter take
   *  their columns. The complete group stays bounded and strictly narrower than the editor. */
  // invariant: Each dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
  static maximumPrimaryDockColumns(options: LayoutModelOptions): number {
    const totalColumns = Math.max(1, Math.floor(options.totalColumns));
    return this.maximumDockContentColumns(
      totalColumns,
      this.requestedRightDockGroupColumns(options),
      this.primaryDockChromeColumns(options),
    );
  }

  /** The widest right-dock content this layout allows after its splitter and optional activity bar
   *  take their columns. The complete group stays bounded and strictly narrower than the editor. */
  // invariant: Each dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
  static maximumRightDockColumns(options: LayoutModelOptions): number {
    const totalColumns = Math.max(1, Math.floor(options.totalColumns));
    return this.maximumDockContentColumns(
      totalColumns,
      this.requestedPrimaryDockGroupColumns(options),
      this.rightDockChromeColumns(options),
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
    // Stored dock widths are requests. Every resolve clamps only the painted content, so a narrow
    // row cannot rewrite either setting and a later wider row restores the requested widths.
    // invariant: Each dock stays a bounded minority of the row (src/modules/layout/layout.invariants.md)
    const sidebarColumns = primaryDockVisible
      ? Math.min(
          Math.max(
            this.MINIMUM_DOCK_CONTENT_COLUMNS,
            Math.floor(options.sidebarColumns),
          ),
          this.maximumPrimaryDockColumns(options),
        )
      : 0;
    const primaryDockSplitterColumns = primaryDockVisible ? 1 : 0;
    const rightDockSplitterColumns = options.rightDockVisible
      ? this.RIGHT_DOCK_SPLITTER_COLUMNS
      : 0;
    const rightDockColumns = options.rightDockVisible
      ? Math.min(
          Math.max(
            this.MINIMUM_DOCK_CONTENT_COLUMNS,
            Math.floor(options.rightDockColumns),
          ),
          this.maximumRightDockColumns(options),
        )
      : 0;
    const rightActivityBarColumns = this.rightActivityBarColumns(options);
    const rightDockGroupColumns =
      rightDockColumns + rightDockSplitterColumns + rightActivityBarColumns;
    const primaryDockGroupColumns =
      sidebarColumns + activityBarColumns + primaryDockSplitterColumns;
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
    const panelFillTop = panelSplitterTop;
    const panelFillRows = options.bottomPanelVisible
      ? totalRows - panelFillTop
      : 0;
    const primaryDockRemainderLeft = activityBarLeft + activityBarColumns;
    const primaryDockRemainderColumns =
      primaryDockVisible &&
      options.sidebarPosition === 'left' &&
      options.leftDockVerticalSpan === 'ends-at-panel'
        ? Math.max(0, panelLeft - primaryDockRemainderLeft)
        : 0;
    const rightDockRemainderLeft = panelRight;
    const rightDockRemainderColumns =
      options.rightDockVisible &&
      options.rightDockVerticalSpan === 'ends-at-panel'
        ? Math.max(
            0,
            totalColumns - rightActivityBarColumns - rightDockRemainderLeft,
          )
        : 0;

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
      primaryDockRemainder: {
        left: primaryDockRemainderLeft,
        top: panelFillTop,
        width: primaryDockRemainderColumns,
        height: primaryDockRemainderColumns > 0 ? panelFillRows : 0,
      },
      rightDockRemainder: {
        left: rightDockRemainderLeft,
        top: panelFillTop,
        width: rightDockRemainderColumns,
        height: rightDockRemainderColumns > 0 ? panelFillRows : 0,
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
      bottomPanelTabs: {
        left: panelLeft,
        top: bottomPanelExpanded
          ? 0
          : panelSplitterTop + (options.bottomPanelVisible ? 1 : 0),
        width: panelRight - panelLeft,
        height: options.bottomPanelVisible ? this.BOTTOM_PANEL_TAB_ROWS : 0,
      },
      bottomPanel: {
        left: panelLeft,
        top:
          (bottomPanelExpanded
            ? 0
            : panelSplitterTop + (options.bottomPanelVisible ? 1 : 0)) +
          (options.bottomPanelVisible ? this.BOTTOM_PANEL_TAB_ROWS : 0),
        width: panelRight - panelLeft,
        height: Math.max(
          0,
          panelBoxRows -
            (options.bottomPanelVisible ? this.BOTTOM_PANEL_TAB_ROWS : 0),
        ),
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
  primaryDockRemainder: LayoutRectangle;
  rightDockRemainder: LayoutRectangle;
  bottomPanelSplitter: LayoutRectangle;
  bottomPanelTabs: LayoutRectangle;
  bottomPanel: LayoutRectangle;
}
