import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { TextDocument } from '../text/TextDocument';
import { Workspace } from '../workspace/Workspace';
import type { StructureSource } from '../structure/StructureSource.interface';
import { LspWorkspaceProvider } from './LspWorkspaceProvider';

test('the LSP workspace contribution registers one document service', async () => {
  const workspace = new Workspace.Class();
  const contribution = new LspWorkspaceProvider.Class(workspace, {
    preferredTypeScriptServer: ref('tsgo'),
    fileSizeLimitKb: ref(2048),
  });
  const document = new TextDocument.Class();
  document.loadFromText('plain text\n', '/tmp/readme.txt');

  expect(contribution.providers).toEqual([contribution]);
  expect(contribution.identifier).toBe('document-language-service');
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

test('the contribution registers a structure source and withdraws it symmetrically', () => {
  const workspace = new Workspace.Class();
  const contribution = new LspWorkspaceProvider.Class(workspace, {
    preferredTypeScriptServer: ref('tsgo'),
    fileSizeLimitKb: ref(2048),
  });
  const supportedDocument = new TextDocument.Class();
  supportedDocument.loadFromText('const a = 1;\n', '/tmp/a.ts');
  const unsupportedDocument = new TextDocument.Class();
  unsupportedDocument.loadFromText('plain\n', '/tmp/readme.txt');

  // While installed, the provider IS the workspace's structure source, and its capability
  // answer is the cheap path check — no server involved.
  expect(workspace.providers.resolve<StructureSource>('structure')).toBe(
    contribution,
  );
  expect(contribution.supportsDocument(supportedDocument)).toBe(true);
  expect(contribution.supportsDocument(unsupportedDocument)).toBe(false);

  // Uninstall symmetry: disposal withdraws the source, so the pane degrades to its stated
  // affordance instead of asking a corpse.
  contribution.disposed();
  expect(workspace.providers.resolve('structure')).toBeNull();

  // The reinstall arm: a fresh contribution registers again.
  const reinstalled = new LspWorkspaceProvider.Class(workspace, {
    preferredTypeScriptServer: ref('tsgo'),
    fileSizeLimitKb: ref(2048),
  });
  expect(workspace.providers.resolve<StructureSource>('structure')).toBe(
    reinstalled,
  );
  reinstalled.disposed();
  workspace.dispose();
});
