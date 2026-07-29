import { Reactive } from 'ivue';
import { ref } from 'vue';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type { Settings } from '../settings/Settings';
import type { PaneContent } from '../ui/PaneContent.interface';
import type { PaneRuntimes } from '../ui/PaneRuntimes';
import type { PanelHost } from '../ui/PanelHost';
import type { EditorColumnDefault } from '../ui/EditorColumnDefault';
import type {
  ApplicationContributionCatalog,
  ApplicationContributionContext,
  ApplicationContributionEntry,
  ApplicationContributor,
  DockSide,
} from './ApplicationContributor.interface';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
class $ApplicationContributions implements ApplicationContributionCatalog {
  protected readonly activeContributions = new Map<
    string,
    ActiveContribution
  >();

  constructor(
    protected readonly contributors: readonly ApplicationContributor[],
    protected readonly options: ApplicationContributionsOptions,
  ) {}

  get revision() {
    return ref(0);
  }

  entries(): readonly ApplicationContributionEntry[] {
    void this.revision.value;
    return this.contributors.map((contributor) => ({
      identifier: contributor.identifier,
      name: contributor.name,
      enabled: this.activeContributions.has(contributor.identifier),
      canDisable: contributor.canDisable !== false,
    }));
  }

  activateAll(): void {
    for (const contributor of this.contributors) {
      this.activate(contributor);
    }
  }

  setEnabled(identifier: string, enabled: boolean): void {
    const contributor = this.contributors.find(
      (candidate) => candidate.identifier === identifier,
    );
    if (!contributor) return;
    if (!enabled && contributor.canDisable === false) return;
    if (enabled) this.activate(contributor);
    else this.deactivate(contributor);
    this.options.requestRender();
  }

  protected activate(contributor: ApplicationContributor): void {
    if (this.activeContributions.has(contributor.identifier)) return;
    const registrationDisposers: (() => void)[] = [];
    const context: ApplicationContributionContext = {
      ...this.options,
      applicationContributions: this,
      registerKeybindings: (bindings) => {
        registrationDisposers.push(
          this.options.keybindings.registerPluginLayer(
            `plugin:${contributor.identifier}`,
            bindings,
          ),
        );
      },
      registerKeybindingGuard: (name, predicate) => {
        registrationDisposers.push(
          this.options.keybindings.registerGuard(name, predicate),
        );
      },
      registerSetting: (contribution) => {
        const registeredSetting =
          this.options.settings.registerSetting(contribution);
        registrationDisposers.push(() => registeredSetting.dispose());
        return registeredSetting;
      },
      // invariant: A contributed dock side moves one live pane (src/modules/ui/ui.invariants.md)
      registerDockContent: (contribution) => {
        let activeHost: PanelHost.Instance;
        const registeredSetting = this.options.settings.registerSetting({
          identifier: contribution.settingIdentifier,
          label: contribution.settingLabel,
          section: contribution.section,
          defaultValue: contribution.suggestedSide,
          spec: { kind: 'enum', options: ['left', 'right'] },
          changed: (side) => {
            const nextHost = this.dockHost(side);
            if (nextHost === activeHost) return;
            if (
              !activeHost.moveContentToHost(contribution.content.id, nextHost)
            ) {
              return;
            }
            activeHost = nextHost;
            this.options.requestRender();
          },
        });
        registrationDisposers.push(() => registeredSetting.dispose());
        activeHost = this.dockHost(registeredSetting.value.value);
        activeHost.register(contribution.content);
        registrationDisposers.push(() =>
          activeHost.removeContent(contribution.content.id),
        );
        return {
          ...registeredSetting,
          host: () => activeHost,
          isVisible: () => activeHost.isContentVisible(contribution.content.id),
          reveal: () => activeHost.revealContent(contribution.content.id),
          show: () => activeHost.showContent(contribution.content.id),
          blur: () => activeHost.blur(),
        };
      },
      registerPrimaryDockContent: (content) => {
        this.options.primaryDockHost.register(content);
        registrationDisposers.push(() =>
          this.options.primaryDockHost.removeContent(content.id),
        );
      },
      registerRightDockContent: (content) => {
        this.options.rightDockHost.register(content);
        registrationDisposers.push(() =>
          this.options.rightDockHost.removeContent(content.id),
        );
      },
      registerEditorColumnDefault: (provider) => {
        const port = this.options.editorColumnDefault.register(provider);
        // Withdrawal is the disposer's job; RELEASE is the contribution's own, so a contributor
        // that forgets it leaves a visible leak instead of a silently-cleaned one.
        registrationDisposers.push(() => port.dispose());
        return port;
      },
      registerPaneRuntime: (runtime) => {
        const unregister = this.options.paneRuntimes.register(runtime);
        registrationDisposers.push(unregister);
        return {
          visiblePane: () => this.options.visiblePaneOfKind(runtime.kind),
          releasePane: (identifier) => this.options.releasePane(identifier),
          dispose: unregister,
        };
      },
    };
    try {
      contributor.activateApplication(context);
      const disposeWorkspaceContribution = contributor.workspaceContributor
        ? this.options.workspaceSet.registerContributor(
            contributor.workspaceContributor,
          )
        : null;
      this.activeContributions.set(contributor.identifier, {
        contributor,
        registrationDisposers,
        disposeWorkspaceContribution,
      });
      this.revision.value += 1;
    } catch (error) {
      contributor.disposeApplication?.();
      for (
        let disposerIndex = registrationDisposers.length - 1;
        disposerIndex >= 0;
        disposerIndex--
      ) {
        registrationDisposers[disposerIndex]?.();
      }
      throw error;
    }
  }

  protected dockHost(side: DockSide): PanelHost.Instance {
    return side === 'left'
      ? this.options.primaryDockHost
      : this.options.rightDockHost;
  }

  protected deactivate(contributor: ApplicationContributor): void {
    const active = this.activeContributions.get(contributor.identifier);
    if (!active) return;
    active.disposeWorkspaceContribution?.();
    contributor.disposeApplication?.();
    for (
      let disposerIndex = active.registrationDisposers.length - 1;
      disposerIndex >= 0;
      disposerIndex--
    ) {
      active.registrationDisposers[disposerIndex]?.();
    }
    this.activeContributions.delete(contributor.identifier);
    this.revision.value += 1;
  }

  dispose(): void {
    for (const contributor of [...this.contributors].reverse()) {
      this.deactivate(contributor);
    }
  }
}

export namespace ApplicationContributions {
  export const $Class = $ApplicationContributions;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export type ApplicationContributionsOptions = Omit<
  ApplicationContributionContext,
  | 'applicationContributions'
  | 'registerKeybindings'
  | 'registerKeybindingGuard'
  | 'registerSetting'
  | 'registerDockContent'
  | 'registerPrimaryDockContent'
  | 'registerRightDockContent'
  | 'registerPaneRuntime'
  | 'registerEditorColumnDefault'
> & {
  keybindings: KeybindingRegistry.Instance;
  settings: Settings.Instance;
  /** The host's registry for the editor column's default occupant. */
  editorColumnDefault: EditorColumnDefault.Model;
  /** The host's registry of contributed pane runtimes. */
  paneRuntimes: PaneRuntimes.Model;
  /** The one panel question a runtime cannot answer for itself. */
  visiblePaneOfKind: (kind: string) => PaneContent | null;
  /** Take a runtime-owned pane out of the panel, so uninstall leaves no orphan behind. */
  releasePane: (identifier: string) => void;
};

interface ActiveContribution {
  contributor: ApplicationContributor;
  registrationDisposers: (() => void)[];
  disposeWorkspaceContribution: (() => void) | null;
}
