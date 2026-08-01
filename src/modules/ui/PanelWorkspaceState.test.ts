import { expect, test } from 'bun:test';
import type { KeyEvent, StyledText } from '@opentui/core';
import { ref } from 'vue';
import type { PaneContent } from './PaneContent.interface';
import { PanelHost } from './PanelHost';
import { PanelWorkspaceState } from './PanelWorkspaceState';

class FakePane implements PaneContent {
  readonly renderRevision = ref(0);

  constructor(
    readonly id: string,
    readonly title: string,
    readonly kind: string,
  ) {}

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
  firstHost.register(new FakePane('agent', 'Invar Agent', 'agent'));
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
