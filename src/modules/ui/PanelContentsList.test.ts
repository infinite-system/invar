import { expect, test } from 'bun:test';
import type { KeyEvent, StyledText } from '@opentui/core';
import { ref } from 'vue';
import { ThemeIcons } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';
import type { GlyphLevel } from '../theme/TerminalCapabilities';
import { PanelContentsList } from './PanelContentsList';
import { PanelHost } from './PanelHost';
import type { PaneContent } from './PaneContent.interface';
import { TabBarRenderer } from './TabBarRenderer';
import { TabStrip } from './TabStrip';

class FakeContent implements PaneContent {
  readonly renderRevision = ref(0);

  constructor(
    readonly id: string,
    readonly title: string,
    readonly icon: string,
    readonly kind: string = id,
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
  host.register(new FakeContent('output', 'Output', 'O'));
  host.split(['agent', 'terminal', 'output']);
  host.show();
  host.togglePanelList();
  const list = new PanelContentsList.Class(host);

  expect(list.visible).toBe(true);
  expect(list.pointerDown(2, 1)).toBe(true);
  expect(host.focusedContent?.id).toBe('terminal');
  expect(list.pointerDown(list.width - 1, 1)).toBe(true);
  expect(host.resolvedCells.map((cell) => cell.content.id)).toEqual([
    'agent',
    'output',
  ]);
  expect(list.visible).toBe(false);
});

test('dragging a row reorders the live split through the host', () => {
  const order = ref(['agent', 'terminal', 'output']);
  let persistenceCount = 0;
  const host = new PanelHost.Class({
    contentOrder: order,
    persistContentOrder: () => {
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

  list.pointerDown(2, 0);
  list.pointerDrag(1);
  list.pointerUp();

  expect(order.value).toEqual(['terminal', 'agent', 'output']);
  expect(host.resolvedCells.map((cell) => cell.content.id)).toEqual([
    'terminal',
    'agent',
    'output',
  ]);
  expect(persistenceCount).toBe(1);
  host.dispose();
  expect(order.value).toEqual(['terminal', 'agent', 'output']);
  expect(persistenceCount).toBe(1);
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
  list.pointerDown(2, 1);
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
    const listText = list
      .render(ThemePalettes.Class.DARK, glyphVocabulary)
      .chunks.map((chunk) => chunk.text)
      .join('');
    const tabText = TabBarRenderer.Class.renderBuffer({
      strip,
      palette: ThemePalettes.Class.DARK,
      barWidth: 30,
      projectRoot: '/project',
      separatorGlyph: '>',
      closeGlyph: expectedCloseGlyph,
      hover: null,
      closePressed: null,
      arrowPressed: null,
      lastRevealedIndex: -1,
    })
      .text.chunks.map((chunk) => chunk.text)
      .join('');

    expect(listText.endsWith(expectedCloseGlyph)).toBe(true);
    expect(tabText.includes(expectedCloseGlyph)).toBe(true);
  }
});
