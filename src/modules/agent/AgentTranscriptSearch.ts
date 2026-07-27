import { Static } from 'ivue/extras';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import type { FindInBufferMatch } from '../search/FindInBuffer';
import type { ProjectedLine } from './AgentTranscriptProjection';

// invariant: Transcript search is a projection of the transcript (src/modules/agent/agent.invariants.md)
// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)

class $AgentTranscriptSearch {
  static searchableLineTexts(lines: readonly ProjectedLine[]): string[] {
    return lines.map((line) => line.text);
  }

  static highlightsForLine(
    lineText: string,
    lineIndex: number,
    matches: readonly FindInBufferMatch[],
    currentMatchIndex: number,
  ): TranscriptMatchHighlight[] {
    const highlights: TranscriptMatchHighlight[] = [];
    matches.forEach((match, matchIndex) => {
      if (match.line !== lineIndex) return;
      const startCell = EditorCoordinates.Class.displayColumn(
        lineText,
        match.startColumn,
      );
      const endCell = EditorCoordinates.Class.displayColumn(
        lineText,
        match.endColumn,
      );
      if (endCell > startCell) {
        highlights.push({
          startCell,
          endCell,
          current: matchIndex === currentMatchIndex,
        });
      }
    });
    return highlights;
  }
}

export namespace AgentTranscriptSearch {
  export const $Class = Static($AgentTranscriptSearch);
  export let Class = $Class;
}

export interface TranscriptMatchHighlight {
  readonly startCell: number;
  readonly endCell: number;
  readonly current: boolean;
}
