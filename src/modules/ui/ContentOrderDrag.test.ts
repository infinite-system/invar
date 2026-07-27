import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { ContentOrderDrag } from './ContentOrderDrag';
import { PanelHost } from './PanelHost';
import type { PaneContent } from './PaneContent.interface';

function content(identifier: string): PaneContent {
  return {
    id: identifier,
    title: identifier,
    renderRevision: ref(0),
    render: () => {
      throw new Error('render is outside this model test');
    },
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose: () => {},
  };
}

test('one drag controller reorders any PanelHost through the persisted seam', () => {
  const order = ref(['files', 'git', 'extensions']);
  const host = new PanelHost.Class({ contentOrder: order });
  host.register(content('files'));
  host.register(content('git'));
  host.register(content('extensions'));
  const drag = new ContentOrderDrag.Class(host);

  expect(drag.pointerDrag(0)).toBe(false);
  drag.pointerDown('git');
  expect(drag.pointerDrag(0)).toBe(true);
  expect(order.value).toEqual(['git', 'files', 'extensions']);
  drag.pointerUp();
  expect(drag.pointerDrag(2)).toBe(false);
});
