import { expect, test } from 'bun:test';
import { ref } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import { ThemePalettes } from '../theme/ThemePalettes';
import type { PaneRenderContext } from '../ui/PaneContent.interface';
import { Workspace } from '../workspace/Workspace';
import { DatabaseConsumerWorkspace } from './DatabaseConsumerWorkspace';
import { DatabasePaneContent } from './DatabasePaneContent';

test('the pane states the provider-free affordance', () => {
  const workspace = new Workspace.Class();
  const consumer = new DatabaseConsumerWorkspace.Class(workspace, () => true);
  const application = {
    workspaceSet: {
      activeWorkspaceIndex: ref(0),
      active: workspace,
    },
    theme: { glyphLevel: ref('unicode') },
  } as unknown as ApplicationContributionContext;
  const pane = new DatabasePaneContent.Class(application, () => consumer);

  void consumer.refresh();
  const rendered = pane.render({
    width: 40,
    height: 10,
    palette: ThemePalettes.Class.DARK,
    glyphLevel: 'unicode',
    colorDepth: 'truecolor',
    focused: true,
  } as PaneRenderContext) as unknown as { chunks: Array<{ text: string }> };

  expect(rendered.chunks.map((chunk) => chunk.text).join('')).toContain(
    'No database provider is installed.',
  );
  consumer.disposed();
  workspace.dispose();
});
