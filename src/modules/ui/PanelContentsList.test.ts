import { expect, test } from 'bun:test';
import { RGBA, type KeyEvent, type StyledText } from '@opentui/core';
import { ref } from 'vue';
import { ThemeIcons } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';
import type { GlyphLevel } from '../theme/TerminalCapabilities';
import { PanelContentsList } from './PanelContentsList';
import { PanelHost } from './PanelHost';
import type { PaneContent, PaneTaskMetadata } from './PaneContent.interface';
import { TabBarRenderer } from './TabBarRenderer';
import { TabStrip } from './TabStrip';
import { WrapText } from './WrapText';

class FakeContent implements PaneContent {
  readonly renderRevision = ref(0);
  readonly panelSpace;

  constructor(
    readonly id: string,
    readonly title: string,
    readonly icon: string,
    readonly kind: string = id,
    panelSpace?: { readonly kind: string; readonly label: string },
    readonly task?: PaneTaskMetadata,
  ) {
    this.panelSpace =
      panelSpace ??
      (kind === 'database'
        ? { kind: 'database', label: 'Database' }
        : { kind: 'terminal', label: 'Terminal' });
  }

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
  host.register(new FakeContent('output', 'Output', 'O'));
  host.split(['agent', 'terminal', 'output']);
  host.show();
  host.togglePanelList();
  const list = new PanelContentsList.Class(host);

  expect(list.visible).toBe(true);
  expect(list.pointerDown(2, 3)).toBe(true);
  expect(host.focusedContent?.id).toBe('terminal');
  expect(list.pointerDown(list.width - 1, 3)).toBe(true);
  expect(host.resolvedCells.map((cell) => cell.content.id)).toEqual([
    'agent',
    'output',
  ]);
  expect(list.visible).toBe(true);
});

test('dragging a row reorders the live split through the host', () => {
  const order = ref(['agent', 'terminal', 'output']);
  let persistenceCount = 0;
  const host = new PanelHost.Class({
    contentOrder: order,
    persistWorkspaceState: () => {
      persistenceCount += 1;
    },
  });
  host.register(new FakeContent('terminal', 'Terminal', 'T'));
  host.register(new FakeContent('agent', 'Agent', 'A'));
  host.register(new FakeContent('output', 'Output', 'O'));
  host.split(['agent', 'terminal', 'output']);
  host.show();
  host.togglePanelList();
  const list = new PanelContentsList.Class(host);
  persistenceCount = 0;

  list.pointerDown(2, 2);
  list.pointerDrag(3);
  list.pointerUp();

  expect(order.value).toEqual(['agent', 'terminal', 'output']);
  expect(host.resolvedCells.map((cell) => cell.content.id)).toEqual([
    'terminal',
    'agent',
    'output',
  ]);
  expect(persistenceCount).toBe(1);
  host.dispose();
  expect(order.value).toEqual(['agent', 'terminal', 'output']);
  expect(persistenceCount).toBe(1);
});

test('a row split button requests a new member for that group and joined members paint group glyphs', () => {
  const host = new PanelHost.Class();
  host.register(new FakeContent('terminal', 'Terminal', 'T', 'terminal'));
  host.register(new FakeContent('agent', 'Invar Agent', 'A', 'agent'));
  host.split(['terminal', 'agent']);
  host.show();
  host.togglePanelList();
  const splitTargets: string[] = [];
  const list = new PanelContentsList.Class(host, (identifier) =>
    splitTargets.push(identifier),
  );

  expect(list.pointerDown(list.width - 5, 2)).toBe(true);
  expect(splitTargets).toEqual(['terminal']);
  const text = list
    .render(
      ThemePalettes.Class.DARK,
      ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
      ThemeIcons.Class.taskActionIconsFor('unicode').taskRecord,
    )
    .chunks.map((chunk) => chunk.text)
    .join('');
  expect(text).toContain('╭');
  expect(text).toContain('╰');
});

test('the pinned list width can shrink and clamps to its declared bounds', () => {
  const host = new PanelHost.Class();
  const list = new PanelContentsList.Class(host);

  list.setWidth(12);
  expect(list.width).toBe(12);
  list.setWidth(2);
  expect(list.width).toBe(10);
  list.setWidth(100);
  expect(list.width).toBe(40);
});

