import { expect, test } from 'bun:test';
import type { StyledText } from '@opentui/core';
import { ref } from 'vue';
import type { PaneContent } from './PaneContent.interface';
import { ActivitySurface } from './ActivitySurface';
import { PanelHost } from './PanelHost';
import { PanelHostFocusSet } from './PanelHostFocusSet';

function fakeContent(identifier: string): PaneContent {
  return {
    id: identifier,
    title: identifier,
    renderRevision: ref(0),
    render: () => ({}) as StyledText,
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose: () => {},
  };
}

test('one activity surface projects registered content from both docks', () => {
  const contentOrder = ref(['files', 'structure', 'tasks']);
  const primaryDockHost = new PanelHost.Class({ contentOrder });
  const rightDockHost = new PanelHost.Class({ contentOrder });
  primaryDockHost.register(fakeContent('files'));
  rightDockHost.register(fakeContent('structure'));
  rightDockHost.register(fakeContent('tasks'));
  const activitySurface = new ActivitySurface.Class({
    hosts: [primaryDockHost, rightDockHost],
    contentOrder,
    persistContentOrder: () => {},
  });

  expect(activitySurface.orderedContents.map((content) => content.id)).toEqual([
    'files',
    'structure',
    'tasks',
  ]);
});

test('an activity item toggles and focuses its owning dock only', () => {
  const contentOrder = ref(['files', 'structure']);
  const focusSet = new PanelHostFocusSet.Class();
  const primaryDockHost = new PanelHost.Class({ contentOrder, focusSet });
  const rightDockHost = new PanelHost.Class({ contentOrder, focusSet });
  primaryDockHost.register(fakeContent('files'));
  rightDockHost.register(fakeContent('structure'));
  primaryDockHost.revealContent('files');
  primaryDockHost.focus();
  const activitySurface = new ActivitySurface.Class({
    hosts: [primaryDockHost, rightDockHost],
    contentOrder,
    persistContentOrder: () => {},
  });

  expect(activitySurface.toggleContent('structure')).toBe('shown');
  expect(primaryDockHost.focused.value).toBe(false);
  expect(rightDockHost.focused.value).toBe(true);
  expect(rightDockHost.visible.value).toBe(true);
  expect(rightDockHost.activeId.value).toBe('structure');
  expect(activitySurface.activeIdentifier).toBe('structure');

  expect(activitySurface.toggleContent('structure')).toBe('hidden');
  expect(rightDockHost.visible.value).toBe(false);
  expect(activitySurface.toggleContent('missing')).toBe('missing');
  expect(activitySurface.activeIdentifier).toBe('files');
});

test('cross-dock activity reorder writes one persisted sequence', () => {
  const contentOrder = ref(['files', 'dormant', 'structure', 'tasks']);
  let persistenceCount = 0;
  const primaryDockHost = new PanelHost.Class({ contentOrder });
  const rightDockHost = new PanelHost.Class({ contentOrder });
  primaryDockHost.register(fakeContent('files'));
  rightDockHost.register(fakeContent('structure'));
  rightDockHost.register(fakeContent('tasks'));
  const activitySurface = new ActivitySurface.Class({
    hosts: [primaryDockHost, rightDockHost],
    contentOrder,
    persistContentOrder: () => {
      persistenceCount += 1;
    },
  });

  activitySurface.moveContentTo('tasks', 0);

  expect(contentOrder.value).toEqual([
    'tasks',
    'files',
    'dormant',
    'structure',
  ]);
  expect(persistenceCount).toBe(1);
});
