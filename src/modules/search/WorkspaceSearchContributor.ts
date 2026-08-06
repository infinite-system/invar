import { Static } from 'ivue/extras';
import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import { KeybindingDefaults } from '../keybindings/KeybindingDefaults';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { WorkspaceSearchPaneContent } from './WorkspaceSearchPaneContent';

// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
class $WorkspaceSearchContributor
  implements ApplicationContributor, WorkspaceContributor
{
  static activityOrderWithSearchSlot(identifiers: readonly string[]): string[] {
    if (identifiers.includes('search')) return [...identifiers];
    const fileTreeIndex = identifiers.indexOf('files');
    if (fileTreeIndex < 0) return [...identifiers];
    return [
      ...identifiers.slice(0, fileTreeIndex + 1),
      'search',
      ...identifiers.slice(fileTreeIndex + 1),
    ];
  }

  readonly identifier = 'workspace-search';
  readonly name = 'Search';
  readonly primaryDockContentIdentifiers = ['search'] as const;
  readonly workspaceContributor: WorkspaceContributor = this;
  protected application: ApplicationContributionContext | null = null;
  protected paneContent: WorkspaceSearchPaneContent.Model | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected disposeStatusProjection: (() => void) | null = null;

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    return {
      opened: () => {},
      suspended: () => workspace.workspaceSearch.cancel(),
      resumed: () => {},
      disposed: () => workspace.workspaceSearch.cancel(),
    };
  }

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    const currentActivityOrder = context.settings.primaryDockContentOrder.value;
    const migratedActivityOrder = (
      this.constructor as typeof $WorkspaceSearchContributor
    ).activityOrderWithSearchSlot(currentActivityOrder);
    if (
      migratedActivityOrder.some(
        (identifier, index) => identifier !== currentActivityOrder[index],
      )
    ) {
      context.settings.set('primaryDockContentOrder', migratedActivityOrder);
    }
    this.paneContent = this.createPaneContent(context);
    context.registerPrimaryDockContent(this.paneContent);
    context.registerKeybindings([
      {
        chord: { key: 'f', ctrl: true, shift: true },
        action: 'view.showSearch',
        applicationGlobal: true,
      },
      {
        chord: { key: 'r', ctrl: true, shift: true },
        action: 'workspaceSearch.focusReplacement',
        applicationGlobal: true,
      },
      {
        chord: { key: 'tab', shift: false },
        action: 'workspaceSearch.focusNext',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'tab', shift: true },
        action: 'workspaceSearch.focusPrevious',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'return' },
        action: 'workspaceSearch.submit',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'up' },
        action: 'workspaceSearch.previousResult',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'down' },
        action: 'workspaceSearch.nextResult',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'pageup' },
        action: 'workspaceSearch.pageUp',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'pagedown' },
        action: 'workspaceSearch.pageDown',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'c', alt: true },
        action: 'workspaceSearch.toggleCase',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'w', alt: true },
        action: 'workspaceSearch.toggleWholeWord',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'r', alt: true },
        action: 'workspaceSearch.toggleRegex',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'i', alt: true },
        action: 'workspaceSearch.toggleIgnoreFiles',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'd', alt: true },
        action: 'workspaceSearch.dismissMatch',
        context: 'workspaceSearch',
      },
      {
        chord: { key: 'escape' },
        action: 'workspaceSearch.cancel',
        context: 'workspaceSearch',
      },
      ...KeybindingDefaults.Class.textInputBindings('workspaceSearch', {
        hostOwnedPlainKeys: ['up', 'down', 'pageup', 'pagedown'],
      }),
    ]);
    this.registerCommands(context);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
  }

  protected createPaneContent(
    context: ApplicationContributionContext,
  ): WorkspaceSearchPaneContent.Model {
    return new WorkspaceSearchPaneContent.Class(
      context,
      () => context.workspaceSet.active,
    );
  }

  protected registerCommands(context: ApplicationContributionContext): void {
    const pane = (): WorkspaceSearchPaneContent.Model => {
      if (!this.paneContent) {
        throw new Error('Workspace Search pane is not active');
      }
      return this.paneContent;
    };
    const show = (field: 'query' | 'replacement'): void => {
      context.primaryDockHost.showContent('search');
      context.workspaceSet.active.focusPrimaryPane('search');
      pane().focusField(field);
    };
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'view.showSearch',
        title: 'View: Show Search',
        category: 'View',
        run: () => show('query'),
      },
      {
        id: 'workspaceSearch.focusQuery',
        title: 'Search: Focus Query',
        category: 'Search',
        run: () => show('query'),
      },
      {
        id: 'workspaceSearch.focusReplacement',
        title: 'Search: Focus Replacement',
        category: 'Search',
        run: () => show('replacement'),
      },
      {
        id: 'workspaceSearch.focusNext',
        title: 'Search: Focus Next Control',
        category: 'Search',
        run: () => pane().focusNext(1),
      },
      {
        id: 'workspaceSearch.focusPrevious',
        title: 'Search: Focus Previous Control',
        category: 'Search',
        run: () => pane().focusNext(-1),
      },
      {
        id: 'workspaceSearch.submit',
        title: 'Search: Search or Open Result',
        category: 'Search',
        run: () => pane().submit(),
      },
      {
        id: 'workspaceSearch.previousResult',
        title: 'Search: Previous Result Row',
        category: 'Search',
        run: () => pane().moveResultSelection(-1),
      },
      {
        id: 'workspaceSearch.nextResult',
        title: 'Search: Next Result Row',
        category: 'Search',
        run: () => pane().moveResultSelection(1),
      },
      {
        id: 'workspaceSearch.pageUp',
        title: 'Search: Scroll Results Up One Page',
        category: 'Search',
        run: () =>
          pane().scrollResultsBy(
            -Math.max(
              1,
              context.workspaceSet.active.workspaceSearch.resultTree
                .viewportHeight.value - 1,
            ),
          ),
      },
      {
        id: 'workspaceSearch.pageDown',
        title: 'Search: Scroll Results Down One Page',
        category: 'Search',
        run: () =>
          pane().scrollResultsBy(
            Math.max(
              1,
              context.workspaceSet.active.workspaceSearch.resultTree
                .viewportHeight.value - 1,
            ),
          ),
      },
      {
        id: 'workspaceSearch.toggleCase',
        title: 'Search: Toggle Match Case',
        category: 'Search',
        run: () => pane().toggleCase(),
      },
      {
        id: 'workspaceSearch.toggleWholeWord',
        title: 'Search: Toggle Whole Word',
        category: 'Search',
        run: () => pane().toggleWholeWord(),
      },
      {
        id: 'workspaceSearch.toggleRegex',
        title: 'Search: Toggle Regular Expression',
        category: 'Search',
        run: () => pane().toggleRegex(),
      },
      {
        id: 'workspaceSearch.toggleIgnoreFiles',
        title: 'Search: Toggle Ignore Files',
        category: 'Search',
        run: () => pane().toggleIgnoreFiles(),
      },
      {
        id: 'workspaceSearch.dismissMatch',
        title: 'Search: Dismiss Selected Match',
        category: 'Search',
        run: () => pane().dismissSelectedMatch(),
      },
      {
        id: 'workspaceSearch.cancel',
        title: 'Search: Cancel Current Search',
        category: 'Search',
        run: () => pane().cancelSearch(),
      },
    ]);
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const application = this.application;
    if (!application) return {};
    const search = application.workspaceSet.active.workspaceSearch;
    return {
      workspaceSearchFlowState: search.flowState.value,
      workspaceSearchQueryGeneration: search.queryGeneration.value,
      workspaceSearchResultCount: search.resultCount,
      workspaceSearchSelectedCount: search.resultTree.selectedCount,
      workspaceSearchFileCount: search.fileCount.value,
      workspaceSearchSelectedRow: search.resultTree.selectedIndex.value,
      workspaceSearchScrollTop: search.resultTree.scrollTop.value,
      workspaceSearchActiveField: this.paneContent?.activeFocus.value ?? null,
      workspaceSearchSelectionChars:
        this.paneContent?.selectionTelemetry().characterLength ?? 0,
      workspaceSearchErrorMessage: search.errorMessage.value,
    };
  }

  disposeApplication(): void {
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.paneContent = null;
    this.application = null;
  }
}

export namespace WorkspaceSearchContributor {
  export const $Class = Static($WorkspaceSearchContributor);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
