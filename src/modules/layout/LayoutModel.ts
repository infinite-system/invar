import { Static } from 'ivue/extras';

// invariant: Layout slots derive from one configuration (src/modules/layout/layout.invariants.md)
class $LayoutModel {
  protected static get minimumEditorRows(): number {
    return 1;
  }

  protected static get bottomPanelSplitterRows(): number {
    return 1;
  }

  // invariant: Default panel height scales with the viewport (src/modules/layout/layout.invariants.md)
  protected static get defaultBottomPanelProportion(): number {
    return 0.45;
  }

  static defaultBottomPanelRows(totalRows: number): number {
    return Math.max(
      3,
      Math.round(
        Math.max(1, Math.floor(totalRows)) * this.defaultBottomPanelProportion,
      ),
    );
  }

  static maximumUnexpandedBottomPanelRows(totalRows: number): number {
    return Math.max(
      1,
      Math.floor(totalRows) -
        this.minimumEditorRows -
        this.bottomPanelSplitterRows,
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
    Object.defineProperty(this, '$layoutPresets', {
      configurable: true,
      value: presets,
    });
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
    const activityBarColumns =
      primaryDockVisible && options.activityBarVisible
        ? Math.max(0, Math.floor(options.activityBarColumns))
        : 0;
    const sidebarColumns = primaryDockVisible
      ? Math.max(1, Math.floor(options.sidebarColumns))
      : 0;
    const primaryDockSplitterColumns = primaryDockVisible ? 1 : 0;
    const rightDockSplitterColumns = options.rightDockVisible ? 1 : 0;
    const rightDockColumns = options.rightDockVisible
      ? Math.max(1, Math.floor(options.rightDockColumns))
      : 0;
    const rightDockGroupColumns = options.rightDockVisible
      ? rightDockColumns + rightDockSplitterColumns
      : 0;
    const primaryDockGroupColumns =
      activityBarColumns + sidebarColumns + primaryDockSplitterColumns;
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
      totalColumns,
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
        height: primaryDockRows,
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
      bottomPanelSplitter: {
        left: panelLeft,
        top: panelSplitterTop,
        width: panelRight - panelLeft,
        height:
          options.bottomPanelVisible && !bottomPanelExpanded
            ? this.bottomPanelSplitterRows
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
  export const $Class = $LayoutModel;
  export const Class = Static($LayoutModel);
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
  bottomPanelSplitter: LayoutRectangle;
  bottomPanel: LayoutRectangle;
}
