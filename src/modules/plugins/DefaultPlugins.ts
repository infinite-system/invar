import { Static } from 'ivue/extras';
import type { ApplicationContributor } from '../app/ApplicationContributor.interface';
import { EditorPlugin } from '../editor/EditorPlugin';
import { FileTreeContributor } from '../filetree/FileTreeContributor';
import { GitPlugin } from '../git/GitPlugin';
import { MarkdownPlugin } from '../markdown/MarkdownPlugin';
import { LspPlugin } from '../lsp/LspPlugin';
import { TerminalPlugin } from '../terminal/TerminalPlugin';
// prettier-ignore
import {
  InlineRewriteContributor,
} from '../inline-rewrite/InlineRewriteContributor';
import { StructurePlugin } from '../structure/StructurePlugin';
import { ExtensionsPlugin } from './ExtensionsPlugin';

class $DefaultPlugins {
  static create(): ApplicationContributor[] {
    return [
      new FileTreeContributor.Class(),
      new GitPlugin.Class(),
      new MarkdownPlugin.Class(),
      new LspPlugin.Class(),
      new TerminalPlugin.Class(),
      new InlineRewriteContributor.Class(),
      new EditorPlugin.Class(),
      new StructurePlugin.Class(),
      new ExtensionsPlugin.Class(),
    ];
  }
}

export namespace DefaultPlugins {
  export const $Class = Static($DefaultPlugins);
  export let Class = $Class;
}
