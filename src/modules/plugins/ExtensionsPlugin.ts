import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import { ExtensionsPaneContent } from './ExtensionsPaneContent';

class $ExtensionsPlugin implements ApplicationContributor {
  readonly primaryDockContentIdentifiers = ['extensions'] as const;

  activateApplication(context: ApplicationContributionContext): void {
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
