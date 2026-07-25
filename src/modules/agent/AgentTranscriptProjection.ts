import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { GlyphLevel } from '../theme/TerminalCapabilities';
import { WrapText } from '../ui/WrapText';
import { ThemeIcons } from '../theme/ThemeIcons';
import { AgentToolSummary } from './AgentToolSummary';
import { AgentProviderRegistry } from './AgentProviderRegistry';
import type { TranscriptEntry } from './AgentEvents.interface';
import { AgentWordWrap } from './AgentWordWrap';

// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)
// invariant: Appearance is data with a capability fallback (project.invariants.md)

class $AgentTranscriptProjection {
  protected static get $entryProjectionCache(): WeakMap<
    TranscriptEntry,
    EntryProjectionCache
  > {
    const entryProjectionCache = new WeakMap<
      TranscriptEntry,
      EntryProjectionCache
    >();
    Object.defineProperty(this, '$entryProjectionCache', {
      configurable: true,
      value: entryProjectionCache,
    });
    return entryProjectionCache;
  }

  protected static emptyGreeting(activeProviderLabel: string): string {
    return `Ask ${activeProviderLabel} anything. Type a prompt and press Enter.`;
  }

  protected static producerLabel(engine: string | undefined): string {
    return AgentProviderRegistry.Class.displayLabel(engine ?? 'claude');
  }

  protected static truncate(
    text: string,
    width: number,
    glyphLevel: GlyphLevel,
  ): string {
    return WrapText.Class.clipToWidth(
      text,
      width,
      ThemeIcons.Class.agentTranscriptIconsFor(glyphLevel).ellipsisCell,
    );
  }

  protected static wrap(text: string, width: number): string[] {
    return AgentWordWrap.Class.wrap(text, width);
  }

  protected static toolInputPretty(input: unknown): string {
    return typeof input === 'string'
      ? input
      : (JSON.stringify(input, null, 2) ?? '');
  }

  protected static stampOf(entry: TranscriptEntry): string {
    if (entry.role === 'assistant') return entry.text;
    if (entry.role === 'permission-request') return entry.status;
    return '';
  }

