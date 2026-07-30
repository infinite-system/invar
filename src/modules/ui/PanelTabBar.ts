import { StyledText, bg, fg, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { InterfaceGlyphVocabulary } from '../theme/ThemeIcons';
import type { Palette } from '../theme/ThemePalettes';
import { TextCoordinates } from '../text/TextCoordinates';
import type { PanelSpace } from './PanelHost';

// invariant: Tab bars share paint and hit geometry (src/modules/ui/ui.invariants.md)
class $PanelTabBar {
  static project(options: PanelTabBarOptions): PanelTabBarProjection {
    const width = Math.max(0, Math.floor(options.width));
    const controlDefinitions: readonly PanelTabBarControlDefinition[] = [
      ...(options.paneCount > 2
        ? [
            {
              action: 'pane-list' as const,
              text: ` ${options.glyphVocabulary.panelStack} ${options.paneCount} `,
              tooltip: options.paneListExpanded
                ? 'Hide pane list'
                : 'Show pane list',
            },
          ]
        : []),
      {
        action: 'add',
        text: ` ${options.glyphVocabulary.panelAdd} `,
        tooltip: 'Add content space',
      },
      {
        action: 'expand',
        text: ` ${
          options.expanded
            ? options.glyphVocabulary.panelRestore
            : options.glyphVocabulary.panelExpand
        } `,
        tooltip: options.expanded ? 'Restore panel' : 'Expand panel',
      },
      {
        action: 'close',
        text: ` ${options.glyphVocabulary.panelClose} `,
        tooltip: 'Close panel',
      },
    ];
    const controlWidth = controlDefinitions.reduce(
      (sum, control) => sum + TextCoordinates.Class.lineWidth(control.text),
      0,
    );
    const tabWidth = Math.max(0, width - Math.min(width, controlWidth));
    const tabChunks: TextChunk[] = [];
    const tabs: PanelTabBarTabSegment[] = [];
    let column = 0;
    for (const space of options.spaces) {
      const text = ` ${space.label} `;
      const visibleText = TextCoordinates.Class.displayColumnWindow(
        text,
        0,
        Math.max(0, tabWidth - column),
      );
      const visibleWidth = TextCoordinates.Class.lineWidth(visibleText);
      if (visibleWidth <= 0) break;
      const active = space.identifier === options.activeSpaceId;
      const hovered = space.identifier === options.hoveredTabIdentifier;
      const styled = fg(
        active && options.focused
          ? options.palette.accent
          : active
            ? options.palette.fg
            : options.palette.dim,
      )(visibleText);
      tabChunks.push(
        active
          ? bg(options.palette.selection)(styled)
          : hovered
            ? bg(options.palette.cursorLine)(
                fg(options.palette.accent)(visibleText),
              )
            : styled,
      );
      tabs.push({
        identifier: space.identifier,
        startColumn: column,
        endColumn: column + visibleWidth,
      });
      column += visibleWidth;
    }
    const tabsWidth = column;
    column = width - Math.min(width, controlWidth);
    const controlChunks: TextChunk[] = [];
    const controls: PanelTabBarControlSegment[] = [];
    for (const control of controlDefinitions) {
      const visibleText = TextCoordinates.Class.displayColumnWindow(
        control.text,
        0,
        Math.max(0, width - column),
      );
      const visibleWidth = TextCoordinates.Class.lineWidth(visibleText);
      if (visibleWidth <= 0) break;
      const hovered = control.action === options.hoveredAction;
      const active = control.action === 'pane-list' && options.paneListExpanded;
      controlChunks.push(
        hovered
          ? bg(options.palette.cursorLine)(
              fg(options.palette.accent)(visibleText),
            )
          : active
            ? bg(options.palette.selection)(
                fg(options.palette.accent)(visibleText),
              )
            : fg(options.palette.fg)(visibleText),
      );
      controls.push({
        action: control.action,
        tooltip: control.tooltip,
        startColumn: column,
        endColumn: column + visibleWidth,
      });
      column += visibleWidth;
    }
    return {
      tabText: new StyledText(tabChunks),
      controlText: new StyledText(controlChunks),
      tabsWidth,
      controlWidth: width - (controls[0]?.startColumn ?? width),
      tabs,
      controls,
    };
  }

  static tabAtColumn(
    projection: PanelTabBarProjection,
    column: number,
  ): PanelTabBarTabSegment | null {
    return (
      projection.tabs.find(
        (tab) => column >= tab.startColumn && column < tab.endColumn,
      ) ?? null
    );
  }

  static controlAtColumn(
    projection: PanelTabBarProjection,
    column: number,
  ): PanelTabBarControlSegment | null {
    return (
      projection.controls.find(
        (control) =>
          column >= control.startColumn && column < control.endColumn,
      ) ?? null
    );
  }
}

export namespace PanelTabBar {
  export const $Class = Static($PanelTabBar);
  export let Class = $Class;
}

export type PanelTabBarAction = 'pane-list' | 'add' | 'expand' | 'close';

export interface PanelTabBarOptions {
  readonly width: number;
  readonly spaces: readonly PanelSpace[];
  readonly activeSpaceId: string | null;
  readonly paneCount: number;
  readonly paneListExpanded: boolean;
  readonly expanded: boolean;
  readonly focused: boolean;
  readonly hoveredTabIdentifier: string | null;
  readonly hoveredAction: PanelTabBarAction | null;
  readonly glyphVocabulary: InterfaceGlyphVocabulary;
  readonly palette: Palette;
}

export interface PanelTabBarProjection {
  readonly tabText: StyledText;
  readonly controlText: StyledText;
  readonly tabsWidth: number;
  readonly controlWidth: number;
  readonly tabs: readonly PanelTabBarTabSegment[];
  readonly controls: readonly PanelTabBarControlSegment[];
}

export interface PanelTabBarTabSegment {
  readonly identifier: string;
  readonly startColumn: number;
  readonly endColumn: number;
}

export interface PanelTabBarControlSegment {
  readonly action: PanelTabBarAction;
  readonly tooltip: string;
  readonly startColumn: number;
  readonly endColumn: number;
}

export interface PanelTabBarControlDefinition {
  readonly action: PanelTabBarAction;
  readonly text: string;
  readonly tooltip: string;
}
