import type { CliRenderer } from '@opentui/core';
import type { CommandRegistry } from '../commands/CommandRegistry';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import type { BoundedListPopup } from '../ui/BoundedListPopup';
import type { ContextMenu } from '../ui/ContextMenu';
import type { OverlayCoordinator } from '../ui/OverlayCoordinator';
import type { PanelHost } from '../ui/PanelHost';
import type { PaneContent } from '../ui/PaneContent.interface';
import type { EditorSurfaceContents } from '../ui/EditorSurfaceContents';
import type { StatusBarSegments } from '../ui/StatusBarSegments';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { WorkspacePlugin } from '../workspace/WorkspacePlugin.interface';
import type { StatusProjectionContributions } from './StatusProjectionContributions';

export interface ApplicationPlugin extends WorkspacePlugin {
  readonly primaryDockContentIdentifiers?: readonly string[];
  activateApplication(context: ApplicationPluginContext): void;
  disposeApplication?(): void;
}

export interface ApplicationPluginContext {
  readonly renderer: CliRenderer;
  readonly workspaceSet: WorkspaceSet.Instance;
  readonly settings: Settings.Instance;
  readonly theme: Theme.Instance;
  readonly commands: CommandRegistry.Instance;
  readonly primaryDockHost: PanelHost.Instance;
  readonly contextMenu: ContextMenu.Instance;
  readonly boundedListPopup: BoundedListPopup.Instance;
  readonly overlayCoordinator: OverlayCoordinator.Instance;
  readonly statusBarSegments: StatusBarSegments.Model;
  readonly statusProjectionContributions: StatusProjectionContributions.Model;
  /** Register an occupant of the editor column (a comparison, a rendered preview). */
  readonly editorSurfaceContents: EditorSurfaceContents.Model;
  readonly registerPrimaryDockContent: (content: PaneContent) => void;
  readonly requestRender: () => void;
}
