import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import type {
  BoundedListPopupItem,
  BoundedListPopupOpenOptions,
  BoundedListPopupReplaceOptions,
} from './BoundedListPopup';
import { Breadcrumb } from './Breadcrumb';
import { BreadcrumbPicker } from './BreadcrumbPicker';

test('directories drill without dismissal and backward navigation reselects the child', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'breadcrumb-picker-'));
  const sourceDirectory = join(workspaceRoot, 'source');
  const nestedDirectory = join(sourceDirectory, 'nested');
  mkdirSync(nestedDirectory, { recursive: true });
  writeFileSync(join(sourceDirectory, 'peer.txt'), 'peer\n');
  writeFileSync(join(nestedDirectory, 'target.txt'), 'target\n');

  let openedItems: readonly BoundedListPopupItem[] = [];
  let selectionHandler: ((item: BoundedListPopupItem) => void) | null = null;
  let openOptions: BoundedListPopupOpenOptions = {};
  const replacements: Array<{
    items: readonly BoundedListPopupItem[];
    selectedItemIdentifier?: string;
    options: BoundedListPopupReplaceOptions;
  }> = [];
  let openedFile = '';
  const activatePopupItem = (item: BoundedListPopupItem): void => {
    const currentSelectionHandler = selectionHandler;
    if (!currentSelectionHandler) {
      throw new Error('Breadcrumb picker selection handler was not opened');
    }
    currentSelectionHandler(item);
  };
  const activeWorkspace = {
    root: workspaceRoot,
    focus: ref<'editor' | 'files'>('files'),
    openFileInTab: (path: string) => {
      openedFile = path;
    },
  };
  const picker = new BreadcrumbPicker.Class({
    popup: {
      openAt: (items, _anchor, handler, options) => {
        openedItems = items;
        selectionHandler = handler;
        openOptions = options ?? {};
      },
      replaceItems: (items, selectedItemIdentifier, options) => {
        replacements.push({
          items,
          selectedItemIdentifier,
          options: options ?? {},
        });
      },
    },
    overlayCoordinator: {
      openExclusiveOverlay: (_identifier, open) => open(),
    },
    workspaceSet: {
      active: activeWorkspace,
    } as never,
  });

  try {
    const sourceSegment = Breadcrumb.Class.pathSegments(
      join(nestedDirectory, 'target.txt'),
      workspaceRoot,
    ).find((segment) => segment.label === 'source');
    expect(sourceSegment).toBeDefined();
    if (!sourceSegment) return;

    picker.show(sourceSegment, { column: 4, row: 2 });
    expect(openedItems.map((item) => item.label)).toEqual([
      'nested/',
      'peer.txt',
    ]);
    expect(openOptions.selectedItemIdentifier).toBe(nestedDirectory);

    activatePopupItem(openedItems[0]!);
    expect(replacements.at(-1)?.items.map((item) => item.label)).toEqual([
      'target.txt',
    ]);
    expect(replacements.at(-1)?.options.resetQuery).toBe(true);

    openOptions.navigateBackwardHandler?.();
    expect(replacements.at(-1)?.selectedItemIdentifier).toBe(nestedDirectory);
    expect(replacements.at(-1)?.items.map((item) => item.label)).toEqual([
      'nested/',
      'peer.txt',
    ]);

    activatePopupItem(replacements.at(-2)?.items[0]!);
    expect(openedFile).toBe(join(nestedDirectory, 'target.txt'));
    expect(activeWorkspace.focus.value).toBe('editor');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
