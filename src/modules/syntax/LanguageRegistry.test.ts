import { expect, test } from 'bun:test';
import { LanguageRegistry } from './LanguageRegistry';

test('language registry maps extensions', () => {
  expect(LanguageRegistry.Class.forPath('a/b.ts')).toBe('typescript');
  expect(LanguageRegistry.Class.forPath('x.JSON')).toBe('json');
  expect(LanguageRegistry.Class.forPath('r.md')).toBe('plain');
  expect(LanguageRegistry.Class.forPath('LICENSE')).toBe('plain');
});

test('language registry maps web extensions and aliases', () => {
  expect(LanguageRegistry.Class.forPath('index.html')).toBe('html');
  expect(LanguageRegistry.Class.forPath('a.HTM')).toBe('html');
  expect(LanguageRegistry.Class.forPath('icon.svg')).toBe('html');
  expect(LanguageRegistry.Class.forPath('main.css')).toBe('css');
  expect(LanguageRegistry.Class.forPath('theme.scss')).toBe('scss');
  expect(LanguageRegistry.Class.forPath('App.vue')).toBe('plain');
});

test('language mappings remain an overridable late-bound seam', () => {
  class CustomLanguageRegistry extends LanguageRegistry.$Class {
    protected static override get $languagesByExtension() {
      const languagesByExtension = { notes: 'markdown' as const };
      return languagesByExtension;
    }
  }

  expect(CustomLanguageRegistry.forPath('release.notes')).toBe('markdown');
  expect(CustomLanguageRegistry.forPath('release.ts')).toBe('plain');
});
