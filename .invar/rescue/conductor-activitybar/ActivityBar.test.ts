import { describe, expect, test } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { Theme } from '../theme/Theme';
import { Tooltip } from './Tooltip';
import { ActivityBar, type ActivityBarShortcutLabels } from './ActivityBar';

const SHORTCUT_LABELS: ActivityBarShortcutLabels = {
  explorer: 'Ctrl+Shift+E',
  search: 'Ctrl+Shift+F',
  sourceControl: 'Ctrl+Shift+G',
  settings: 'Ctrl+,',
};

describe('ActivityBar geometry and interaction', () => {
  test('maps the three top rows and bottom row from the supplied width and height', () => {
    const width = 3;
    const height = 12;

    expect(
      ActivityBar.$Class.viewIdentifierAtPosition(1, 0, width, height),
    ).toBe('explorer');
    expect(
      ActivityBar.$Class.viewIdentifierAtPosition(1, 1, width, height),
    ).toBe('search');
    expect(
      ActivityBar.$Class.viewIdentifierAtPosition(1, 2, width, height),
    ).toBe('sourceControl');
    expect(
      ActivityBar.$Class.viewIdentifierAtPosition(1, height - 1, width, height),
    ).toBe('settings');
    expect(
      ActivityBar.$Class.viewIdentifierAtPosition(1, 6, width, height),
    ).toBeNull();
    expect(
      ActivityBar.$Class.viewIdentifierAtPosition(width, 0, width, height),
    ).toBeNull();
  });

  test('keeps every item on a distinct row when the bar is just tall enough', () => {
    const width = 3;
    const height = 4;

    expect(ActivityBar.$Class.rowForView('explorer', width, height)).toBe(0);
    expect(ActivityBar.$Class.rowForView('search', width, height)).toBe(1);
    expect(ActivityBar.$Class.rowForView('sourceControl', width, height)).toBe(
      2,
    );
    expect(ActivityBar.$Class.rowForView('settings', width, height)).toBe(3);
  });

  test('active state wins over hover and targets only the active view', () => {
    expect(
      ActivityBar.$Class.visualStateFor('search', 'search', 'search'),
    ).toBe('active');
    expect(
      ActivityBar.$Class.visualStateFor('explorer', 'search', 'explorer'),
    ).toBe('hover');
    expect(
      ActivityBar.$Class.visualStateFor('sourceControl', 'search', 'explorer'),
    ).toBe('idle');
    expect(
      ActivityBar.$Class.visualStateFor('settings', 'search', 'explorer'),
    ).toBe('idle');
  });

  test('active input targets the right item and a real click emits its view identifier', async () => {
    const testRendererSetup = await createTestRenderer({
      width: 20,
      height: 12,
    });
    const tooltip = new Tooltip.Class();
    const selectedViews: string[] = [];
    const activityBar = new ActivityBar.Class(
      testRendererSetup.renderer,
      new Theme.Class(),
      tooltip,
      { onSelectView: (viewIdentifier) => selectedViews.push(viewIdentifier) },
      { activeView: 'explorer', shortcutLabels: SHORTCUT_LABELS, width: 3 },
    );

    try {
      await testRendererSetup.renderOnce();
      activityBar.setActiveView('search');
      expect(activityBar.visualStateForView('search')).toBe('active');
      expect(activityBar.visualStateForView('explorer')).toBe('idle');

      await testRendererSetup.mockMouse.click(1, 2);
      expect(selectedViews).toEqual(['sourceControl']);
      expect(activityBar.activeView.value).toBe('search');
    } finally {
      activityBar.dispose();
      testRendererSetup.renderer.destroy();
    }
  });

  test('hover arms the shared tooltip with the supplied effective shortcut label', async () => {
    const testRendererSetup = await createTestRenderer({
      width: 20,
      height: 12,
    });
    const tooltip = new Tooltip.Class();
    const activityBar = new ActivityBar.Class(
      testRendererSetup.renderer,
      new Theme.Class(),
      tooltip,
      { onSelectView: () => {} },
      { shortcutLabels: SHORTCUT_LABELS, width: 3 },
    );

    try {
      await testRendererSetup.renderOnce();
      await testRendererSetup.mockMouse.moveTo(1, 1);
      tooltip.tick(1);
      expect(activityBar.hoveredView.value).toBe('search');
      expect(tooltip.text.value).toBe('Search (Ctrl+Shift+F)');
      expect(tooltip.anchorX.value).toBe(1);
      expect(tooltip.anchorY.value).toBe(1);
    } finally {
      activityBar.dispose();
      testRendererSetup.renderer.destroy();
    }
  });
});
