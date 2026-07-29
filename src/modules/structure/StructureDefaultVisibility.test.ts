import { expect, test } from 'bun:test';
import { nextTick, ref } from 'vue';
import { PanelHost } from '../ui/PanelHost';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { TextDocument } from '../text/TextDocument';
import type { Workspace } from '../workspace/Workspace';
import type { PaneContent } from '../ui/PaneContent.interface';
import type { StructureSource } from './StructureSource.interface';
import { StructureDefaultVisibility } from './StructureDefaultVisibility';

function structurePaneStub(): PaneContent {
  return {
    id: 'structure',
    title: 'Structure',
    renderRevision: ref(0),
    render: () => ({}) as never,
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose: () => {},
  };
}

function makeDocument(path: string) {
  const document = new TextDocument.Class();
  document.loadFromText('# hello\n', path);
  return document;
}

function makeFixture(options: { showByDefault?: boolean } = {}) {
  const providers = new ProviderRegistry.Class();
  const activeDocumentHandle: {
    document: ReturnType<typeof makeDocument> | null;
  } = { document: null };
  const workspace = {
    providers,
    activeDocumentHandle,
  } as unknown as Workspace.Model;
  const rightDockHost = new PanelHost.Class({
    showWhenContentRegistered: true,
  });
  rightDockHost.register(structurePaneStub());
  const showByDefault = ref(options.showByDefault ?? true);
  const policy = new StructureDefaultVisibility.Class({
    rightDockHost,
    workspaceSet: { active: workspace, activeWorkspaceIndex: ref(0) },
    showByDefault: () => showByDefault.value,
    requestRender: () => {},
  });
  const source: StructureSource = {
    supportsDocument: (document) => document.path.endsWith('.ts'),
    documentSymbols: async () => ({ symbols: [], truncated: false }),
    structureNotice: () => null,
  };
  const setDocument = async (path: string | null) => {
    activeDocumentHandle.document = path ? makeDocument(path) : null;
    // The fingerprint watches the document path; a swapped handle republishes on the registry
    // revision in the app, so the test nudges the same signal the app's lifecycle does.
    providers.revision.value++;
    await nextTick();
  };
  return {
    providers,
    rightDockHost,
    showByDefault,
    policy,
    source,
    setDocument,
  };
}

test('a supported document reveals the pane unbidden and without focus', async () => {
  const fixture = makeFixture();
  await nextTick();
  // Registration revealed the dock, but nothing is open yet — the policy takes it back.
  expect(fixture.rightDockHost.visible.value).toBe(false);

  fixture.providers.register('structure', fixture.source);
  await fixture.setDocument('/tmp/alpha.ts');
  expect(fixture.rightDockHost.isContentVisible('structure')).toBe(true);
  expect(fixture.rightDockHost.focused.value).toBe(false);

  // An unsupported document takes the auto-shown pane back down.
  await fixture.setDocument('/tmp/alpha.css');
  expect(fixture.rightDockHost.visible.value).toBe(false);
  fixture.policy.dispose();
});

test('the contributed setting turns the default off', async () => {
  const fixture = makeFixture({ showByDefault: false });
  fixture.providers.register('structure', fixture.source);
  await fixture.setDocument('/tmp/alpha.ts');
  expect(fixture.rightDockHost.visible.value).toBe(false);

  // Flipping the setting on applies the default live.
  fixture.showByDefault.value = true;
  fixture.providers.revision.value++;
  await nextTick();
  expect(fixture.rightDockHost.isContentVisible('structure')).toBe(true);
  fixture.policy.dispose();
});

test('a hand-close is respected for that document and only that document', async () => {
  const fixture = makeFixture();
  fixture.providers.register('structure', fixture.source);
  await fixture.setDocument('/tmp/alpha.ts');
  expect(fixture.rightDockHost.isContentVisible('structure')).toBe(true);

  // The reader closes the pane by hand: it stays closed on this document.
  fixture.rightDockHost.hide();
  await nextTick();
  expect(fixture.rightDockHost.visible.value).toBe(false);

  // Another supported document re-applies the default…
  await fixture.setDocument('/tmp/beta.ts');
  expect(fixture.rightDockHost.isContentVisible('structure')).toBe(true);

  // …and returning to the closed one respects the reader's choice.
  await fixture.setDocument('/tmp/alpha.ts');
  expect(fixture.rightDockHost.visible.value).toBe(false);
  fixture.policy.dispose();
});

test('an explicit show re-endorses the pane for a hand-closed document', async () => {
  const fixture = makeFixture();
  fixture.providers.register('structure', fixture.source);
  await fixture.setDocument('/tmp/alpha.ts');
  fixture.rightDockHost.hide();
  await nextTick();

  // The user's own show gesture (view.showStructure) clears the opt-out…
  fixture.policy.noteManualShow();
  fixture.rightDockHost.showContent('structure');
  await nextTick();
  expect(fixture.rightDockHost.isContentVisible('structure')).toBe(true);

  // …so leaving and returning applies the default again.
  await fixture.setDocument('/tmp/beta.ts');
  await fixture.setDocument('/tmp/alpha.ts');
  expect(fixture.rightDockHost.isContentVisible('structure')).toBe(true);
  fixture.policy.dispose();
});

test('withdrawing the only source takes an auto-shown pane back down', async () => {
  const fixture = makeFixture();
  const disposeSource = fixture.providers.register('structure', fixture.source);
  await fixture.setDocument('/tmp/alpha.ts');
  expect(fixture.rightDockHost.isContentVisible('structure')).toBe(true);

  disposeSource();
  await nextTick();
  expect(fixture.rightDockHost.visible.value).toBe(false);
  fixture.policy.dispose();
});
