import { expect, test } from 'bun:test';
import { TextDocument } from '../text/TextDocument';
import { Workspace } from '../workspace/Workspace';
import { VuePlugin } from './VuePlugin';

test('Vue plugin contributes one removable workspace syntax source', () => {
  const workspace = new Workspace.Class();
  const plugin = new VuePlugin.Class();
  const contribution = plugin.attachWorkspace(workspace);
  const document = new TextDocument.Class();
  document.loadFromText(
    '<template>{{ message }}</template>',
    '/tmp/component.vue',
  );

  expect(plugin.identifier).toBe('vue');
  expect(plugin.name).toBe('Vue');
  expect(plugin.canDisable).toBe(true);
  expect(contribution.providers).toHaveLength(1);
  expect(contribution.providers?.[0]?.identifier).toBe(
    'document-syntax-source',
  );

  contribution.disposed();
  workspace.dispose();
});
