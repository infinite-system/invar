import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { MarkdownPreviewSurface } from './MarkdownPreviewSurface';
import { MarkdownWorkspace } from './MarkdownWorkspace';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';

// Markdown as a default-composed plugin. It owns the per-tab preview mode, the split that occupies
// the editor column, its two commands, its chord-reachable affordance in the editor title row, and
// its own status projection. The host keeps only `resolveFileReference` — which is generic path
// confinement inside the workspace root, with no markdown in it.
//
// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
class $MarkdownPlugin implements ApplicationContributor, WorkspaceContributor {
  readonly identifier = 'markdown';
  readonly name = 'Markdown';
  readonly workspaceContributor: WorkspaceContributor = this;
  protected readonly workspaces = new WeakMap<
    Workspace.Model,
    MarkdownWorkspace.Model
  >();
  protected application: ApplicationContributionContext | null = null;
  protected surface: MarkdownPreviewSurface.Model | null = null;
  protected disposeSurface: (() => void) | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected disposeStatusBar: (() => void) | null = null;
  protected splitRatioSetting: RegisteredSetting<number> | null = null;
  protected previewSideSetting: RegisteredSetting<string> | null = null;

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const markdownWorkspace = new MarkdownWorkspace.Class(
      workspace,
      () => this.surface?.previewContent?.previewFocused ?? false,
      (lineIndex) =>
        this.surface?.previewContent?.splitView.revealSourceLine(lineIndex),
    );
    this.workspaces.set(workspace, markdownWorkspace);
    return markdownWorkspace;
  }

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    this.splitRatioSetting = context.registerSetting({
      identifier: 'markdownSplitRatio',
      label: 'Source/preview split',
      section: this.name,
      defaultValue: 0.5,
      spec: {
        kind: 'number',
        step: 0.05,
        minimum: 0.2,
        maximum: 0.8,
        decimals: 2,
      },
    });
    // invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
    this.previewSideSetting = context.registerSetting({
      identifier: 'markdownPreviewSide',
      label: 'Preview side',
      section: this.name,
      defaultValue: 'left',
      spec: { kind: 'enum', options: ['left', 'right'] },
    });
    context.registerKeybindings([
      {
        chord: { key: 'v', ctrl: true, shift: true },
        action: 'markdown.togglePreview',
        context: 'editor',
      },
      {
        chord: { key: 'return', ctrl: true },
        action: 'markdown.openHoveredReference',
        context: 'editor',
      },
    ]);
    this.surface = new MarkdownPreviewSurface.Class(
      () => this.workspaces.get(context.workspaceSet.active) ?? null,
      this.splitRatioSetting,
      this.previewSideSetting,
    );
    this.disposeSurface = context.editorSurfaceContents.register(this.surface);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
    // invariant: An unresolvable Markdown link states why (src/modules/markdown/markdown.invariants.md)
    this.disposeStatusBar = context.statusBarSegments.register(this);
    this.registerCommands(context);
  }

  /** The plugin's own status-bar contribution: the stated outcome of the last unresolvable-link
   *  activation, while one is owed. */
  segments(): readonly string[] {
    const notice =
      this.surface?.previewContent?.splitView.linkNotice.value ?? null;
    return notice === null ? [] : [notice];
  }

  disposeApplication(): void {
    this.disposeSurface?.();
    this.disposeSurface = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.disposeStatusBar?.();
    this.disposeStatusBar = null;
    this.surface = null;
    this.splitRatioSetting = null;
    this.previewSideSetting = null;
    this.application = null;
  }

  controllerFor(workspace: Workspace.Model): MarkdownWorkspace.Model {
    const controller = this.workspaces.get(workspace);
    if (!controller) {
      throw new Error('Markdown workspace contribution is not attached');
    }
    return controller;
  }

  protected activeWorkspace(): MarkdownWorkspace.Model {
    const application = this.application;
    if (!application) {
      throw new Error('Markdown application contribution is not active');
    }
    return this.controllerFor(application.workspaceSet.active);
  }

  protected registerCommands(context: ApplicationContributionContext): void {
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'markdown.togglePreview',
        title: 'Markdown: Toggle Preview',
        category: 'Markdown',
        // The tab strip's action cluster renders exactly this: an icon-bearing command whose guard
        // holds. No host file names markdown to draw it.
        editorTitleIcon: 'preview',
        when: () => this.activeWorkspace().previewToggleAvailable,
        toggled: () => this.activeWorkspace().showingPreview,
        run: () => this.activeWorkspace().togglePreview(),
      },
      {
        id: 'markdown.openHoveredReference',
        title: 'Markdown: Open Hovered Reference',
        category: 'Markdown',
        when: () =>
          Boolean(
            this.surface?.previewContent?.splitView.hoveredReferencePath.value,
          ),
        run: () =>
          this.surface?.previewContent?.splitView.openHoveredReference(),
      },
    ]);
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const application = this.application;
    if (!application) return {};
    const markdownWorkspace = this.activeWorkspace();
    const previewContent = this.surface?.previewContent ?? null;
    const splitView = previewContent?.splitView ?? null;
    return {
      markdownPreviewOpen: markdownWorkspace.showingPreview,
      markdownPaneFocus: splitView?.focusedPane.value ?? 'source',
      markdownSplitRatio: this.splitRatioSetting?.value.value ?? 0.5,
      markdownPreviewSide: this.surface?.previewSide() ?? 'left',
      markdownPreviewScrollTop: splitView?.preview.scrollTop.value ?? 0,
      markdownPreviewSelectionChars: splitView?.selectionCharacterCount() ?? 0,
      markdownHoveredReference: splitView?.hoveredReferencePath.value ?? null,
      markdownLinkNotice: splitView?.linkNotice.value ?? null,
      markdownPreviewFindQuery: previewContent?.previewFindQuery() ?? '',
    };
  }
}

export namespace MarkdownPlugin {
  export const $Class = $MarkdownPlugin;
  export let Class = $MarkdownPlugin;
  export type Model = InstanceType<typeof Class>;
}
