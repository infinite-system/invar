// invariant: Child synchronized updates commit as one repaint (src/modules/terminal/terminal.invariants.md)
import { Static } from 'ivue/extras';

class $TasksWatchRenderer {
  static frame(
    previousLines: readonly string[],
    currentLines: readonly string[],
    enterAlternateScreen: boolean,
  ): string {
    const changedRows: string[] = [];
    const rowCount = Math.max(previousLines.length, currentLines.length);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const previousLine = previousLines[rowIndex] ?? '';
      const currentLine = currentLines[rowIndex] ?? '';
      if (previousLine === currentLine) continue;
      changedRows.push(`\x1b[${rowIndex + 1};1H${currentLine}\x1b[0K`);
    }
    if (!enterAlternateScreen && changedRows.length === 0) return '';
    const screenSetup = enterAlternateScreen ? '\x1b[?1049h\x1b[?25l' : '';
    return (
      '\x1b[?2026h' +
      screenSetup +
      '\x1b[H' +
      changedRows.join('') +
      '\x1b[?2026l'
    );
  }

  static restoreScreen(): string {
    return '\x1b[?2026h\x1b[?25h\x1b[?1049l\x1b[?2026l';
  }
}

export namespace TasksWatchRenderer {
  export const $Class = Static($TasksWatchRenderer);
  export let Class = $Class;
}
