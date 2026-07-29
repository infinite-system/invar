import { expect, test } from 'bun:test';
import {
  ApplicationContributions,
  type ApplicationContributionsOptions,
} from '../app/ApplicationContributions';
// prettier-ignore
import {
  StatusProjectionContributions,
} from '../app/StatusProjectionContributions';
import { CommandRegistry } from '../commands/CommandRegistry';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type {
  RewriteCandidate,
  RewriteProvider,
  RewriteRequest,
} from './RewriteProvider.interface';
import { Settings } from '../settings/Settings';
import { Theme } from '../theme/Theme';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import { InlineRewriteContributor } from './InlineRewriteContributor';
import { EditorSourceTextViews } from '../editor/EditorSourceTextViews';

class DeferredRewriteProvider implements RewriteProvider {
  readonly available = true;
  readonly signals: AbortSignal[] = [];
  disposed = false;

  rewrite(
    _request: RewriteRequest,
    signal: AbortSignal,
  ): Promise<readonly RewriteCandidate[]> {
    this.signals.push(signal);
    return new Promise(() => {});
  }

  dispose(): void {
    this.disposed = true;
  }
}

function createFixture() {
  const settings = new Settings.Class();
  const keybindings = new KeybindingRegistry.Class();
  const commands = new CommandRegistry.Class();
  const theme = new Theme.Class();
  const workspaceSet = new WorkspaceSet.Class(settings, {
    createSourceTextViews: () => new EditorSourceTextViews.Class(),
  });
  workspaceSet.open('/tmp');
  const statusProjectionContributions =
    new StatusProjectionContributions.Class();
  const providers: DeferredRewriteProvider[] = [];
  const contributor = new InlineRewriteContributor.Class({
    createRewriteProvider: () => {
      const provider = new DeferredRewriteProvider();
      providers.push(provider);
      return provider;
    },
  });
  const options = {
    settings,
    keybindings,
    commands,
    theme,
    workspaceSet,
    statusProjectionContributions,
    editorInteractionIsAvailable: () => true,
    dismissEditorSuggestions: () => {},
    bindingHint: (action: string) => action,
    primaryDockHost: {
      register() {},
      removeContent() {},
    },
    requestRender() {},
  } as unknown as ApplicationContributionsOptions;
  const manager = new ApplicationContributions.Class([contributor], options);
  return {
    commands,
    contributor,
    keybindings,
    manager,
    providers,
    settings,
    statusProjectionContributions,
    workspaceSet,
  };
}

test('Extensions disable owns every rewrite registration', async () => {
  const fixture = createFixture();
  fixture.manager.activateAll();
  const editor = fixture.workspaceSet.active.editor;
  editor.document.loadFromText('value', '/tmp/value.ts');
  editor.hasDocument.value = true;
  editor.document.insertInline(0, 5, 'x');

  expect(
    fixture.settings
      .contributedSettingDescriptors()
      .map((setting) => setting.identifier),
  ).toEqual(['inlineRewrite.enabled']);
  expect(fixture.commands.get('inlineRewrite.request')).toBeDefined();
  expect(fixture.keybindings.hasGuard('inlineRewriteVisible')).toBe(true);
  expect(
    fixture.keybindings.resolve(
      {
        name: 'r',
        ctrl: true,
        shift: true,
        option: false,
        super: false,
      },
      'editor',
      0,
    ).action,
  ).toBe('inlineRewrite.request');
  expect(
    fixture.workspaceSet.active.editorContributions.contributionCount,
  ).toBe(1);

  fixture.commands.run('inlineRewrite.request');
  await Promise.resolve();
  expect(fixture.providers).toHaveLength(2);
  expect(
    fixture.statusProjectionContributions.snapshot()
      .inlineRewriteRequestInFlight,
  ).toBe(true);

  fixture.settings.setContributed('inlineRewrite.enabled', false);
  expect(fixture.providers[1]?.signals[0]?.aborted).toBe(true);
  expect(fixture.providers[1]?.disposed).toBe(true);
  expect(
    fixture.workspaceSet.active.editorContributions.contributionCount,
  ).toBe(0);
  expect(
    fixture.statusProjectionContributions.snapshot().inlineRewriteEnabled,
  ).toBe(false);

  fixture.manager.setEnabled('inline-rewrite', false);
  expect(fixture.commands.get('inlineRewrite.request')).toBeUndefined();
  expect(fixture.keybindings.hasGuard('inlineRewriteVisible')).toBe(false);
  expect(fixture.settings.contributedSettingDescriptors()).toEqual([]);
  expect(
    fixture.statusProjectionContributions.snapshot().inlineRewriteRequestCount,
  ).toBeUndefined();

  fixture.manager.setEnabled('inline-rewrite', true);
  expect(fixture.commands.get('inlineRewrite.request')).toBeDefined();
  expect(fixture.keybindings.hasGuard('inlineRewriteVisible')).toBe(true);
  expect(
    fixture.workspaceSet.active.editorContributions.contributionCount,
  ).toBe(1);

  fixture.manager.dispose();
  fixture.workspaceSet.dispose();
});