  protected static projectEntry(
  entry: TranscriptEntry,
  entryIndex: number,
  palette: Palette,
  glyphLevel: GlyphLevel,
  width: number,
  expanded: boolean,
): ProjectedLine[] {
  const lines: ProjectedLine[] = [];
  const transcriptIcons = ThemeIcons.Class.agentTranscriptIconsFor(glyphLevel);
  const caret = { collapsed: transcriptIcons.caretCollapsed, expanded: transcriptIcons.caretExpanded };
  const blank = (): void => { lines.push({ text: '', color: palette.dim, bold: false, entryIndex: -1, toggleable: false }); };
  {
    // Airy turn spacing (Claude-style): a blank line BEFORE each user/error turn (separating it from the
    // previous turn) AND a blank line AFTER every user turn (so a just-posted "You" turn is followed by
    // space before the reply/thinking, not only agent→agent gaps). Tool-use/tool-result stay tight under
    // their assistant. The blank is a real projected line, so it wraps/scrolls/selects with the content.
    if (entryIndex > 0 && (entry.role === 'user' || entry.role === 'error' || entry.role === 'system')) blank();
    switch (entry.role) {
      case 'system':
        // A dim, centered aside (e.g. an engine-switch banner) — "— <text> —", framed by em-dashes.
        for (const wrapped of this.wrap(`— ${entry.text} —`, width))
          lines.push({ text: wrapped, color: palette.dim, bold: false, entryIndex: -1, toggleable: false });
        blank();
        break;
      case 'user':
        lines.push({ text: 'You', color: palette.accent, bold: true, entryIndex, toggleable: false });
        for (const wrapped of this.wrap(entry.text, width))
          lines.push({ text: wrapped, color: palette.accent, bold: false, entryIndex, toggleable: false });
        blank(); // trailing space after the user's own turn
        break;
      case 'assistant':
        // The role label names the engine that PRODUCED this turn (entry-stamped): after a switch,
        // new turns say the new engine while history keeps the label of the engine that wrote it.
        lines.push({ text: this.producerLabel(entry.engine), color: palette.func, bold: true, entryIndex, toggleable: false });
        for (const wrapped of this.wrap(entry.text, width))
          lines.push({ text: wrapped, color: palette.fg, bold: false, entryIndex, toggleable: false });
        break;
      case 'error':
        lines.push({ text: '! error', color: palette.error, bold: true, entryIndex, toggleable: false });
        for (const wrapped of this.wrap(entry.text, width))
          lines.push({ text: wrapped, color: palette.error, bold: false, entryIndex, toggleable: false });
        break;
      case 'tool-use': {
        const marker = expanded ? caret.expanded : caret.collapsed;
        const head = `${marker} ${transcriptIcons.tool} ${entry.name}`;
        if (!expanded) {
          // COLLAPSED: a readable human phrase (tool name + salient arg), never the raw JSON.
          const summary = AgentToolSummary.Class.summarize(entry.name, entry.input);
          const oneLine = summary.length > 0 ? `${head}  ${summary}` : head;
          lines.push({ text: this.truncate(oneLine, width, glyphLevel), color: palette.type, bold: true, entryIndex, toggleable: true });
        } else {
          // EXPANDED: full pretty-printed input for those who want the detail.
          lines.push({ text: this.truncate(head, width, glyphLevel), color: palette.type, bold: true, entryIndex, toggleable: true });
          for (const wrapped of this.wrap(this.toolInputPretty(entry.input), width))
            lines.push({ text: wrapped, color: palette.dim, bold: false, entryIndex, toggleable: true });
        }
        break;
      }
      case 'permission-request': {
        // The interactive approval surface. PENDING = a highlighted two-line prompt (what + the keys);
        // RESOLVED = one compact record line. Human-readable via the same AgentToolSummary seam the
        // collapsed tool rows use — never raw JSON.
        const phrase = AgentToolSummary.Class.summarize(entry.toolName, entry.input) || entry.toolName;
        if (entry.status === 'pending') {
          lines.push({
            text: this.truncate(`? ${this.producerLabel(entry.engine)} wants to run  ${phrase}`, width, glyphLevel),
            color: palette.warning,
            bold: true,
            entryIndex,
            toggleable: false,
          });
          lines.push({
            text: this.truncate('  [y] allow · [n] deny · [a] always (session)', width, glyphLevel),
            color: palette.dim,
            bold: false,
            entryIndex,
            toggleable: false,
          });
        } else {
          const allowed = entry.status === 'allowed';
          const outcome = allowed ? transcriptIcons.resultOk : transcriptIcons.resultError;
          lines.push({
            text: this.truncate(`${outcome} ${allowed ? 'allowed' : 'denied'}  ${phrase}`, width, glyphLevel),
            color: allowed ? palette.dim : palette.error,
            bold: false,
            entryIndex,
            toggleable: false,
          });
        }
        break;
      }
      case 'tool-result': {
        const marker = expanded ? caret.expanded : caret.collapsed;
        const outcome = entry.isError ? transcriptIcons.resultError : transcriptIcons.resultOk;
        const color = entry.isError ? palette.error : palette.dim;
        if (!expanded) {
          // COLLAPSED: a short outcome summary — "✓ 42 lines" / "✗ error: …", not the raw dump.
          const summary = AgentToolSummary.Class.summarizeResult(entry.result, entry.isError);
          lines.push({ text: this.truncate(`${marker} ${outcome} ${summary}`, width, glyphLevel), color, bold: true, entryIndex, toggleable: true });
        } else {
          // EXPANDED: the full wrapped output.
          lines.push({ text: this.truncate(`${marker} ${outcome} result`, width, glyphLevel), color, bold: true, entryIndex, toggleable: true });
          for (const wrapped of this.wrap(entry.result, width))
            lines.push({ text: wrapped, color: palette.dim, bold: false, entryIndex, toggleable: true });
        }
        break;
      }
    }
  }
  return lines;
  }

/** Project the whole transcript into flat visual lines at `width`, expanding only the given entries.
 *  MEMOIZED per entry: an unchanged entry reuses its cached lines, so a streaming delta, spinner tick,
 *  or keystroke costs O(changed entries + concatenation), never a full transcript REWRAP (the reviewed
 *  O(total-transcript)-per-frame hot path). */
  static project(
  transcript: readonly TranscriptEntry[],
  palette: Palette,
  glyphLevel: GlyphLevel,
  width: number,
  expandedIndices: ReadonlySet<number>,
  activeProviderLabel: string,
): ProjectedLine[] {
  const lines: ProjectedLine[] = [];
  transcript.forEach((entry, entryIndex) => {
    const expanded = expandedIndices.has(entryIndex);
    const isFirst = entryIndex === 0;
    const stamp = this.stampOf(entry);
    const cached = this.$entryProjectionCache.get(entry);
    let entryLines: ProjectedLine[];
    if (
      cached &&
      cached.width === width &&
      cached.glyphLevel === glyphLevel &&
      cached.palette === palette &&
      cached.expanded === expanded &&
      cached.isFirst === isFirst &&
      cached.stamp === stamp
    ) {
      entryLines = cached.lines;
    } else {
      entryLines = this.projectEntry(entry, entryIndex, palette, glyphLevel, width, expanded);
      this.$entryProjectionCache.set(entry, { width, glyphLevel, palette, expanded, isFirst, stamp, lines: entryLines });
    }
    for (const line of entryLines) lines.push(line);
  });
  if (lines.length === 0)
    lines.push({ text: this.emptyGreeting(activeProviderLabel), color: palette.dim, bold: false, entryIndex: -1, toggleable: false });
  return lines;
  }

/** The first visible line index for a tail-anchored window: stuck-to-bottom shows the newest
 *  `bodyHeight` lines; otherwise it holds `scrollTopLines`, clamped into range. Pure. */
  static firstVisibleLine(
    totalLines: number,
    bodyHeight: number,
    scrollTopLines: number,
    stickToBottom: boolean,
  ): number {
    const maximumTop = Math.max(0, totalLines - bodyHeight);
    if (stickToBottom) return maximumTop;
    return Math.max(0, Math.min(scrollTopLines, maximumTop));
  }
}

export namespace AgentTranscriptProjection {
  export const $Class = $AgentTranscriptProjection;
  export const Class = Static($AgentTranscriptProjection);
}

export interface ProjectedLine {
  readonly text: string;
  readonly color: string;
  readonly bold: boolean;
  readonly entryIndex: number;
  readonly toggleable: boolean;
}

interface EntryProjectionCache {
  width: number;
  glyphLevel: GlyphLevel;
  palette: Palette;
  expanded: boolean;
  isFirst: boolean;
  stamp: string;
  lines: ProjectedLine[];
}
