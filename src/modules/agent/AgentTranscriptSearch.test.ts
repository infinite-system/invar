// The transcript-search projection seam, driven through the REAL pipeline pieces: transcript entries →
// AgentTranscriptProjection lines → mirror TextDocument → FindInBuffer matches → display-cell highlight
// spans. Covers the scope contract (visible words only: collapsed tool rows match by their SUMMARY, the
// hidden raw JSON does not) and the display-cell math (wide glyphs shift cells, not just graphemes).
import { describe, expect, test } from 'bun:test';
import { AgentTranscriptProjection } from './AgentTranscriptProjection';
import { AgentTranscriptSearch } from './AgentTranscriptSearch';
import { TextDocument } from '../editor/TextDocument';
import { FindInBuffer } from '../search/FindInBuffer';
import { ThemePalettes } from '../theme/ThemePalettes';
import type { TranscriptEntry } from './AgentEvents.interface';

const darkPalette = ThemePalettes.Class.dark;

/** Project a transcript, mirror it into a document, and run one query — the exact runtime pipeline. */
function searchTranscript(
  transcript: TranscriptEntry[],
  query: string,
  expandedIndices: ReadonlySet<number> = new Set(),
  width = 60,
) {
  const lines = AgentTranscriptProjection.Class.project(
    transcript,
    darkPalette,
    'unicode',
    width,
    expandedIndices,
    'Claude',
  );
  const document = new TextDocument.Class();
  document.replaceAll(
    AgentTranscriptSearch.Class.searchableLineTexts(lines)
      .join('\n')
      .split('\n'),
  );
  const engine = new FindInBuffer.Class(document);
  engine.queryInput.setValue(query);
  engine.findAll();
  return { lines, engine };
}

describe('AgentTranscriptSearch — the match projection over projected transcript lines', () => {
  test('matches plain user, assistant, and system row text', () => {
    const { lines, engine } = searchTranscript(
      [
        { role: 'user', text: 'find the needle please' },
        { role: 'assistant', text: 'the needle is here' },
        { role: 'system', text: 'needle switched on' },
      ],
      'needle',
    );
    expect(engine.matchCount).toBe(3);
    for (const match of engine.matches.value) {
      expect(lines[match.line]?.text).toContain('needle');
    }
  });

  test('collapsed tool rows match by their human SUMMARY — the hidden raw JSON is out of scope', () => {
    const transcript: TranscriptEntry[] = [
      {
        role: 'tool-use',
        id: 'tool-1',
        name: 'Read',
        input: { file_path: '/project/Haystack.ts' },
      },
    ];
    // The collapsed summary phrase contains the basename; the raw JSON key does not surface.
    const summaryHit = searchTranscript(transcript, 'Haystack.ts');
    expect(summaryHit.engine.matchCount).toBeGreaterThan(0);
    const hiddenJsonMiss = searchTranscript(transcript, 'file_path');
    expect(hiddenJsonMiss.engine.matchCount).toBe(0);
    // EXPANDING the entry makes its full body visible — and therefore searchable (what you see is
    // what is searchable; the projection defines the scope, not a special case).
    const expandedHit = searchTranscript(transcript, 'file_path', new Set([0]));
    expect(expandedHit.engine.matchCount).toBeGreaterThan(0);
  });

  test('highlight spans are DISPLAY CELLS: a wide (CJK) prefix shifts the span by two cells per glyph', () => {
    const lineText = '你好 needle';
    const { lines, engine } = searchTranscript(
      [{ role: 'assistant', text: lineText }],
      'needle',
    );
    expect(engine.matchCount).toBe(1);
    const match = engine.matches.value[0]!;
    const highlights = AgentTranscriptSearch.Class.highlightsForLine(
      lines[match.line]!.text,
      match.line,
      engine.matches.value,
      engine.currentMatchIndex.value,
    );
    expect(highlights).toHaveLength(1);
    // '你好 ' = two width-2 glyphs + a space = display cell 5 (grapheme column would be 3 — the bug).
    expect(highlights[0]!.startCell).toBe(5);
    expect(highlights[0]!.endCell).toBe(5 + 'needle'.length);
    expect(highlights[0]!.current).toBe(true);
  });

  test('exactly the CURRENT match is flagged current; cycling moves the flag', () => {
    const { lines, engine } = searchTranscript(
      [
        { role: 'user', text: 'needle one' },
        { role: 'assistant', text: 'needle two' },
      ],
      'needle',
    );
    expect(engine.matchCount).toBe(2);
    const highlightsFor = (matchIndex: number) =>
      engine.matches.value.flatMap((match, index) =>
        AgentTranscriptSearch.Class.highlightsForLine(
          lines[match.line]!.text,
          match.line,
          [match],
          matchIndex === index ? 0 : -1,
        ),
      );
    const first = highlightsFor(engine.currentMatchIndex.value);
    expect(first.map((highlight) => highlight.current)).toEqual([true, false]);
    engine.next();
    const second = highlightsFor(engine.currentMatchIndex.value);
    expect(second.map((highlight) => highlight.current)).toEqual([false, true]);
  });

  test('rows without matches contribute no spans; a query miss yields zero matches', () => {
    const { lines, engine } = searchTranscript(
      [{ role: 'user', text: 'nothing here' }],
      'absent',
    );
    expect(engine.matchCount).toBe(0);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      expect(
        AgentTranscriptSearch.Class.highlightsForLine(
          lines[lineIndex]!.text,
          lineIndex,
          engine.matches.value,
          -1,
        ),
      ).toEqual([]);
    }
  });

  test('searchableLineTexts is exactly the projected texts in order (the mirror can never diverge)', () => {
    const lines = AgentTranscriptProjection.Class.project(
      [
        { role: 'user', text: 'alpha' },
        { role: 'assistant', text: 'beta' },
      ],
      darkPalette,
      'unicode',
      40,
      new Set(),
      'Claude',
    );
    expect(AgentTranscriptSearch.Class.searchableLineTexts(lines)).toEqual(
      lines.map((line) => line.text),
    );
  });
});
