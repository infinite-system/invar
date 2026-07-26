import { expect, test } from 'bun:test';
import { ref } from 'vue';
import type { KeyEvent } from '@opentui/core';
import { ExtensionsPaneContent } from './ExtensionsPaneContent';

test('extensions pane toggles the selected contribution', () => {
  let enabled = true;
  const pane = new ExtensionsPaneContent.Class(
    () => 'X',
    {
      revision: ref(0),
      entries: () => [
        {
          identifier: 'sample',
          name: 'Sample',
          enabled,
          canDisable: true,
        },
      ],
      setEnabled: (_identifier, nextEnabled) => {
        enabled = nextEnabled;
      },
    },
    () => {},
  );
  expect(pane.handleKey({ name: 'space' } as KeyEvent)).toBe(true);
  expect(enabled).toBe(false);
});