test('the add control reads a third space label from pane registration', () => {
  const host = new PanelHost.Class();
  host.register(
    new FakeContent('output', 'Output', 'O', 'output', {
      kind: 'output',
      label: 'Output',
    }),
  );
  host.show();
  host.togglePanelList();
  const list = new PanelContentsList.Class(host);

  const text = list
    .render(
      ThemePalettes.Class.DARK,
      ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
      ThemeIcons.Class.taskActionIconsFor('unicode').taskRecord,
    )
    .chunks.map((chunk) => chunk.text)
    .join('');

  expect(text).toContain('+ Output');
});

// invariant: The add control keeps one button appearance (src/modules/ui/ui.invariants.md)
// This test used to assert the OPPOSITE: that an emptied list swapped its button
// for the bare words "Add Terminal". The user reported that exact behaviour as the
// defect — the only way back looked like a label, not a control — so the contract
// changed and the test changed with it.
test('the add control keeps one button form whether or not instances remain', () => {
  const host = new PanelHost.Class();
  host.register(new FakeContent('terminal', 'Terminal', 'T', 'terminal'));
  host.visible.value = true;
  host.removeContent('terminal');
  const list = new PanelContentsList.Class(host);
  const palette = ThemePalettes.Class.DARK;
  const glyphs = ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode');
  const renderText = (): string =>
    list
      .render(
        palette,
        glyphs,
        ThemeIcons.Class.taskActionIconsFor('unicode').taskRecord,
      )
      .chunks.map((chunk) => chunk.text)
      .join('');

  expect(list.visible).toBe(true);
  // Empty: the button is present, in its button form, NOT as bare label text.
  expect(renderText()).toContain('+ Terminal');
  expect(renderText()).not.toContain('Add Terminal');

  // Occupied: the same control, unchanged.
  host.register(new FakeContent('terminal', 'Terminal', 'T', 'terminal'));
  expect(renderText()).toContain('+ Terminal');
  expect(renderText()).not.toContain('Add Terminal');
});

test('the add control starts idle and tracks hover and press without moving', () => {
  const host = new PanelHost.Class();
  host.register(new FakeContent('terminal', 'Terminal', 'T', 'terminal'));
  const list = new PanelContentsList.Class(host);
  const renderHeader = () =>
    list.render(
      ThemePalettes.Class.DARK,
      ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
      ThemeIcons.Class.taskActionIconsFor('unicode').taskRecord,
    ).chunks[0];

  expect(renderHeader()?.text.startsWith(' + Terminal')).toBe(true);
  expect(
    renderHeader()?.bg?.equals(RGBA.fromHex(ThemePalettes.Class.DARK.panel)),
  ).toBe(true);
  list.pointerMove(2, 0);
  expect(
    renderHeader()?.bg?.equals(
      RGBA.fromHex(ThemePalettes.Class.DARK.cursorLine),
    ),
  ).toBe(true);
  list.pointerDown(2, 0);
  expect(
    renderHeader()?.bg?.equals(
      RGBA.fromHex(ThemePalettes.Class.DARK.selection),
    ),
  ).toBe(true);
  list.pointerUp();
  expect(
    renderHeader()?.bg?.equals(
      RGBA.fromHex(ThemePalettes.Class.DARK.cursorLine),
    ),
  ).toBe(true);
});

test('row controls overlay the full idle title and restore it after hover', () => {
  const host = new PanelHost.Class();
  host.register(
    new FakeContent(
      'terminal',
      'Terminal instance with a long descriptive name',
      'T',
      'terminal',
    ),
  );
  const list = new PanelContentsList.Class(host);
  list.setWidth(20);
  const glyphs = ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode');
  const renderRow = (): string =>
    list
      .render(
        ThemePalettes.Class.DARK,
        glyphs,
        ThemeIcons.Class.taskActionIconsFor('unicode').taskRecord,
      )
      .chunks.map((chunk) => chunk.text)
      .join('')
      .split('\n')[2] ?? '';

  const idleRow = renderRow();
  expect(WrapText.Class.displayWidth(idleRow)).toBe(20);
  expect(idleRow.endsWith('…')).toBe(true);
  expect(idleRow).not.toContain(glyphs.panelSplit);
  expect(idleRow).not.toContain(glyphs.panelClose);

  list.pointerMove(list.width - 5, 2);
  const hoveredRow = renderRow();
  expect(WrapText.Class.displayWidth(hoveredRow)).toBe(20);
  expect(hoveredRow.slice(0, 13)).toBe(idleRow.slice(0, 13));
  expect(hoveredRow[13]).toBe('…');
  expect(hoveredRow).toContain(glyphs.panelSplit);
  expect(hoveredRow).toContain(glyphs.panelClose);

  list.pointerOut();
  expect(renderRow()).toBe(idleRow);
});

