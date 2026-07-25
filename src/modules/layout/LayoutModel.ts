import { Static } from 'ivue/extras';

// invariant: Layout slots derive from one configuration (src/modules/layout/layout.invariants.md)
class $LayoutModel {
  static resolve(options: LayoutModelOptions): LayoutSlotGeometry {
    const totalColumns = Math.max(1, Math.floor(options.totalColumns));
    const totalRows = Math.max(1, Math.floor(options.totalRows));
    const activityBarColumns = options.activityBarVisible
      ? Math.max(0, Math.floor(options.activityBarColumns))
      : 0;
    const sidebarColumns = Math.max(1, Math.floor(options.sidebarColumns));
    const splitterColumns = 1;
    const rightDockColumns = options.rightDockVisible
      ? Math.max(1, Math.floor(options.rightDockColumns))
      : 0;
    const rightDockGroupColumns = options.rightDockVisible
      ? rightDockColumns + splitterColumns
      : 0;
    const primaryDockGroupColumns =
      activityBarColumns + sidebarColumns + splitterColumns;
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
      editorLeft = sidebarSplitterLeft + splitterColumns;
    } else {
      editorLeft = 0;
      sidebarSplitterLeft = editorColumns;
      sidebarLeft = sidebarSplitterLeft + splitterColumns;
      activityBarLeft = sidebarLeft + sidebarColumns;
    }
    const editorRight = editorLeft + editorColumns;
    const rightDockSplitterLeft =
      options.sidebarPosition === 'left'
        ? editorRight
        : activityBarLeft + activityBarColumns;
    const rightDockLeft = rightDockSplitterLeft + splitterColumns;

    const maximumPanelBoxRows = Math.max(1, totalRows - 1);
    const panelBoxRows = options.bottomPanelVisible
      ? Math.max(
          1,
          Math.min(
            Math.floor(options.bottomPanelRows),
            maximumPanelBoxRows,
          ),
        )
      : 0;
    const panelSplitterTop = options.bottomPanelVisible
      ? totalRows - panelBoxRows - 1
      : totalRows;
    const editorRows = options.bottomPanelVisible
      ? Math.max(1, panelSplitterTop)
      : totalRows;
    const primaryDockRows = this.dockRows(
      options.leftDockVerticalSpan,
      options.bottomPanelVisible,
      panelSplitterTop,
      totalRows,
    );
    const rightDockRows = options.rightDockVisible
      ? this.dockRows(
          options.rightDockVerticalSpan,
          options.bottomPanelVisible,
          panelSplitterTop,
          totalRows,
        )
      : 0;

    const panelLeft = this.panelLeft(
      options.panelAlignment,
      editorLeft,
    );
    const panelRight = this.panelRight(
      options.panelAlignment,
      editorRight,
      totalColumns,
    );

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
        width: splitterColumns,
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
        width: options.rightDockVisible ? splitterColumns : 0,
        height: rightDockRows,
      },
      rightDock: {
        left: options.rightDockVisible
          ? rightDockLeft
          : rightDockSplitterLeft,
        top: 0,
        width: rightDockColumns,
        height: rightDockRows,
      },
      bottomPanelSplitter: {
        left: panelLeft,
        top: panelSplitterTop,
        width: panelRight - panelLeft,
        height: options.bottomPanelVisible ? 1 : 0,
      },
      bottomPanel: {
        left: panelLeft,
        top: panelSplitterTop + (options.bottomPanelVisible ? 1 : 0),
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

  protected static panelLeft(
    alignment: PanelAlignment,
    editorLeft: number,
  ): number {
    return alignment === 'left' || alignment === 'justify'
      ? 0
      : editorLeft;
  }

  protected static panelRight(
    alignment: PanelAlignment,
    editorRight: number,
    totalColumns: number,
  ): number {
    return alignment === 'right' || alignment === 'justify'
      ? totalColumns
      : editorRight;
  }
}

export namespace LayoutModel {
  export const $Class = $LayoutModel;
  export const Class = Static($LayoutModel);
}

export type SidebarPosition = 'left' | 'right';

export type PanelAlignment = 'left' | 'center' | 'right' | 'justify';

export type DockVerticalSpan = 'full-height' | 'ends-at-panel';

export interface LayoutRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayoutModelOptions {
  totalColumns: number;
  totalRows: number;
  activityBarVisible: boolean;
  activityBarColumns: number;
  sidebarColumns: number;
  sidebarPosition: SidebarPosition;
  rightDockVisible: boolean;
  rightDockColumns: number;
  bottomPanelVisible: boolean;
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
