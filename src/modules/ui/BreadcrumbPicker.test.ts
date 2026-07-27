import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import { ThemeIcons } from '../theme/ThemeIcons';
import type {
  BoundedListPopupItem,
  BoundedListPopupOpenOptions,
  BoundedListPopupReplaceOptions,
} from './BoundedListPopup';
import { Breadcrumb } from './Breadcrumb';
import { BreadcrumbPicker } from './BreadcrumbPicker';

// The picker under test resolves marks through the SAME resolver the file tree paints with, so the
// stub forwards to `ThemeIcons` instead of inventing glyphs a second time.
const unicodeSymbolMarks = ThemeIcons.Class.symbolMarksFor('unicode');
const themeIconStub = {
  icon: (name: string, isDirectory: boolean, open = false): string =>
    ThemeIcons.Class.iconFor('unicode', name, isDirectory, open),
};

test('the parent row and Left share one upward generator', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'breadcrumb-picker-'));
  const sourceDirectory = join(workspaceRoot, 'source');
  const nestedDirectory = join(sourceDirectory, 'nested');
  mkdirSync(nestedDirectory, { recursive: true });
  writeFileSync(join(sourceDirectory, 'module.ts'), 'export {};\n');
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
    theme: themeIconStub,
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
      '..',
      'nested',
      'module.ts',
      'peer.txt',
    ]);
    // The icon carries the directory distinction, so no label repeats it with a trailing slash.
    expect(openedItems.every((item) => !item.label.includes('/'))).toBe(true);
    expect(openedItems.map((item) => item.icon)).toEqual([
      unicodeSymbolMarks.directoryClosed,
      unicodeSymbolMarks.directoryClosed,
      unicodeSymbolMarks.typescript,
      unicodeSymbolMarks.file,
    ]);
    expect(openedItems[0]?.identifier).toBe(
      BreadcrumbPicker.Class.PARENT_DIRECTORY_ITEM_IDENTIFIER,
    );
    expect(openedItems[0]?.pinnedWhileQueryEmpty).toBe(true);
    expect(openedItems[0]?.keepOpenOnSelect).toBe(true);
    expect(openOptions.selectedItemIdentifier).toBe(nestedDirectory);

    activatePopupItem(openedItems[0]!);
    const parentRowReplacement = replacements.at(-1);
    expect(parentRowReplacement?.selectedItemIdentifier).toBe(sourceDirectory);
    expect(parentRowReplacement?.items.map((item) => item.label)).toEqual([
      'source',
    ]);
    expect(parentRowReplacement?.options.resetQuery).toBe(true);

    activatePopupItem(parentRowReplacement?.items[0]!);
    expect(replacements.at(-1)?.items.map((item) => item.label)).toEqual([
      '..',
      'nested',
      'module.ts',
      'peer.txt',
    ]);

    openOptions.navigateBackwardHandler?.();
    expect(replacements.at(-1)?.selectedItemIdentifier).toBe(
      parentRowReplacement?.selectedItemIdentifier,
    );
    expect(replacements.at(-1)?.items.map((item) => item.label)).toEqual(
      parentRowReplacement?.items.map((item) => item.label) ?? [],
    );

    activatePopupItem(replacements.at(-1)!.items[0]!);
    activatePopupItem(
      replacements.at(-1)!.items.find((item) => item.label === 'nested')!,
    );
    activatePopupItem(
      replacements.at(-1)!.items.find((item) => item.label === 'target.txt')!,
    );
    expect(openedFile).toBe(join(nestedDirectory, 'target.txt'));
    expect(activeWorkspace.focus.value).toBe('editor');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('the workspace root offers no parent row', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'breadcrumb-picker-root-'));
  writeFileSync(join(workspaceRoot, 'root-file.txt'), 'root\n');
  let openedItems: readonly BoundedListPopupItem[] = [];
  const picker = new BreadcrumbPicker.Class({
    popup: {
      openAt: (items) => {
        openedItems = items;
      },
      replaceItems: () => {},
    },
    overlayCoordinator: {
      openExclusiveOverlay: (_identifier, open) => open(),
    },
    workspaceSet: {
      active: {
        root: workspaceRoot,
        focus: ref<'editor' | 'files'>('files'),
        openFileInTab: () => {},
      },
    } as never,
    theme: themeIconStub,
  });

  try {
    const rootSegment = Breadcrumb.Class.pathSegments(
      join(workspaceRoot, 'root-file.txt'),
      workspaceRoot,
    )[0];
    expect(rootSegment).toBeDefined();
    if (!rootSegment) return;

    picker.show(rootSegment, { column: 4, row: 2 });
    expect(openedItems.map((item) => item.label)).toEqual(['root-file.txt']);
    expect(
      openedItems.some(
        (item) =>
          item.identifier ===
          BreadcrumbPicker.Class.PARENT_DIRECTORY_ITEM_IDENTIFIER,
      ),
    ).toBe(false);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
