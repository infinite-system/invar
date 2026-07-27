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
import type { WorkspaceContributor } from '../workspace/WorkspaceContributor.interface';
import type { StatusProjectionContributions } from './StatusProjectionContributions';
import type { Keybinding } from '../keybindings/KeybindingRegistry';
import type {
  RegisteredSetting,
  SettingContribution,
  SettingValue,
} from '../settings/SettingContribution.interface';
import type { Ref } from 'vue';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
export interface ApplicationContributor {
  readonly identifier: string;
  readonly name: string;
  readonly canDisable?: boolean;
  readonly primaryDockContentIdentifiers?: readonly string[];
  readonly primaryDockFallbackContentIdentifier?: string;
  readonly workspaceContributor?: WorkspaceContributor;
  activateApplication(context: ApplicationContributionContext): void;
  disposeApplication?(): void;
}

export interface ApplicationContributionContext {
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
  readonly applicationContributions: ApplicationContributionCatalog;
  readonly registerKeybindings: (bindings: readonly Keybinding[]) => void;
  readonly registerKeybindingGuard: (
    name: string,
    predicate: () => boolean,
  ) => void;
  readonly registerSetting: <Value extends SettingValue>(
    contribution: SettingContribution<Value>,
  ) => RegisteredSetting<Value>;
  readonly registerPrimaryDockContent: (content: PaneContent) => void;
  readonly editorInteractionIsAvailable: () => boolean;
  readonly dismissEditorSuggestions: () => void;
  readonly bindingHint: (action: string, context: string) => string;
  readonly requestRender: () => void;
}

export interface ApplicationContributionCatalog {
  readonly revision: Readonly<Ref<number>>;
  entries(): readonly ApplicationContributionEntry[];
  setEnabled(identifier: string, enabled: boolean): void;
}

export interface ApplicationContributionEntry {
  identifier: string;
  name: string;
  enabled: boolean;
  canDisable: boolean;
}
