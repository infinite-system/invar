import { Static } from 'ivue/extras';
import {
  StyledText,
  TextRenderable,
  bg,
  fg,
  type CliRenderer,
  type MouseEvent,
  type TextChunk,
} from '@opentui/core';
import { TextCoordinates } from '../text/TextCoordinates';
import {
  LayoutModel,
  type LayoutPreset,
  type LayoutPresetValues,
} from '../layout/LayoutModel';
import { Files } from '../system/Files';
import type { Theme } from '../theme/Theme';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type {
  BoundedListPopup,
  BoundedListPopupItem,
} from './BoundedListPopup';
import type { OverlayCoordinator } from './OverlayCoordinator';
import type { Tooltip } from './Tooltip';

// invariant: Command bar paint and hit geometry are identical (src/modules/ui/ui.invariants.md)
// invariant: Layout slots derive from one configuration (src/modules/layout/layout.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
class $CommandBar {
  static layoutGeometry(
    width: number,
    folderName: string,
    layoutSwitcherGlyph: string,
    searchGlyph: string,
  ): CommandBarGeometry {
    const boundedWidth = Math.max(1, Math.floor(width));
    const layoutSwitcherLabel = ` ${layoutSwitcherGlyph} `;
    const layoutSwitcherStartColumn = Math.max(
      0,
      boundedWidth - TextCoordinates.Class.lineWidth(layoutSwitcherLabel),
    );
    const availableProjectColumns = Math.max(1, layoutSwitcherStartColumn);
    const searchLabel = ` ${searchGlyph} `;
    const searchWidth = Math.min(
      TextCoordinates.Class.lineWidth(searchLabel),
      availableProjectColumns,
    );
    const maximumFolderColumns = Math.max(
      0,
      availableProjectColumns - searchWidth,
    );
    const visibleFolderName = TextCoordinates.Class.displayColumnWindow(
      folderName || '.',
      0,
      maximumFolderColumns,
    );
    const visibleSearchLabel = TextCoordinates.Class.displayColumnWindow(
      searchLabel,
      0,
      searchWidth,
    );
    const folderLabel = visibleFolderName;
    const folderEndColumn =
      searchWidth + TextCoordinates.Class.lineWidth(folderLabel);
    const segments: CommandBarSegment[] = [
      {
        control: 'search',
        label: visibleSearchLabel,
        startColumn: 0,
        endColumn: searchWidth,
      },
      {
        control: 'folder',
        label: folderLabel,
        startColumn: searchWidth,
        endColumn: folderEndColumn,
      },
    ];
    if (layoutSwitcherStartColumn < boundedWidth) {
      segments.push({
        control: 'layouts',
        label: TextCoordinates.Class.displayColumnWindow(
          layoutSwitcherLabel,
          0,
          boundedWidth - layoutSwitcherStartColumn,
        ),
        startColumn: layoutSwitcherStartColumn,
        endColumn: boundedWidth,
      });
    }
    return { width: boundedWidth, segments };
  }

  constructor(protected readonly dependencies: CommandBarDependencies) {
    this.bar = new TextRenderable(dependencies.renderer, {
      id: 'workspace-command-bar',
      content: '',
      width: '100%',
      height: 1,
      wrapMode: 'none',
      selectable: false,
    });
    this.wirePointerInput();
  }

  readonly bar: TextRenderable;
  protected currentGeometry: CommandBarGeometry = {
    width: 1,
    segments: [],
  };

  update(): void {
    const width =
      Number(this.bar.width) > 0
        ? Number(this.bar.width)
        : this.dependencies.renderer.width;
    const folderName =
      Files.Class.basename(this.dependencies.workspaceSet.active.root) ||
      this.dependencies.workspaceSet.active.root ||
      '.';
    this.currentGeometry = $CommandBar.layoutGeometry(
      width,
      folderName,
      this.dependencies.theme.glyphVocabulary.layoutSwitcher,
      this.dependencies.theme.findIcons.search,
    );
    this.bar.content = this.renderGeometry(this.currentGeometry);
    this.bar.fg = this.dependencies.theme.palette.fg;
  }

  controlAtColumn(column: number): CommandBarControl | null {
    return (
      this.currentGeometry.segments.find(
        (segment) =>
          column >= segment.startColumn && column < segment.endColumn,
      )?.control ?? null
    );
  }

  protected get currentLayoutIdentifier(): string {
    return (
      LayoutModel.Class.matchingPresetIdentifier(
        this.dependencies.currentLayoutValues(),
      ) ?? ''
    );
  }

