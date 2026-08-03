import type { CliRenderer } from '@opentui/core';
import type { CommandRegistry } from '../commands/CommandRegistry';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import type { BoundedListPopup } from '../ui/BoundedListPopup';
import type { ContextMenu } from '../ui/ContextMenu';
import type { OverlayCoordinator } from '../ui/OverlayCoordinator';
import type { PanelHost } from '../ui/PanelHost';
import type { PaneContent } from '../ui/PaneContent.interface';
import type { PanelContentFactory } from '../ui/PanelContentFactory.interface';
import type {
  PaneRuntime,
  PaneRuntimeHostPort,
  PaneRuntimeRequest,
} from '../ui/PaneRuntime.interface';
import type { EditorSurfaceContents } from '../ui/EditorSurfaceContents';
import type {
  EditorColumnDefaultHostPort,
  EditorColumnDefaultProvider,
} from '../ui/EditorColumnDefault';
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
import type { FindBarTarget } from '../search/FindBar';
import type { FindBar } from '../search/FindBar';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
export interface ApplicationContributor {
  readonly identifier: string;
  readonly name: string;
  readonly canDisable?: boolean;
  readonly vendorMetadata?: VendorContributionMetadata;
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
  /** The empty-by-default dock at the editor's right edge — same generic host as the primary dock. */
  readonly rightDockHost: PanelHost.Instance;
  readonly contextMenu: ContextMenu.Instance;
  readonly boundedListPopup: BoundedListPopup.Instance;
  readonly findBar: FindBar.Instance;
  readonly overlayCoordinator: OverlayCoordinator.Instance;
  readonly statusBarSegments: StatusBarSegments.Model;
  readonly statusProjectionContributions: StatusProjectionContributions.Model;
  /** Register an occupant of the editor column (a comparison, a rendered preview). */
  readonly editorSurfaceContents: EditorSurfaceContents.Model;
  /** Register the editor column's DEFAULT occupant — what sits there when nothing claims it. The
   *  host owns the slot only; the content, and its release, belong to the contribution. */
  readonly registerEditorColumnDefault: (
    provider: EditorColumnDefaultProvider,
  ) => EditorColumnDefaultHostPort;
  readonly applicationContributions: ApplicationContributionCatalog;
  readonly registerKeybindings: (bindings: readonly Keybinding[]) => void;
  readonly registerKeybindingGuard: (
    name: string,
    predicate: () => boolean,
  ) => void;
  readonly registerSetting: <Value extends SettingValue>(
    contribution: SettingContribution<Value>,
  ) => RegisteredSetting<Value>;
  readonly registerDockContent: (
    contribution: DockContentContribution,
  ) => RegisteredDockContent;
  readonly registerPrimaryDockContent: (content: PaneContent) => void;
  readonly registerRightDockContent: (content: PaneContent) => void;
  /** Register a non-runtime bottom-panel pane factory without creating a pane. */
  readonly registerPanelContentFactory: (factory: PanelContentFactory) => void;
  readonly bottomPanelHost: PanelHost.Instance;
  /** Open one non-runtime bottom-panel pane through its contributed factory. */
  readonly openPanelContent: (kind: string) => boolean;
  /** Register a RUNTIME: the owner of one bottom-panel pane kind and the processes behind it. The
   *  host answers only which of that kind is visible; everything else stays inside the runtime. */
  readonly registerPaneRuntime: (runtime: PaneRuntime) => PaneRuntimeHostPort;
  /** Open one process-backed pane through a contributed runtime. The consumer declares the
   *  process; the host supplies projection and focus; only the runtime owns the process. */
  readonly openRuntimePane: (
    runtimeKind: string,
    request: PaneRuntimeRequest,
  ) => boolean;
  readonly currentPaneOfKind: (kind: string) => PaneContent | null;
  readonly ensureRuntimePane: (kind: string) => PaneContent | null;
  readonly openFindTarget: (target: FindBarTarget) => void;
  readonly focusedPanelCaretAnchor: () => {
    column: number;
    row: number;
  } | null;
  readonly editorInteractionIsAvailable: () => boolean;
  readonly dismissEditorSuggestions: () => void;
  readonly bindingHint: (action: string, context: string) => string;
  readonly requestRender: () => void;
  readonly restartApplication: () => void;
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
  version?: string;
  provenance?: VendorProvenance;
  kernelOverrides?: readonly string[];
  failure?: string;
}

export type VendorProvenance =
  'built-in' | 'network-gated' | 'developer-linked';

export interface VendorContributionMetadata {
  readonly version: string;
  readonly provenance: VendorProvenance;
  readonly kernelOverrides: readonly string[];
}

export type DockSide = 'left' | 'right';

export interface DockContentContribution {
  content: PaneContent;
  settingIdentifier: string;
  settingLabel: string;
  section: string;
  suggestedSide: DockSide;
}

export interface RegisteredDockContent extends RegisteredSetting<DockSide> {
  host(): PanelHost.Instance;
  /** True only when the side-dock painter projects this exact content. */
  isPainted(): boolean;
  reveal(): void;
  show(): void;
  blur(): void;
}
