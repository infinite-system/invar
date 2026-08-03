import { expect, test } from 'bun:test';
import type { KeyEvent, StyledText } from '@opentui/core';
import { ref } from 'vue';
import type { PaneContent } from './PaneContent.interface';
import { PanelHost } from './PanelHost';
import { PanelWorkspaceState } from './PanelWorkspaceState';

class FakePane implements PaneContent {
  readonly renderRevision = ref(0);
  readonly panelSpace;

  constructor(
    readonly id: string,
    readonly title: string,
    readonly kind: string,
    panelSpaceKind = kind,
    panelSpaceLabel = kind === 'terminal' ? 'Terminal' : title,
  ) {
    this.panelSpace = { kind: panelSpaceKind, label: panelSpaceLabel };
  }

  render(): StyledText {
    return {} as StyledText;
  }
  handleKey(_key: KeyEvent): boolean {
    return false;
  }
  onResize(_columns: number, _rows: number): void {}
  onFocus(): void {}
  onBlur(): void {}
  dispose(): void {}
}

test('a relaunch rebuilds group order, active group, list pin, and list width', () => {
  const firstHost = new PanelHost.Class();
  firstHost.register(new FakePane('terminal', 'Terminal', 'terminal'));
  firstHost.register(
    new FakePane('agent', 'Invar Agent', 'agent', 'terminal', 'Terminal'),
  );
  firstHost.register(new FakePane('terminal-2', 'Terminal 2', 'terminal'));
  firstHost.split(['terminal', 'agent']);
  firstHost.showContent('terminal-2');
  firstHost.show();
  firstHost.togglePanelList();
  firstHost.panelListWidth.value = 13;
  const persisted = PanelWorkspaceState.Class.snapshot(
    firstHost,
    (content) => content.kind ?? content.id,
  );

  const relaunchedHost = new PanelHost.Class();
  const restoration = PanelWorkspaceState.Class.restore(
    persisted,
    (paneState) => {
      const pane = new FakePane(
        paneState.identifier ?? 'missing-identifier',
        paneState.label,
        paneState.kind,
      );
      relaunchedHost.register(pane);
      return pane;
    },
    (kind) => (kind === 'agent' ? 'terminal' : kind),
  );
  relaunchedHost.restoreWorkspaceState(restoration);

  expect(
    relaunchedHost
      .panelGroups()
      .map((group) =>
        group.contentIds.map(
          (identifier) => relaunchedHost.content(identifier)?.title,
        ),
      ),
  ).toEqual([['Terminal', 'Invar Agent'], ['Terminal 2']]);
  expect(relaunchedHost.resolvedCells[0]?.content.title).toBe('Terminal 2');
  expect(relaunchedHost.panelListExpanded.value).toBe(true);
  expect(relaunchedHost.panelListWidth.value).toBe(13);
  expect(relaunchedHost.panelListVisible).toBe(true);
  expect(relaunchedHost.panelGroups().map((group) => group.contentIds)).toEqual(
    [['terminal', 'agent'], ['terminal-2']],
  );
});

test('a notice pane never enters a workspace snapshot', () => {
  const panelHost = new PanelHost.Class();
  panelHost.register(new FakePane('terminal', 'Terminal', 'terminal'));
  panelHost.register(
    new FakePane('task:%2Fworkspace:1:notice', 'Notice', 'task-notice'),
  );

  const persisted = PanelWorkspaceState.Class.snapshot(panelHost, (content) =>
    content.kind === 'task-notice' ? null : (content.kind ?? null),
  );

  expect(persisted.spaces.flatMap((space) => space.groups).flat()).toEqual([
    {
      identifier: 'terminal',
      kind: 'terminal',
      label: 'Terminal',
    },
  ]);
});

test('restore rejects a pane whose kind cannot belong to its saved space', () => {
  const restoredIdentifiers: string[] = [];
  const restoration = PanelWorkspaceState.Class.restore(
    {
      spaces: [
        {
          kind: 'terminal',
          label: 'Terminal',
          groups: [
            [
              {
                identifier: 'database',
                kind: 'database',
                label: 'Database',
              },
            ],
          ],
          activeGroupIndex: 0,
        },
      ],
      activeSpaceIndex: 0,
      panelListExpanded: true,
      panelListWidth: 35,
      visible: true,
    },
    (pane) => {
      restoredIdentifiers.push(pane.identifier ?? 'missing');
      return new FakePane(pane.identifier ?? 'missing', pane.label, pane.kind);
    },
    (kind) => kind,
  );

  expect(restoredIdentifiers).toEqual([]);
  expect(restoration.spaces).toEqual([]);
  expect(restoration.panelListExpanded).toBe(true);
});

test('restore accepts a third pane kind in its declared space', () => {
  const panelHost = new PanelHost.Class();
  panelHost.registerPaneKind('output', { kind: 'output', label: 'Output' });
  const restoration = PanelWorkspaceState.Class.restore(
    {
      spaces: [
        {
          kind: 'output',
          label: 'Output',
          groups: [[{ identifier: 'output', kind: 'output', label: 'Output' }]],
          activeGroupIndex: 0,
        },
      ],
      activeSpaceIndex: 0,
      panelListExpanded: false,
      panelListWidth: 20,
      visible: true,
    },
    (pane) => new FakePane(pane.identifier ?? 'output', pane.label, pane.kind),
    (kind) => panelHost.spaceKindForPaneKind(kind),
  );

  expect(restoration.spaces).toMatchObject([
    { kind: 'output', label: 'Output', contentIds: ['output'] },
  ]);
});
