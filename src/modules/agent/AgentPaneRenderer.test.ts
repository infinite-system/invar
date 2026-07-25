import { expect, test } from 'bun:test';
import { DARK } from '../theme/ThemePalettes';
import { AgentPaneRenderer } from './AgentPaneRenderer';

test('render paints the supplied transcript and composer rows', () => {
  const rendered = AgentPaneRenderer.Class.render({
    palette: DARK,
    padLeft: 0,
    bodyRows: [
      {
        text: 'answer',
        color: DARK.fg,
        bold: false,
        entryIndex: 0,
        toggleable: false,
      },
    ],
    selectionRanges: [null],
    searchHighlights: [[]],
    thinking: null,
    waitingNote: null,
    rule: '----',
    composer: [
      { absoluteLine: 0, isFirstLine: true, text: 'prompt', selection: null },
    ],
    modeLine: [],
    focused: true,
  });

  const text = (rendered.chunks as unknown as { text: string }[])
    .map((chunk) => chunk.text)
    .join('');
  expect(text).toContain('answer');
  expect(text).toContain('prompt');
});
