import { describe, expect, test } from 'bun:test';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { Settings } from '../settings/Settings';
import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from './ApplicationContributor.interface';
import {
  ApplicationContributions,
  type ApplicationContributionsOptions,
} from './ApplicationContributions';

class SampleContributor implements ApplicationContributor {
  readonly identifier = 'sample';
  readonly name = 'Sample';
  disposed = false;

  activateApplication(context: ApplicationContributionContext): void {
    context.registerSetting({
      identifier: 'samplePluginEnabled',
      label: 'Enabled',
      section: this.name,
      defaultValue: true,
      spec: { kind: 'boolean' },
    });
    context.registerKeybindings([
      { chord: { key: 'p' }, action: 'sample.pluginDefault' },
      { chord: { key: 'u' }, action: 'sample.pluginDefault' },
    ]);
  }

  disposeApplication(): void {
    this.disposed = true;
  }
}

function createManager() {
  const settings = new Settings.Class();
  const keybindings = new KeybindingRegistry.Class();
  keybindings.registerLayer('canonical', [
    { chord: { key: 'p' }, action: 'host.default' },
  ]);
  keybindings.registerUserLayer('user', [
    { chord: { key: 'u' }, action: 'user.rebind' },
  ]);
  const contributor = new SampleContributor();
  const options = {
    settings,
    keybindings,
    workspaceSet: { registerContributor: () => () => {} },
    primaryDockHost: {
      register() {},
      removeContent() {},
    },
    requestRender() {},
  } as unknown as ApplicationContributionsOptions;
  const manager = new ApplicationContributions.Class([contributor], options);
  return { contributor, keybindings, manager, settings };
}

describe('ApplicationContributions', () => {
  test('plugin defaults sit above the host and below user rebinds', () => {
    const { keybindings, manager } = createManager();
    manager.activateAll();
    const event = {
      ctrl: false,
      shift: false,
      option: false,
    };
    expect(
      keybindings.resolve({ ...event, name: 'p' }, 'editor', 0).action,
    ).toBe('sample.pluginDefault');
    expect(
      keybindings.resolve({ ...event, name: 'u' }, 'editor', 0).action,
    ).toBe('user.rebind');
  });

  test('disable removes contributed schema and bindings', () => {
    const { contributor, keybindings, manager, settings } = createManager();
    manager.activateAll();
    expect(
      settings
        .contributedSettingDescriptors()
        .map((setting) => setting.identifier),
    ).toEqual(['samplePluginEnabled']);

    manager.setEnabled('sample', false);

    expect(settings.contributedSettingDescriptors()).toEqual([]);
    expect(
      keybindings.resolve(
        {
          name: 'p',
          ctrl: false,
          shift: false,
          option: false,
        },
        'editor',
        0,
      ).action,
    ).toBe('host.default');
    expect(contributor.disposed).toBe(true);
  });
});
