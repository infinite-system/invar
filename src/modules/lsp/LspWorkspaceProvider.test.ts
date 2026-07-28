import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { TextDocument } from '../editor/TextDocument';
import { Workspace } from '../workspace/Workspace';
import { LspWorkspaceProvider } from './LspWorkspaceProvider';

test('the LSP workspace contribution registers one language provider', async () => {
  const workspace = new Workspace.Class();
  const contribution = new LspWorkspaceProvider.Class(workspace, {
    preferredTypeScriptServer: ref('tsgo'),
    fileSizeLimitKb: ref(2048),
  });
  const document = new TextDocument.Class();
  document.loadFromText('plain text\n', '/tmp/readme.txt');

  expect(contribution.providers).toEqual([contribution]);
  expect(contribution.identifier).toBe('language');
  expect(
    await contribution.completion(
      document,
      { line: 0, column: 0 },
      { triggerKind: 'invoked' },
    ),
  ).toEqual({ items: [], isIncomplete: false });
  expect(await contribution.definition(document, { line: 0, column: 0 })).toBe(
    null,
  );
  expect(await contribution.hover(document, { line: 0, column: 0 })).toBeNull();

  contribution.disposed();
  workspace.dispose();
});
