import { expect, test } from 'bun:test';
import type { KeyEvent, StyledText } from '@opentui/core';
import { ref } from 'vue';
import { PanelContentsList } from './PanelContentsList';
import { PanelHost } from './PanelHost';
import type { PaneContent } from './PaneContent.interface';

class FakeContent implements PaneContent {
  readonly renderRevision = ref(0);

  constructor(
    readonly id: string,
    readonly title: string,
    readonly icon: string,
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

test('click activates and the visible close affordance closes the same row', () => {
  const host = new PanelHost.Class();
  host.register(new FakeContent('agent', 'Agent', 'A'));
  host.register(new FakeContent('terminal', 'Terminal', 'T'));
  host.split(['agent', 'terminal']);
  host.show();
  const list = new PanelContentsList.Class(host);

  expect(list.visible).toBe(true);
  expect(list.pointerDown(2, 1)).toBe(true);
  expect(host.focusedContent?.id).toBe('terminal');
  expect(list.pointerDown(list.width - 1, 1)).toBe(true);
  expect(host.resolvedCells.map((cell) => cell.content.id)).toEqual(['agent']);
  expect(list.visible).toBe(false);
});

test('dragging a row reorders the live split through the host', () => {
  const order = ref(['agent', 'terminal']);
  let persistenceCount = 0;
  const host = new PanelHost.Class({
    contentOrder: order,
    persistContentOrder: () => {
      persistenceCount += 1;
    },
  });
  host.register(new FakeContent('terminal', 'Terminal', 'T'));
  host.register(new FakeContent('agent', 'Agent', 'A'));
  host.split(['agent', 'terminal']);
  host.show();
  const list = new PanelContentsList.Class(host);

  list.pointerDown(2, 0);
  list.pointerDrag(1);
  list.pointerUp();

  expect(order.value).toEqual(['terminal', 'agent']);
  expect(host.resolvedCells.map((cell) => cell.content.id)).toEqual([
    'terminal',
    'agent',
  ]);
  expect(persistenceCount).toBe(1);
  host.dispose();
  expect(order.value).toEqual(['terminal', 'agent']);
  expect(persistenceCount).toBe(1);
});
