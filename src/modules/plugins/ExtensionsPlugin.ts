import type {
  ApplicationPlugin,
  ApplicationPluginContext,
} from '../app/ApplicationPlugin.interface';
import type { Workspace } from '../workspace/Workspace';
import type { WorkspaceContribution } from '../workspace/WorkspacePlugin.interface';
import { ExtensionsPaneContent } from './ExtensionsPaneContent';

class $ExtensionsPlugin implements ApplicationPlugin {
  readonly primaryDockContentIdentifiers = ['extensions'] as const;

  attachWorkspace(_workspace: Workspace.Model): WorkspaceContribution {
    return {
      opened: () => {},
      suspended: () => {},
      resumed: () => {},
      disposed: () => {},
    };
  }

  activateApplication(context: ApplicationPluginContext): void {
    context.registerPrimaryDockContent(
      new ExtensionsPaneContent.Class(() =>
        context.theme.glyph('activityExtensions'),
      ),
    );
    context.commands.register({
      id: 'view.showExtensions',
      title: 'View: Show Extensions',
      category: 'View',
      run: () => {
        context.primaryDockHost.showContent('extensions');
        context.workspaceSet.active.focusPrimaryPane('extensions');
      },
    });
  }
}

export namespace ExtensionsPlugin {
  export const $Class = $ExtensionsPlugin;
  export let Class = $ExtensionsPlugin;
  export type Model = InstanceType<typeof Class>;
}
