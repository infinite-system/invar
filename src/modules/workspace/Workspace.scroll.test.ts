import { describe, expect, test } from 'bun:test';
import { Settings } from '../settings/Settings';
import { Workspace } from './Workspace';
import { EditorSourceTextViewProviderFactory } from '../editor/EditorSourceTextViewProviderFactory';

describe('Workspace scroll animation', () => {
  test('keeps frames live while sub-cell editor momentum remains', () => {
    const workspace = new Workspace.Class({
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
    });
    workspace.editor.viewport.verticalScrollMomentum.value = {
      velocity: 4,
      residual: 0,
    };
    expect(workspace.tickScrollAnimations(0.001)).toBe(true);
    expect(workspace.editor.viewport.scrollTop.value).toBe(0);
    expect(
      workspace.editor.viewport.verticalScrollMomentum.value.residual,
    ).toBeGreaterThan(0);
  });

  test('word wrap leaves horizontal editor momentum untouched', () => {
    const workspace = new Workspace.Class({
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
    });
    workspace.editor.document.loadFromText('x'.repeat(100));
    workspace.editor.hasDocument.value = true;
    workspace.editor.viewport.setSize(10, 2);
    workspace.editor.wordWrap.value = true;
    workspace.editor.viewport.horizontalScrollMomentum.value = {
      velocity: 80,
      residual: 0,
    };
    workspace.tickScrollAnimations(1);
    expect(workspace.editor.viewport.scrollLeft.value).toBe(0);
  });

  test('live-applies the settings momentum ceiling', () => {
    const workspace = new Workspace.Class({
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
    });
    const store: Record<string, string> = {};
    const settings = new Settings.Class({
      fileSystem: {
        readTextFile: (path) => store[path] ?? null,
        writeTextFile: (path, content) => {
          store[path] = content;
        },
        homeDirectory: () => '/home/test',
      },
    });
    settings.load({});
    settings.set('verticalFlingCeiling', 600);
    settings.set('scrollAccelGain', 50);
    workspace.attachSettings(settings);
    for (let notch = 0; notch < 40; notch += 1) {
      workspace.impulseEditorVerticalScroll(1);
    }
    expect(
      workspace.editor.viewport.verticalScrollMomentum.value.velocity,
    ).toBe(0);
    workspace.tickScrollAnimations(1 / 30);
    expect(
      workspace.editor.viewport.verticalScrollMomentum.value.velocity,
    ).toBe(600);
  });
});