  protected renderGeometry(geometry: CommandBarGeometry): StyledText {
    const chunks: TextChunk[] = [];
    const palette = this.dependencies.theme.palette;
    let nextColumn = 0;
    for (const segment of geometry.segments) {
      if (segment.startColumn > nextColumn) {
        chunks.push(
          bg(palette.panel)(
            fg(palette.dim)(' '.repeat(segment.startColumn - nextColumn)),
          ),
        );
      }
      const controlForeground = palette.fg;
      const controlText = bg(palette.panel)(
        fg(controlForeground)(segment.label),
      );
      chunks.push(
        this.hoveredControl === segment.control
          ? bg(palette.cursorLine)(fg(controlForeground)(segment.label))
          : controlText,
      );
      nextColumn = segment.endColumn;
    }
    if (nextColumn < geometry.width) {
      chunks.push(
        bg(palette.panel)(
          fg(palette.dim)(' '.repeat(geometry.width - nextColumn)),
        ),
      );
    }
    return new StyledText(chunks);
  }

  protected get hoveredControl(): CommandBarControl | null {
    return this.hoveredControlValue;
  }

  protected hoveredControlValue: CommandBarControl | null = null;

  protected runControl(control: CommandBarControl, event: MouseEvent): void {
    if (control === 'search' || control === 'folder') {
      this.dependencies.overlayCoordinator.openExclusiveOverlay(
        'quickOpen',
        () =>
          void this.dependencies.quickOpen.show(
            this.dependencies.workspaceSet.active.root,
          ),
      );
    } else {
      this.openLayoutsMenu(event);
    }
    this.dependencies.renderer.requestRender();
  }

  protected openLayoutsMenu(event: MouseEvent): void {
    const presets = LayoutModel.Class.presets();
    const items: BoundedListPopupItem[] = presets.map((preset) => ({
      identifier: preset.identifier,
      label: preset.label,
      selected: preset.identifier === this.currentLayoutIdentifier,
    }));
    this.dependencies.overlayCoordinator.openExclusiveOverlay(
      'boundedListPopup',
      () =>
        this.dependencies.boundedListPopup.openAt(
          items,
          { column: event.x, row: event.y },
          (item) => {
            const preset = presets.find(
              (candidate) => candidate.identifier === item.identifier,
            );
            if (preset) this.dependencies.applyLayoutPreset(preset);
          },
          {
            title: 'Layouts',
            selectedItemIdentifier: this.currentLayoutIdentifier,
            minimumWidth: 24,
          },
        ),
    );
  }

  protected tooltipForControl(control: CommandBarControl): string {
    if (control === 'search' || control === 'folder') {
      return this.tooltipWithBinding('Go to File', 'quickopen.open', 'global');
    }
    return 'Layouts';
  }

  protected tooltipWithBinding(
    label: string,
    actionIdentifier: string,
    context: 'global' | 'editor',
  ): string {
    const bindingHint = this.dependencies.keybindings.bindingHint(
      actionIdentifier,
      context,
    );
    return bindingHint ? `${label} (${bindingHint})` : label;
  }

  protected wirePointerInput(): void {
    this.bar.onMouseMove = (event) => {
      const localColumn = event.x - Number(this.bar.x);
      const control = this.controlAtColumn(localColumn);
      this.hoveredControlValue = control;
      if (control) {
        this.dependencies.tooltip.point(
          this.tooltipForControl(control),
          event.x,
          event.y,
        );
      } else {
        this.dependencies.tooltip.clear();
      }
      this.dependencies.renderer.requestRender();
    };
    this.bar.onMouseOut = () => {
      this.hoveredControlValue = null;
      this.dependencies.tooltip.clear();
      this.dependencies.renderer.requestRender();
    };
    this.bar.onMouseDown = (event) => {
      const control = this.controlAtColumn(event.x - Number(this.bar.x));
      if (control) this.runControl(control, event);
    };
  }
}

export namespace CommandBar {
  export const $Class = Static($CommandBar);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface CommandBarDependencies {
  renderer: CliRenderer;
  workspaceSet: WorkspaceSet.Instance;
  theme: Theme.Instance;
  tooltip: Tooltip.Instance;
  overlayCoordinator: OverlayCoordinator.Instance;
  boundedListPopup: BoundedListPopup.Instance;
  quickOpen: {
    show(root: string): Promise<void>;
  };
  keybindings: KeybindingRegistry.Instance;
  currentLayoutValues(): LayoutPresetValues;
  applyLayoutPreset(preset: LayoutPreset): void;
}

export type CommandBarControl = 'search' | 'folder' | 'layouts';

export interface CommandBarSegment {
  control: CommandBarControl;
  label: string;
  startColumn: number;
  endColumn: number;
}

export interface CommandBarGeometry {
  width: number;
  segments: CommandBarSegment[];
}
