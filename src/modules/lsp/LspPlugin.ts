import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { Keybinding } from '../keybindings/KeybindingRegistry';
import type { RegisteredSetting } from '../settings/SettingContribution.interface';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { LspWorkspaceProvider } from './LspWorkspaceProvider';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
// invariant: LSP is a provider plugin (src/modules/lsp/lsp.invariants.md)
class $LspPlugin implements ApplicationContributor, WorkspaceContributor {
  readonly identifier = 'language';
  readonly name = 'Language Intelligence';
  readonly workspaceContributor: WorkspaceContributor = this;
  protected application: ApplicationContributionContext | null = null;
  protected preferredTypeScriptServer: RegisteredSetting<string> | null = null;
  protected fileSizeLimitKb: RegisteredSetting<number> | null = null;

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    this.preferredTypeScriptServer = context.registerSetting({
      identifier: 'typescriptServer',
      label: 'TypeScript server',
      section: 'Language',
      defaultValue: 'tsgo',
      spec: {
        kind: 'enum',
        options: ['tsgo', 'typescript-language-server'],
      },
    });
    this.fileSizeLimitKb = context.registerSetting({
      identifier: 'lspFileSizeLimitKb',
      label: 'LSP file size limit (KB, 0 = no limit)',
      section: 'Language',
      defaultValue: 2048,
      spec: {
        kind: 'number',
        step: 512,
        minimum: 0,
        maximum: 51200,
        decimals: 0,
      },
    });
    context.registerKeybindings(this.keybindings());
  }

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    if (!this.preferredTypeScriptServer || !this.fileSizeLimitKb) {
      throw new Error('Language provider settings are not registered');
    }
    return new LspWorkspaceProvider.Class(workspace, {
      preferredTypeScriptServer: this.preferredTypeScriptServer.value,
      fileSizeLimitKb: this.fileSizeLimitKb.value,
    });
  }

  disposeApplication(): void {
    this.application?.dismissEditorSuggestions();
    this.application = null;
    this.preferredTypeScriptServer = null;
    this.fileSizeLimitKb = null;
  }

  protected keybindings(): readonly Keybinding[] {
    return [
      {
        chord: { key: ']', ctrl: true },
        action: 'go.definition',
        context: 'editor',
      },
      {
        chord: { key: 'space', ctrl: true },
        action: 'editor.completion',
        context: 'editor',
      },
    ];
  }
}

export namespace LspPlugin {
  export const $Class = $LspPlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
