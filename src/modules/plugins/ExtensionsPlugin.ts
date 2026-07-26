import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import { ExtensionsPaneContent } from './ExtensionsPaneContent';

class $ExtensionsPlugin implements ApplicationContributor {
  readonly identifier = 'extensions';
  readonly name = 'Extensions';
  readonly canDisable = false;
  readonly primaryDockContentIdentifiers = ['extensions'] as const;
  protected disposeCommands: (() => void) | null = null;

  activateApplication(context: ApplicationContributionContext): void {
    context.registerKeybindings([
      {
        chord: { key: 'x', ctrl: true, shift: true },
        action: 'view.showExtensions',
      },
    ]);
    context.registerPrimaryDockContent(
      new ExtensionsPaneContent.Class(
        () => context.theme.glyph('activityExtensions'),
        context.applicationContributions,
        context.requestRender,
      ),
    );
    this.disposeCommands = context.commands.register({
      id: 'view.showExtensions',
      title: 'View: Show Extensions',
      category: 'View',
      run: () => {
        context.primaryDockHost.showContent('extensions');
        context.workspaceSet.active.focusPrimaryPane('extensions');
      },
    });
  }

  disposeApplication(): void {
    this.disposeCommands?.();
    this.disposeCommands = null;
  }
}

export namespace ExtensionsPlugin {
  export const $Class = $ExtensionsPlugin;
  export let Class = $ExtensionsPlugin;
  export type Model = InstanceType<typeof Class>;
}
