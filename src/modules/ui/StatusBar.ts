// The status bar: a controller that OWNS its renderables (the bar box, the status text, and the
// clickable `?` shortcut-help button) plus the button's hover state and handlers. Extracted from
// RootView's closure as the first pane CONTROLLER (not just a renderer) — RootView constructs it,
// mounts `bar` into the layout column, and calls update() each frame.
//
// This is the Tooltip idiom (a Reactive class holding plain non-reactive fields) applied to a pane:
// the renderables and hover flag are plain fields; the class is instantiated `new StatusBar.Class(deps)`.
//
// invariant: The shortcut sheet lists the effective bindings (src/modules/ui/ui.invariants.md)
// invariant: The right dock control owns the status edge (src/modules/ui/ui.invariants.md)
import { BoxRenderable, TextRenderable, type CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import type { Palette } from '../theme/ThemePalettes';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { App } from '../app/App';
import type { ShortcutHelp } from './ShortcutHelp';
import type { OverlayCoordinator } from './OverlayCoordinator';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type { Tooltip } from './Tooltip';
import type { Theme } from '../theme/Theme';
import type { SettingsPanel } from '../settings/SettingsPanel';
import type { PanelHost } from './PanelHost';
import type { StatusBarSegments } from './StatusBarSegments';

class $StatusBar {
  /** One left-margin authority for every ordered status contribution. */
  static composeStatusText(segments: readonly string[]): string {
    return segments.length > 0 ? ` ${segments.join('  ·  ')}` : '';
  }

  constructor(protected readonly deps: StatusBarDeps) {
    const { renderer } = deps;
    this.bar = new BoxRenderable(renderer, {
      id: 'status-bar',
      width: '100%',
      height: 1,
      flexDirection: 'row',
    });
    this.statusText = new TextRenderable(renderer, {
      id: 'status-text',
      content: '',
    });
    this.bar.add(this.statusText);
    // Clickable shortcut-help affordance: a real hit-tested `?` cell span pinned to the RIGHT end of
    // the status bar (the spacer's flexGrow pushes it there). Click toggles the cheat-sheet through
    // the exclusive-overlay coordinator; hover shows a tooltip with the bound open chord.
    const spacer = new BoxRenderable(renderer, {
      id: 'status-spacer',
      flexGrow: 1,
      height: 1,
    });
    // Minute clock (HH:MM, local). It is the penultimate item: the right-dock control owns the outer
    // edge, so the stable corner order is clock then right-dock.
    this.clock = new TextRenderable(renderer, {
      id: 'status-clock',
      content: ` ${this.formatClock()} `,
      height: 1,
      selectable: false,
    });
    // A contributor may publish one compact control without teaching this host its identity.
    this.contributionButton = new TextRenderable(renderer, {
      id: 'status-contribution-button',
      content: '',
      width: 3,
      height: 1,
      selectable: false,
      visible: false,
    });
    this.rightDockButton = new TextRenderable(renderer, {
      id: 'status-right-dock-button',
      content: ` ${deps.theme.rightDockIcon} `,
      width: 3,
      height: 1,
      selectable: false,
    });
    // Settings (gear) affordance: a hit-tested single-cell glyph pinned to the right end, LEFT of the
    // `?` button. Click toggles the settings panel through the exclusive-overlay coordinator (the same
    // way `?` toggles the cheat-sheet); hover shows a tooltip with the bound open chord.
    this.settingsButton = new TextRenderable(renderer, {
      id: 'status-settings-button',
      content: ` ${deps.theme.settingsIcon} `,
      width: 3,
      height: 1,
      selectable: false,
    });
    this.shortcutHelpButton = new TextRenderable(renderer, {
      id: 'status-help-button',
      content: ' ? ',
      width: 3,
      height: 1,
      selectable: false, // a click must only toggle the sheet, never start a text selection
    });
    this.bar.add(spacer);
    this.bar.add(this.contributionButton);
    this.bar.add(this.settingsButton);
    this.bar.add(this.shortcutHelpButton);
    this.bar.add(this.clock);
    this.bar.add(this.rightDockButton);
    // Arm the minute-boundary repaint and tear it down with the app (no leak past quit).
    this.scheduleClockTick();
    deps.app.onDispose(() => {
      if (this.clockTimer) clearTimeout(this.clockTimer);
    });
    this.contributionButton.onMouseDown = () => {
      this.contributedControl?.run();
      renderer.requestRender();
    };
    this.contributionButton.onMouseMove = (event) => {
      if (!this.contributionHover) {
        this.contributionHover = true;
        renderer.requestRender();
      }
      if (this.contributedControl)
        deps.tooltip.point(this.contributedControl.label, event.x, event.y);
    };
    this.contributionButton.onMouseOut = () => {
      if (this.contributionHover) {
        this.contributionHover = false;
        renderer.requestRender();
      }
      deps.tooltip.clear();
    };
    this.rightDockButton.onMouseDown = () => {
      // invariant: Right dock command and mouse affordance share one toggle (src/modules/ui/ui.invariants.md)
      deps.toggleRightDock();
      renderer.requestRender();
    };
    this.rightDockButton.onMouseMove = (event) => {
      if (!this.rightDockHover) {
        this.rightDockHover = true;
        renderer.requestRender();
      }
      const openChordHint = deps.keybindings.bindingHint(
        'view.toggleRightDock',
        'global',
      );
      deps.tooltip.point(
        `Right dock${openChordHint ? ` (${openChordHint})` : ''}`,
        event.x,
        event.y,
      );
    };
    this.rightDockButton.onMouseOut = () => {
      if (this.rightDockHover) {
        this.rightDockHover = false;
        renderer.requestRender();
      }
      deps.tooltip.clear();
    };
    this.clock.onMouseDown = () => {
      // The clock intentionally has no action yet, but owns a real hit-tested click target so the
      // corner remains mouse-addressable when a clock action is added.
      renderer.requestRender();
    };
    this.settingsButton.onMouseDown = () => {
      this.toggleSettings();
      renderer.requestRender();
    };
    this.settingsButton.onMouseMove = (event) => {
      if (!this.settingsHover) {
        this.settingsHover = true;
        renderer.requestRender();
      }
      const openChordHint = deps.keybindings.bindingHint(
        'settings.toggle',
        'global',
      );
      deps.tooltip.point(
        `Settings${openChordHint ? ` (${openChordHint})` : ''}`,
        event.x,
        event.y,
      );
    };
    this.settingsButton.onMouseOut = () => {
      if (this.settingsHover) {
        this.settingsHover = false;
        renderer.requestRender();
      }
      deps.tooltip.clear();
    };
    this.shortcutHelpButton.onMouseDown = () => {
      this.toggle();
      renderer.requestRender();
    };
    this.shortcutHelpButton.onMouseMove = (event) => {
      if (!this.hover) {
        this.hover = true;
        renderer.requestRender();
      }
      const openChordHint = deps.keybindings.bindingHint(
        'help.shortcuts',
        'global',
      );
      deps.tooltip.point(
        `Keyboard shortcuts${openChordHint ? ` (${openChordHint})` : ''}`,
        event.x,
        event.y,
      );
    };
    this.shortcutHelpButton.onMouseOut = () => {
      if (this.hover) {
        this.hover = false;
        renderer.requestRender();
      }
      deps.tooltip.clear();
    };
  }

  /** The status-bar box; RootView mounts this into the layout column. */
  readonly bar: BoxRenderable;
  protected readonly statusText: TextRenderable;
  protected readonly shortcutHelpButton: TextRenderable;
  protected readonly settingsButton: TextRenderable;
  protected readonly contributionButton: TextRenderable;
  protected readonly rightDockButton: TextRenderable;
  protected readonly clock: TextRenderable;
  protected hover = false;
  protected settingsHover = false;
  protected contributionHover = false;
  protected contributedControl:
    ReturnType<StatusBarSegments.Model['controls']>[number] | null = null;
  protected rightDockHover = false;
  // The clock's single re-armed minute-boundary timer (NOT a per-second interval): the only periodic
  // wake at rest, once/min, so it forces the demand-driven loop to repaint the new minute without
  // turning idle into a busy loop.
  protected clockTimer: ReturnType<typeof setTimeout> | null = null;
  protected toggle(): void {
    const { shortcutHelp, overlayCoordinator } = this.deps;
    if (shortcutHelp.open.value) shortcutHelp.close();
    else
      overlayCoordinator.openExclusiveOverlay('shortcutHelp', () =>
        shortcutHelp.show(),
      );
  }
  /** Local time as HH:MM (minute granularity — never seconds; a seconds clock would repaint 60×/min). */
  protected formatClock(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
  /** Schedule ONE repaint at the next minute boundary, then re-arm. The +50ms guard lands safely past
   *  the boundary; unref() so the timer never blocks process exit (the renderer owns the event loop). */
  protected scheduleClockTick(): void {
    const millisecondsToNextMinute = 60000 - (Date.now() % 60000) + 50;
    this.clockTimer = setTimeout(() => {
      this.clock.content = ` ${this.formatClock()} `;
      this.deps.renderer.requestRender();
      this.scheduleClockTick();
    }, millisecondsToNextMinute);
    (
      this.clockTimer as {
        unref?: () => void;
      }
    ).unref?.();
  }
  protected toggleSettings(): void {
    const { settingsPanel, overlayCoordinator } = this.deps;
    if (settingsPanel.open.value) settingsPanel.close();
    else
      overlayCoordinator.openExclusiveOverlay('settingsPanel', () =>
        settingsPanel.toggle(),
      );
  }
  panelControlContainsPoint(column: number, row: number): boolean {
    return (
      this.contributionButton.visible &&
      this.renderableContainsPoint(this.contributionButton, column, row)
    );
  }
  rightDockControlContainsPoint(column: number, row: number): boolean {
    return this.renderableContainsPoint(this.rightDockButton, column, row);
  }
  protected renderableContainsPoint(
    renderable: TextRenderable,
    column: number,
    row: number,
  ): boolean {
    const left = Number(renderable.x);
    const top = Number(renderable.y);
    return (
      column >= left &&
      column < left + Number(renderable.width) &&
      row >= top &&
      row < top + Number(renderable.height)
    );
  }
  protected renderStatus(focusedSurfaceTitle: string | null): string {
    return StatusBar.Class.composeStatusText(
      this.deps.statusBarSegments.segments({
        workspaceSet: this.deps.workspaceSet,
        app: this.deps.app,
        primaryDockHost: this.deps.primaryDockHost,
        focusedSurfaceTitle,
      }),
    );
  }
  /** Re-sync the bar from the model each frame. `focusedSurfaceTitle` is the mounted editor
   *  surface's own answer, which RootView reads. */
  update(palette: Palette, focusedSurfaceTitle: string | null): void {
    this.bar.backgroundColor = palette.statusBg;
    this.statusText.content = this.renderStatus(focusedSurfaceTitle);
    this.statusText.fg = palette.dim;
    // The `?` help affordance brightens on hover and while its sheet is open.
    this.shortcutHelpButton.fg =
      this.hover || this.deps.shortcutHelp.open.value
        ? palette.accent
        : palette.dim;
    const statusContext = {
      workspaceSet: this.deps.workspaceSet,
      app: this.deps.app,
      primaryDockHost: this.deps.primaryDockHost,
      focusedSurfaceTitle,
    };
    this.contributedControl =
      this.deps.statusBarSegments.controls(statusContext)[0] ?? null;
    this.contributionButton.visible = this.contributedControl !== null;
    this.contributionButton.content = this.contributedControl
      ? ` ${this.contributedControl.icon} `
      : '';
    this.contributionButton.fg =
      this.contributionHover || this.contributedControl?.active
        ? palette.accent
        : palette.dim;
    this.rightDockButton.content = ` ${this.deps.theme.rightDockIcon} `;
    this.rightDockButton.fg =
      this.rightDockHover || this.deps.rightDockHost.visible.value
        ? palette.accent
        : palette.dim;
    // The gear affordance mirrors it: current-tier glyph, brightening on hover / while settings is open.
    this.settingsButton.content = ` ${this.deps.theme.settingsIcon} `;
    this.settingsButton.fg =
      this.settingsHover || this.deps.settingsPanel.open.value
        ? palette.accent
        : palette.dim;
    // The clock (display only) refreshes on every repaint so it is correct after any wake; the
    // minute timer guarantees the wake at the boundary even while otherwise idle.
    this.clock.content = ` ${this.formatClock()} `;
    this.clock.fg = palette.dim;
  }
}

export namespace StatusBar {
  export const $Class = $StatusBar;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface StatusBarDeps {
  renderer: CliRenderer;
  workspaceSet: WorkspaceSet.Instance;
  app: App.Instance;
  shortcutHelp: ShortcutHelp.Instance;
  overlayCoordinator: OverlayCoordinator.Instance;
  keybindings: KeybindingRegistry.Instance;
  tooltip: Tooltip.Instance;
  /** For the settings and right-dock glyphs at the current glyph tier. */
  theme: Theme.Instance;
  /** The settings panel the gear button toggles (mirrors the shortcutHelp dep the `?` button uses). */
  settingsPanel: SettingsPanel.Instance;
  rightDockHost: PanelHost.Instance;
  primaryDockHost: PanelHost.Instance;
  statusBarSegments: StatusBarSegments.Model;
  toggleRightDock: () => void;
}
