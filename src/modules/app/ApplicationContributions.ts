import { Reactive } from 'ivue';
import { ref } from 'vue';
import { RenderLoadLedger } from '../system/RenderLoadLedger';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type { Settings } from '../settings/Settings';
import type { PaneContent } from '../ui/PaneContent.interface';
import type { PaneRuntimes } from '../ui/PaneRuntimes';
import type { PanelContentFactories } from '../ui/PanelContentFactories';
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
// invariant: The composition graph reaches every installed contributor (src/modules/system/system.invariants.md)
class $ApplicationContributions implements ApplicationContributionCatalog {
  protected readonly activeContributions = new Map<
    string,
    ActiveContribution
  >();
  protected readonly failures = new Map<string, string>();

  constructor(
    protected readonly orderedContributors: readonly ApplicationContributor[],
    protected readonly options: ApplicationContributionsOptions,
  ) {}

  get revision() {
    return ref(0);
  }

  /** Every installed contributor, keyed by its own stable identity. */
  get contributors(): Readonly<Record<string, ApplicationContributor>> {
    return Object.fromEntries(
      this.orderedContributors.map((contributor) => [
        contributor.identifier,
        contributor,
      ]),
    );
  }

  entries(): readonly ApplicationContributionEntry[] {
    void this.revision.value;
    return this.orderedContributors.map((contributor) => ({
      identifier: contributor.identifier,
      name: contributor.name,
      enabled: this.activeContributions.has(contributor.identifier),
      canDisable: contributor.canDisable !== false,
      version: contributor.vendorMetadata?.version,
      provenance: contributor.vendorMetadata?.provenance,
      kernelOverrides: contributor.vendorMetadata?.kernelOverrides,
      failure: this.failures.get(contributor.identifier),
    }));
  }

  activateAll(): void {
    for (const contributor of this.orderedContributors) {
      try {
        this.activate(contributor);
      } catch (error) {
        this.failures.set(contributor.identifier, String(error));
        this.revision.value += 1;
      }
    }
  }

  setEnabled(identifier: string, enabled: boolean): void {
    const contributor = this.orderedContributors.find(
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
      // Every render request a contributor raises crosses THIS closure, so the host attributes it
      // here — one counter at the boundary, never a second render model inside the plugin.
      // invariant: Render load is attributed at the contribution boundary (src/modules/app/app.invariants.md)
      requestRender: RenderLoadLedger.Class.attribute(
        contributor.identifier,
        this.options.requestRender,
      ),
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
          this.options.keybindings.registerGuard(
            this.vendorIdentifier(contributor, name, '.'),
            predicate,
          ),
        );
      },
      registerSetting: (contribution) => {
        // invariant: Plugin settings live in contributed schema (src/modules/settings/settings.invariants.md)
        const registeredSetting = this.options.settings.registerSetting({
          ...contribution,
          identifier: this.vendorIdentifier(
            contributor,
            contribution.identifier,
            '.',
          ),
        });
        registrationDisposers.push(() => registeredSetting.dispose());
        return registeredSetting;
      },
      // invariant: A contributed dock side moves one live pane (src/modules/ui/ui.invariants.md)
      registerDockContent: (contribution) => {
        let activeHost: PanelHost.Instance;
        const registeredSetting = this.options.settings.registerSetting({
          identifier: this.vendorIdentifier(
            contributor,
            contribution.settingIdentifier,
            '.',
          ),
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
          isPainted: () =>
            activeHost.visible.value &&
            activeHost.activeContent?.id === contribution.content.id,
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
      registerPanelContentFactory: (factory) => {
        const unregisterFactory =
          this.options.panelContentFactories.register(factory);
        registrationDisposers.push(() => {
          this.options.bottomPanelHost.removeContentsOfKindFromEverySet(
            factory.kind,
          );
          unregisterFactory();
        });
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
          currentPane: () => this.options.currentPaneOfKind(runtime.kind),
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
      this.failures.delete(contributor.identifier);
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

  protected vendorIdentifier(
    contributor: ApplicationContributor,
    localIdentifier: string,
    separator: string,
  ): string {
    if (!contributor.vendorMetadata) return localIdentifier;
    if (localIdentifier.startsWith(`${contributor.identifier}${separator}`)) {
      return localIdentifier;
    }
    return `${contributor.identifier}${separator}${localIdentifier}`;
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
    for (const contributor of [...this.orderedContributors].reverse()) {
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
  | 'registerPanelContentFactory'
  | 'registerPaneRuntime'
  | 'registerEditorColumnDefault'
> & {
  keybindings: KeybindingRegistry.Instance;
  settings: Settings.Instance;
  /** The host's registry for the editor column's default occupant. */
  editorColumnDefault: EditorColumnDefault.Model;
  /** The host's registry of contributed pane runtimes. */
  paneRuntimes: PaneRuntimes.Model;
  /** The host's registry of contributed non-runtime pane factories. */
  panelContentFactories: PanelContentFactories.Model;
  /** The active workspace's current pane for a kind, whether its projection is visible or hidden. */
  currentPaneOfKind: (kind: string) => PaneContent | null;
  /** Take a runtime-owned pane out of the panel, so uninstall leaves no orphan behind. */
  releasePane: (identifier: string) => void;
};

interface ActiveContribution {
  contributor: ApplicationContributor;
  registrationDisposers: (() => void)[];
  disposeWorkspaceContribution: (() => void) | null;
}
