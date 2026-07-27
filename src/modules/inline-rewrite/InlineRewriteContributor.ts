import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { Keybinding } from '../keybindings/KeybindingRegistry';
import { CodexRewriteProvider } from '../lsp/CodexRewriteProvider';
import type { RewriteProvider } from '../lsp/LanguageProvider.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { InlineRewriteWorkspace } from './InlineRewriteWorkspace';

// invariant: One contributor owns rewrites (inline-rewrite.invariants.md)
class $InlineRewriteContributor
  implements ApplicationContributor, WorkspaceContributor
{
  constructor(
    protected readonly options: InlineRewriteContributorOptions = {},
  ) {}

  readonly identifier = 'inline-rewrite';
  readonly name = 'Inline Rewrite';
  readonly workspaceContributor: WorkspaceContributor = this;
  protected readonly workspaces = new Map<
    Workspace.Model,
    InlineRewriteWorkspace.Model
  >();
  protected application: ApplicationContributionContext | null = null;
  protected enabled = false;
  protected disposeCommands: (() => void) | null = null;
  protected disposeStatusProjection: (() => void) | null = null;

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    const availabilityProbe = this.createRewriteProvider();
    const available = availabilityProbe.available;
    availabilityProbe.dispose();
    const enabledSetting = context.registerSetting({
      identifier: 'inlineRewrite.enabled',
      label: 'Enabled',
      section: this.name,
      defaultValue: available,
      spec: { kind: 'boolean' },
      changed: (enabled) => this.setEnabled(enabled),
    });
    this.enabled = enabledSetting.value.value;
    context.registerKeybindingGuard(
      'inlineRewriteVisible',
      () => this.activeController()?.visible ?? false,
    );
    context.registerKeybindings(this.keybindings());
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'inlineRewrite.request',
        title: 'Inline Rewrite: Request',
        category: this.name,
        run: () => {
          context.dismissEditorSuggestions();
          this.activeWorkspace()?.request(context.workspaceSet.active.editor);
        },
      },
      {
        id: 'inlineRewrite.accept',
        title: 'Inline Rewrite: Accept',
        category: this.name,
        run: () =>
          this.activeWorkspace()?.accept(context.workspaceSet.active.editor),
      },
      {
        id: 'inlineRewrite.reject',
        title: 'Inline Rewrite: Reject',
        category: this.name,
        run: () =>
          this.activeWorkspace()?.reject(context.workspaceSet.active.editor),
      },
      {
        id: 'inlineRewrite.next',
        title: 'Inline Rewrite: Next Candidate',
        category: this.name,
        run: () =>
          this.activeWorkspace()?.cycle(context.workspaceSet.active.editor, 1),
      },
      {
        id: 'inlineRewrite.previous',
        title: 'Inline Rewrite: Previous Candidate',
        category: this.name,
        run: () =>
          this.activeWorkspace()?.cycle(context.workspaceSet.active.editor, -1),
      },
    ]);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
  }

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    if (!this.application) {
      throw new Error('Inline rewrite application contribution is not active');
    }
    const context = this.application;
    const contribution = new InlineRewriteWorkspace.Class(workspace, {
      enabled: this.enabled,
      createProvider: () => this.createRewriteProvider(),
      eligible: () => context.editorInteractionIsAvailable(),
      palette: () => context.theme.palette,
      bindingHint: (action, keybindingContext) =>
        context.bindingHint(action, keybindingContext),
      disposed: () => this.workspaces.delete(workspace),
    });
    this.workspaces.set(workspace, contribution);
    return contribution;
  }

  disposeApplication(): void {
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.application = null;
    this.workspaces.clear();
    this.enabled = false;
  }

  protected createRewriteProvider(): RewriteProvider {
    return (
      this.options.createRewriteProvider?.() ?? new CodexRewriteProvider.Class()
    );
  }

  protected setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    for (const workspace of this.workspaces.values()) {
      workspace.setEnabled(enabled);
    }
  }

  protected activeWorkspace(): InlineRewriteWorkspace.Model | null {
    const context = this.application;
    if (!context) return null;
    return this.workspaces.get(context.workspaceSet.active) ?? null;
  }

  protected activeController() {
    const context = this.application;
    if (!context) return null;
    return (
      this.activeWorkspace()?.controllerFor(
        context.workspaceSet.active.editor,
      ) ?? null
    );
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const controller = this.activeController();
    return {
      inlineRewriteEnabled: this.enabled,
      inlineRewriteVisible: controller?.visible ?? false,
      inlineRewriteRequestInFlight: controller?.requestInFlight.value ?? false,
      inlineRewriteRequestCount: controller?.requestCount.value ?? 0,
      inlineRewriteErrorCount: controller?.errorCount.value ?? 0,
      inlineRewriteCandidateCount: controller?.candidates.value.length ?? 0,
      inlineRewriteSelectedCandidate:
        controller?.selectedCandidateIndex.value ?? 0,
      inlineRewriteRationale: controller?.selectedCandidate?.rationale ?? '',
    };
  }

  protected keybindings(): Keybinding[] {
    return [
      {
        chord: { key: 'r', ctrl: true, shift: true },
        action: 'inlineRewrite.request',
        context: 'editor',
      },
      {
        chord: { key: 'right', ctrl: true, alt: true },
        action: 'inlineRewrite.accept',
        context: 'editor',
      },
      {
        chord: { key: 'escape' },
        action: 'inlineRewrite.reject',
        context: 'editor',
        when: 'inlineRewriteVisible',
      },
      {
        chord: { key: 'down', ctrl: true, alt: true },
        action: 'inlineRewrite.next',
        context: 'editor',
      },
      {
        chord: { key: 'up', ctrl: true, alt: true },
        action: 'inlineRewrite.previous',
        context: 'editor',
      },
    ];
  }
}

export namespace InlineRewriteContributor {
  export const $Class = $InlineRewriteContributor;
  export let Class = $InlineRewriteContributor;
  export type Instance = InstanceType<typeof $InlineRewriteContributor>;
}

export interface InlineRewriteContributorOptions {
  createRewriteProvider?: () => RewriteProvider;
}
