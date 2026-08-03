import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { PaneRuntimes } from './PaneRuntimes';
import type { PaneContent } from './PaneContent.interface';
import type { PaneRuntime, PaneRuntimeRequest } from './PaneRuntime.interface';

function fakePaneContent(
  identifier: string,
  kind: string,
): PaneContent & { readonly request: PaneRuntimeRequest | null } {
  return {
    id: identifier,
    kind,
    title: identifier,
    request: null,
    renderRevision: ref(0),
    render: () => ({}) as never,
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose: () => {},
  };
}

function fakeRuntime(
  kind: string,
  offeredInPanelAddMenu = true,
): PaneRuntime & {
  readonly requests: PaneRuntimeRequest[];
  readonly removed: string[];
} {
  const requests: PaneRuntimeRequest[] = [];
  const removed: string[] = [];
  return {
    kind,
    instanceLabel: kind === 'terminal' ? 'Terminal' : 'Output',
    panelSpace: {
      kind,
      label: kind === 'terminal' ? 'Terminal' : 'Output',
    },
    offeredInPanelAddMenu,
    requests,
    removed,
    createPane(request) {
      requests.push(request);
      return fakePaneContent(request.identifier, request.kind ?? kind);
    },
    paneRemoved(content) {
      removed.push(content.id);
    },
  };
}

test('a registered runtime is the only route to its kind', () => {
  const paneRuntimes = new PaneRuntimes.Class();
  expect(paneRuntimes.runtime('terminal')).toBeNull();
  expect(
    paneRuntimes.createPane('terminal', {
      identifier: 'terminal',
      label: 'Terminal',
      columns: 80,
      rows: 24,
      workingDirectory: '/tmp',
    }),
  ).toBeNull();

  const runtime = fakeRuntime('terminal');
  const unregister = paneRuntimes.register(runtime);
  const content = paneRuntimes.createPane('terminal', {
    identifier: 'terminal',
    label: 'Terminal',
    columns: 80,
    rows: 24,
    workingDirectory: '/tmp',
  });
  expect(content?.id).toBe('terminal');
  expect(runtime.requests[0]?.workingDirectory).toBe('/tmp');

  unregister();
  expect(paneRuntimes.runtime('terminal')).toBeNull();
});

test('instance identity numbering is shared by every kind', () => {
  const paneRuntimes = new PaneRuntimes.Class();
  paneRuntimes.register(fakeRuntime('terminal'));

  expect(paneRuntimes.allocateInstanceIdentity('terminal', false)).toEqual({
    identifier: 'pane-instance-1',
    label: 'Terminal',
  });
  expect(paneRuntimes.allocateInstanceIdentity('terminal', true)).toEqual({
    identifier: 'pane-instance-2',
    label: 'Terminal 2',
  });
  expect(paneRuntimes.allocateInstanceIdentity('terminal', true)).toEqual({
    identifier: 'pane-instance-3',
    label: 'Terminal 3',
  });
  // A display name can restart after every instance closes, but an identifier cannot be reused.
  expect(paneRuntimes.allocateInstanceIdentity('terminal', false)).toEqual({
    identifier: 'pane-instance-4',
    label: 'Terminal',
  });
  expect(paneRuntimes.allocateInstanceIdentity('output', false)).toBeNull();
});

test('instance labels restart in each workspace scope while identifiers stay unique', () => {
  const paneRuntimes = new PaneRuntimes.Class();
  paneRuntimes.register(fakeRuntime('terminal'));

  expect(paneRuntimes.allocateInstanceIdentity('terminal', false, '2')).toEqual(
    {
      identifier: 'pane-instance-1',
      label: 'Terminal',
    },
  );
  expect(paneRuntimes.allocateInstanceIdentity('terminal', true, '2')).toEqual({
    identifier: 'pane-instance-2',
    label: 'Terminal 2',
  });
  expect(paneRuntimes.allocateInstanceIdentity('terminal', false, '3')).toEqual(
    {
      identifier: 'pane-instance-3',
      label: 'Terminal',
    },
  );
});

test('persisted identifiers are kept and claimed before new panes are minted', () => {
  const paneRuntimes = new PaneRuntimes.Class();
  paneRuntimes.register(fakeRuntime('terminal'));

  expect(paneRuntimes.claimPersistedInstanceIdentifier('terminal')).toBe(true);
  expect(paneRuntimes.claimPersistedInstanceIdentifier('terminal')).toBe(false);
  expect(paneRuntimes.claimPersistedInstanceIdentifier('pane-instance-1')).toBe(
    true,
  );
  expect(paneRuntimes.allocateInstanceIdentity('terminal', false)).toEqual({
    identifier: 'pane-instance-2',
    label: 'Terminal',
  });
  expect(paneRuntimes.allocateInstanceIdentity('terminal', false)).toEqual({
    identifier: 'pane-instance-3',
    label: 'Terminal',
  });
});

test('the add menu offers only the kinds that ask to be offered', () => {
  const paneRuntimes = new PaneRuntimes.Class();
  paneRuntimes.register(fakeRuntime('terminal'));
  paneRuntimes.register(fakeRuntime('output', false));
  expect(paneRuntimes.addableKinds()).toEqual([
    { kind: 'terminal', label: 'Terminal' },
  ]);
});

test('removal routes back to the runtime that owns the kind', () => {
  const paneRuntimes = new PaneRuntimes.Class();
  const runtime = fakeRuntime('terminal');
  paneRuntimes.register(runtime);
  paneRuntimes.paneRemoved(fakePaneContent('terminal-2', 'terminal'));
  paneRuntimes.paneRemoved(fakePaneContent('build', 'build'));
  expect(runtime.removed).toEqual(['terminal-2']);
});
