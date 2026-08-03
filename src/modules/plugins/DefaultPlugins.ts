import { Static } from 'ivue/extras';
import type { ApplicationContributor } from '../app/ApplicationContributor.interface';
import { EditorPlugin } from '../editor/EditorPlugin';
import { FileTreeContributor } from '../filetree/FileTreeContributor';
import { GitPlugin } from '../git/GitPlugin';
import { MarkdownPlugin } from '../markdown/MarkdownPlugin';
import { LspPlugin } from '../lsp/LspPlugin';
import { MediaPlugin } from '../media/MediaPlugin';
import { MonitoringPlugin } from '../monitoring/MonitoringPlugin';
import { TerminalPlugin } from '../terminal/TerminalPlugin';
// prettier-ignore
import {
  InlineRewriteContributor,
} from '../inline-rewrite/InlineRewriteContributor';
import { StructurePlugin } from '../structure/StructurePlugin';
import { TasksDashboardPlugin } from '../tasks-dashboard/TasksDashboardPlugin';
import { ExtensionsPlugin } from './ExtensionsPlugin';
import { DatabaseProviderPlugin } from '../database/DatabaseProviderPlugin';
import { DatabaseConsumerPlugin } from '../database/DatabaseConsumerPlugin';
import { VuePlugin } from '../vue/VuePlugin';
import { AgentPlugin } from '../agent/AgentPlugin';

class $DefaultPlugins {
  static create(): ApplicationContributor[] {
    return [
      new FileTreeContributor.Class(),
      new GitPlugin.Class(),
      new MarkdownPlugin.Class(),
      new LspPlugin.Class(),
      new VuePlugin.Class(),
      new DatabaseProviderPlugin.Class(),
      new MediaPlugin.Class(),
      new TerminalPlugin.Class(),
      new AgentPlugin.Class(),
      new InlineRewriteContributor.Class(),
      new EditorPlugin.Class(),
      new StructurePlugin.Class(),
      new TasksDashboardPlugin.Class(),
      new DatabaseConsumerPlugin.Class(),
      new MonitoringPlugin.Class(),
      new ExtensionsPlugin.Class(),
    ];
  }
}

export namespace DefaultPlugins {
  export const $Class = Static($DefaultPlugins);
  export let Class = $Class;
}
