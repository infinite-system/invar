import { expect, test } from 'bun:test';
import { ref } from 'vue';
import type { PaneContent } from '../ui/PaneContent.interface';
import { PanelContentLifecycle } from './PanelContentLifecycle';

test('panel content registration reaches consumers until withdrawal', () => {
  const lifecycle = new PanelContentLifecycle.Class();
  const registeredIdentifiers: string[] = [];
  const dispose = lifecycle.onRegistered((content) =>
    registeredIdentifiers.push(content.id),
  );
  const content = {
    id: 'terminal-1',
    title: 'Terminal',
    renderRevision: ref(0),
    handleKey: () => false,
    onResize() {},
    onFocus() {},
    onBlur() {},
    dispose() {},
  } as PaneContent;

  lifecycle.publishRegistered(content);
  dispose();
  lifecycle.publishRegistered({ ...content, id: 'terminal-2' });

  expect(registeredIdentifiers).toEqual(['terminal-1']);
});
