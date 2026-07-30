import { expect, test } from 'bun:test';
import { GitPlugin } from './GitPlugin';

test('plugin publishes workspace and application contribution seams', () => {
  const plugin = new GitPlugin.Class();
  expect(plugin.primaryDockContentIdentifiers).toEqual(['git']);
  expect(plugin.workspaceContributor).toBe(plugin);
  expect(plugin.attachWorkspace).toBeFunction();
  expect(plugin.activateApplication).toBeFunction();
});

test('current-line blame starts with the tiered user icon and one space', () => {
  const plugin = Object.create(GitPlugin.Class.prototype) as {
    application: {
      theme: { glyph: (slot: string) => string };
    };
    controllerFor: () => {
      activeLineBlame: {
        author: string;
        authorTimeMs: number;
        summary: string;
        uncommitted: boolean;
      };
    };
    paneContent: null;
    segments: GitPlugin.Model['segments'];
  };
  plugin.application = {
    theme: { glyph: (slot) => (slot === 'statusUser' ? '♙' : '') },
  };
  plugin.controllerFor = () => ({
    activeLineBlame: {
      author: 'Ada',
      authorTimeMs: 0,
      summary: 'current work',
      uncommitted: true,
    },
  });
  plugin.paneContent = null;

  expect(
    plugin.segments({
      workspaceSet: { active: { focus: { value: 'editor' } } },
      primaryDockHost: { activeContent: null },
    } as never),
  ).toEqual(['♙ Ada · uncommitted · current work']);
});
