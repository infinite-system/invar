// Transcript search as ONE MORE PROJECTION of the single transcript: the same projected lines the pane
// paints become the searchable text (so collapsed tool rows are searched by their human SUMMARY, and the
// hidden raw JSON is out of scope by construction — what you see is what is searchable, the markdown
// preview's find idiom), and the FindBar engine's grapheme-column matches become per-row DISPLAY-CELL
// highlight spans for the pane's existing per-row highlight machinery. Stateless Static capability: it
// holds no matches and no history — every call derives from the passed-in projection + engine state, so
// it can never drift from the transcript.
//
// invariant: Transcript search is a projection of the transcript (src/modules/agent/agent.invariants.md)
// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)
import { Static } from 'ivue/extras';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import type { FindInBufferMatch } from '../search/FindInBuffer';
import type { ProjectedLine } from './AgentTranscriptProjection';

/** One search-match span on one visual row, in DISPLAY CELLS (the unit the pane's highlight painter and
 *  selection machinery already speak — never UTF-16 offsets). */
export interface TranscriptMatchHighlight {
  readonly startCell: number;
  readonly endCell: number;
  /** True for the match the user is currently cycled onto (painted like a selection, not a dim match). */
  readonly current: boolean;
}

/** The plain-text projection the search mirror document holds: exactly the projected lines' texts, in
 *  order. Searching THESE lines (not the raw transcript) is what scopes matching to the visible words —
 *  a collapsed tool row contributes its one-line summary, an expanded one contributes its full body. */
function $searchableLineTexts(lines: readonly ProjectedLine[]): string[] {
  return lines.map((line) => line.text);
}

/** The engine's matches on ONE visual line, converted from grapheme columns (FindInBuffer's unit) to
 *  display cells (the renderer's unit) through the shared coordinate seam — wide glyphs (CJK, emoji)
 *  occupy two cells, so a UTF-16 or grapheme-count slice here would mis-place every highlight after one. */
function $highlightsForLine(
  lineText: string,
  lineIndex: number,
  matches: readonly FindInBufferMatch[],
  currentMatchIndex: number,
): TranscriptMatchHighlight[] {
  const highlights: TranscriptMatchHighlight[] = [];
  matches.forEach((match, matchIndex) => {
    if (match.line !== lineIndex) return;
    const startCell = EditorCoordinates.Class.displayColumn(lineText, match.startColumn);
    const endCell = EditorCoordinates.Class.displayColumn(lineText, match.endColumn);
    if (endCell > startCell) {
      highlights.push({ startCell, endCell, current: matchIndex === currentMatchIndex });
    }
  });
  return highlights;
}

class $AgentTranscriptSearch {
  static searchableLineTexts = $searchableLineTexts;
  static highlightsForLine = $highlightsForLine;
}

export namespace AgentTranscriptSearch {
  export const $Class = $AgentTranscriptSearch;
  export const Class = Static($AgentTranscriptSearch);
}
