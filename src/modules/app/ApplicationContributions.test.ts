import { describe, expect, test } from 'bun:test';
import type { StyledText } from '@opentui/core';
import { ref } from 'vue';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { Settings } from '../settings/Settings';
import type { PaneContent } from '../ui/PaneContent.interface';
import { PanelHost } from '../ui/PanelHost';
import { ActivitySurface } from '../ui/ActivitySurface';
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
    context.registerKeybindingGuard('sampleAllowed', () => true);
  }

  disposeApplication(): void {
    this.disposed = true;
  }
}

class DockContributor implements ApplicationContributor {
  readonly identifier = 'dock';
  readonly name = 'Dock';
  readonly content: PaneContent & { disposed: boolean } = {
    id: 'outline',
    title: 'Outline',
    renderRevision: ref(0),
    disposed: false,
    render: () => ({}) as StyledText,
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose() {
      this.disposed = true;
    },
  };

  activateApplication(context: ApplicationContributionContext): void {
    context.registerDockContent({
      content: this.content,
      settingIdentifier: 'outline.dockSide',
      settingLabel: 'Dock side',
      section: this.name,
      suggestedSide: 'right',
    });
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

  test('disable removes contributed keybinding guards', () => {
    const { keybindings, manager } = createManager();
    manager.activateAll();
    expect(keybindings.hasGuard('sampleAllowed')).toBe(true);

    manager.setEnabled('sample', false);

    expect(keybindings.hasGuard('sampleAllowed')).toBe(false);
  });

  test('a failed contributor is recorded while later contributors activate', () => {
    const { manager } = createManager();
    const failing = {
      identifier: 'failing',
      name: 'Failing',
      activateApplication() {
        throw new Error('fixture activation failed');
      },
    };
    const later = {
      identifier: 'later',
      name: 'Later',
      activated: false,
      activateApplication() {
        this.activated = true;
      },
    };
    const options = (
      manager as unknown as { options: ApplicationContributionsOptions }
    ).options;
    const contributions = new ApplicationContributions.Class(
      [failing, later],
      options,
    );

    contributions.activateAll();

    expect(later.activated).toBe(true);
    expect(contributions.entries()).toEqual([
      expect.objectContaining({
        identifier: 'failing',
        failure: 'Error: fixture activation failed',
      }),
      expect.objectContaining({ identifier: 'later', enabled: true }),
    ]);
  });

  test('vendor setting identities are qualified by the catalog identity', () => {
    const { manager, settings } = createManager();
    const options = (
      manager as unknown as { options: ApplicationContributionsOptions }
    ).options;
    const vendorContributor: ApplicationContributor = {
      identifier: 'example/playstation',
      name: 'PlayStation Tools',
      vendorMetadata: {
        version: '1.0.0',
        provenance: 'network-gated',
        kernelOverrides: [],
      },
      activateApplication(context) {
        context.registerSetting({
          identifier: 'enabled',
          label: 'Enabled',
          section: 'PlayStation Tools',
          defaultValue: true,
          spec: { kind: 'boolean' },
        });
      },
    };
    const contributions = new ApplicationContributions.Class(
      [vendorContributor],
      options,
    );

    contributions.activateAll();

    expect(
      settings
        .contributedSettingDescriptors()
        .map((setting) => setting.identifier),
    ).toEqual(['example/playstation.enabled']);
  });

  test('a contributed dock side moves one live pane both ways', () => {
    const settings = new Settings.Class();
    const contentOrder = settings.primaryDockContentOrder;
    const primaryDockHost = new PanelHost.Class({
      contentOrder,
      retainUnregisteredContentOrder: true,
    });
    const rightDockHost = new PanelHost.Class({
      contentOrder,
      retainUnregisteredContentOrder: true,
    });
    const contributor = new DockContributor();
    const activitySurface = new ActivitySurface.Class({
      hosts: [primaryDockHost, rightDockHost],
      contentOrder,
      persistContentOrder: () => {},
    });
    const manager = new ApplicationContributions.Class([contributor], {
      settings,
      keybindings: new KeybindingRegistry.Class(),
      workspaceSet: { registerContributor: () => () => {} },
      primaryDockHost,
      rightDockHost,
      requestRender: () => {},
    } as unknown as ApplicationContributionsOptions);

    manager.activateAll();
    expect(primaryDockHost.has('outline')).toBe(false);
    expect(rightDockHost.content('outline')).toBe(contributor.content);
    expect(settings.settingValue('outline.dockSide')).toBe('right');
    expect(
      activitySurface.orderedContents.map((content) => content.id),
    ).toEqual(['outline']);

    rightDockHost.revealContent('outline');
    settings.setContributed('outline.dockSide', 'left');

    expect(rightDockHost.has('outline')).toBe(false);
    expect(primaryDockHost.content('outline')).toBe(contributor.content);
    expect(primaryDockHost.visible.value).toBe(true);
    expect(contributor.content.disposed).toBe(false);

    settings.setContributed('outline.dockSide', 'right');

    expect(primaryDockHost.has('outline')).toBe(false);
    expect(rightDockHost.content('outline')).toBe(contributor.content);
    expect(rightDockHost.visible.value).toBe(true);
    expect(contributor.content.disposed).toBe(false);

    settings.setContributed('outline.dockSide', 'left');
    manager.setEnabled('dock', false);
    expect(primaryDockHost.has('outline')).toBe(false);
    expect(rightDockHost.has('outline')).toBe(false);
    expect(contributor.content.disposed).toBe(true);
    expect(settings.settingValue('outline.dockSide')).toBeUndefined();
    expect(activitySurface.orderedContents).toEqual([]);
  });

  test('uninstall removes a dock contribution from its suggested side', () => {
    const settings = new Settings.Class();
    const contentOrder = settings.primaryDockContentOrder;
    const primaryDockHost = new PanelHost.Class({
      contentOrder,
      retainUnregisteredContentOrder: true,
    });
    const rightDockHost = new PanelHost.Class({
      contentOrder,
      retainUnregisteredContentOrder: true,
    });
    const contributor = new DockContributor();
    const activitySurface = new ActivitySurface.Class({
      hosts: [primaryDockHost, rightDockHost],
      contentOrder,
      persistContentOrder: () => {},
    });
    const manager = new ApplicationContributions.Class([contributor], {
      settings,
      keybindings: new KeybindingRegistry.Class(),
      workspaceSet: { registerContributor: () => () => {} },
      primaryDockHost,
      rightDockHost,
      requestRender: () => {},
    } as unknown as ApplicationContributionsOptions);

    manager.activateAll();
    expect(rightDockHost.has('outline')).toBe(true);
    manager.setEnabled('dock', false);

    expect(primaryDockHost.has('outline')).toBe(false);
    expect(rightDockHost.has('outline')).toBe(false);
    expect(contributor.content.disposed).toBe(true);
    expect(activitySurface.orderedContents).toEqual([]);
  });
});
