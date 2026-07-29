import { expect, test } from 'bun:test';
import { PanelHost } from './PanelHost';
import { PanelHostFocusSet } from './PanelHostFocusSet';

test('a focus claim blurs every other registered panel host', () => {
  const focusSet = new PanelHostFocusSet.Class();
  const primaryDockHost = new PanelHost.Class({ focusSet });
  const rightDockHost = new PanelHost.Class({ focusSet });
  const bottomPanelHost = new PanelHost.Class({ focusSet });

  primaryDockHost.focus();
  expect(primaryDockHost.focused.value).toBe(true);

  rightDockHost.focus();
  expect(primaryDockHost.focused.value).toBe(false);
  expect(rightDockHost.focused.value).toBe(true);

  bottomPanelHost.focus();
  expect(primaryDockHost.focused.value).toBe(false);
  expect(rightDockHost.focused.value).toBe(false);
  expect(bottomPanelHost.focused.value).toBe(true);
});
