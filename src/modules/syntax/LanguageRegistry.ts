import { Static } from 'ivue/extras';
import type { LangId } from './Highlighter';

// Maps an ordinary file to its fallback tokenizer language. Document syntax sources override this
// fallback through the workspace provider registry.
//
// invariant: Construction goes through overridable seams (project.invariants.md)

class $LanguageRegistry {
  protected static get $languagesByExtension(): Readonly<
    Record<string, LangId>
  > {
    const languagesByExtension: Readonly<Record<string, LangId>> = {
      diff: 'diff',
      patch: 'diff',
      ts: 'typescript',
      tsx: 'typescript',
      mts: 'typescript',
      cts: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      mjs: 'javascript',
      cjs: 'javascript',
      json: 'json',
      jsonc: 'json',
      md: 'markdown',
      markdown: 'markdown',
      html: 'html',
      htm: 'html',
      xml: 'html',
      svg: 'html',
      css: 'css',
      scss: 'scss',
      less: 'css',
      sass: 'css',
    };
    return languagesByExtension;
  }

  static forPath(path: string): LangId {
    const dotIndex = path.lastIndexOf('.');
    if (dotIndex < 0) return 'plain';
    const extension = path.slice(dotIndex + 1).toLowerCase();
    return this.$languagesByExtension[extension] ?? 'plain';
  }
}

export namespace LanguageRegistry {
  export const $Class = Static($LanguageRegistry);
  export let Class = $Class;
}