test('task, split, and close share the right row control geometry', () => {
  const host = new PanelHost.Class();
  host.register(
    new FakeContent(
      'task-terminal',
      'Build the complete application package',
      'T',
      'terminal',
      undefined,
      {
        label: 'Build',
        workspaceRoot: '/workspace',
        sourcePath: '/workspace/.invar/tasks.json',
      },
    ),
  );
  const openedTasks: string[] = [];
  const list = new PanelContentsList.Class(
    host,
    () => {},
    () => {},
    (identifier) => openedTasks.push(identifier),
  );

  list.pointerMove(list.width - 8, 2);
  const glyphs = ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode');
  const hoveredRow =
    list
      .render(
        ThemePalettes.Class.DARK,
        glyphs,
        ThemeIcons.Class.taskActionIconsFor('unicode').taskRecord,
      )
      .chunks.map((chunk) => chunk.text)
      .join('')
      .split('\n')[2] ?? '';
  expect(hoveredRow[list.width - 10]).toBe('…');
  expect(WrapText.Class.displayWidth(hoveredRow)).toBe(list.width);
  expect(list.tooltipAt(list.width - 8, 2)).toBe('Open tasks.json');
  expect(list.pointerDown(list.width - 8, 2)).toBe(true);
  expect(openedTasks).toEqual(['task-terminal']);
  expect(list.tooltipAt(list.width - 5, 2)).toBe('Split instance');
  expect(list.tooltipAt(list.width - 2, 2)).toBe('Close instance');
});

test('the list selects visibility among multiple open instances of one kind', () => {
  const host = new PanelHost.Class();
  host.register(new FakeContent('terminal', 'Terminal', 'T', 'terminal'));
  host.register(new FakeContent('terminal-2', 'Terminal 2', 'T', 'terminal'));
  host.register(new FakeContent('terminal-3', 'Terminal 3', 'T', 'terminal'));
  host.showContent('terminal');
  host.togglePanelList();
  const list = new PanelContentsList.Class(host);

  expect(list.visible).toBe(true);
  expect(list.rows.map((row) => row.title)).toEqual([
    'Terminal',
    'Terminal 2',
    'Terminal 3',
  ]);
  list.pointerDown(2, 3);
  expect(host.resolvedCells.map((cell) => cell.content.id)).toEqual([
    'terminal-2',
  ]);
  expect(list.rows[0]?.visible).toBe(false);
  expect(list.rows[1]?.visible).toBe(true);
});

test('tabs and panel rows project one tier-aware close token', () => {
  const host = new PanelHost.Class();
  host.register(new FakeContent('terminal', 'Terminal', 'T'));
  host.showContent('terminal');
  const list = new PanelContentsList.Class(host);
  const strip = new TabStrip.Class('horizontal', () => [
    {
      identifier: '/project/file.txt',
      label: 'file.txt',
      active: true,
      closable: true,
    },
  ]);

  for (const level of ['nerd', 'unicode', 'ascii'] satisfies GlyphLevel[]) {
    const glyphVocabulary = ThemeIcons.Class.interfaceGlyphVocabularyFor(level);
    const expectedCloseGlyph = glyphVocabulary.panelClose;
    list.pointerMove(list.width - 1, 2);
    const listText = list
      .render(
        ThemePalettes.Class.DARK,
        glyphVocabulary,
        ThemeIcons.Class.taskActionIconsFor(level).taskRecord,
      )
      .chunks.map((chunk) => chunk.text)
      .join('');
    const tabText = TabBarRenderer.Class.renderBuffer({
      strip,
      palette: ThemePalettes.Class.DARK,
      barWidth: 30,
      projectRoot: '/project',
      separatorGlyph: '>',
      closeGlyph: expectedCloseGlyph,
      tabMarkerGlyph: glyphVocabulary.tabDirtyMarker,
      hover: null,
      closePressed: null,
      arrowPressed: null,
      lastRevealedIndex: -1,
    })
      .text.chunks.map((chunk) => chunk.text)
      .join('');

    expect(listText.endsWith(`${expectedCloseGlyph} `)).toBe(true);
    expect(tabText.includes(expectedCloseGlyph)).toBe(true);
  }
});
