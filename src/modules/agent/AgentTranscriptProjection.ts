// Pure projection of the append-only transcript into flat, width-wrapped visual lines — the ONE place
// the pane's geometry is computed, so the renderer only paints and the pane content only hit-tests. It
// holds NO history: every call reads the passed-in transcript and returns fresh lines, so it can never
// drift from the single source of truth. Tool-use / tool-result entries fold to a ONE-LINE summary
// unless their entry index is in `expandedIndices` (view state owned by the pane, never the transcript),
// so a long tool dump does not flood the pane until the user opens it.
//
// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)
import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { GlyphLevel } from '../theme/TerminalCapabilities';
import { WrapText } from '../ui/WrapText';
import { AgentToolSummary } from './AgentToolSummary';
import type { TranscriptEntry } from './AgentEvents';

/** One projected visual line: its text, paint colour, weight, the transcript entry it belongs to, and
 *  whether clicking it toggles that entry's collapsed/expanded state (tool rows only). */
export interface ProjectedLine {
  readonly text: string;
  readonly color: string;
  readonly bold: boolean;
  /** Index into the transcript this line was projected from (-1 for synthetic lines: blanks, hint). */
  readonly entryIndex: number;
  /** True when a pointer-down on this line toggles the entry's expand state. */
  readonly toggleable: boolean;
}

/** Collapse/expand caret glyphs per fallback tier (single-cell at every level). */
const CARET: Record<GlyphLevel, { collapsed: string; expanded: string }> = {
  nerd: { collapsed: '\u{f0da}', expanded: '\u{f0d7}' }, // fa caret-right / caret-down
  unicode: { collapsed: '▸', expanded: '▾' },
  ascii: { collapsed: '>', expanded: 'v' },
};

/** Tool-call glyph per tier (mirrors the settings-cog ladder). */
const TOOL_GLYPH: Record<GlyphLevel, string> = { nerd: '\u{f013}', unicode: '⚙', ascii: '*' };

/** Tool-result outcome glyphs per tier. */
const RESULT_GLYPH: Record<GlyphLevel, { ok: string; error: string }> = {
  nerd: { ok: '\u{f00c}', error: '\u{f00d}' }, // fa check / times
  unicode: { ok: '✓', error: '✗' },
  ascii: { ok: '+', error: 'x' },
};

/** The empty-transcript hint (shown before any turn). */
const EMPTY_HINT = 'Ask Claude anything. Type a prompt and press Enter.';

/** Truncate to `width` DISPLAY CELLS (grapheme-safe through the shared geometry seam), appending an
 *  ellipsis when it overflows — a code-point count here let CJK summaries overflow the pane. */
function truncate(text: string, width: number, glyphLevel: GlyphLevel): string {
  return WrapText.Class.clipToWidth(text, width, glyphLevel === 'ascii' ? '.' : '…');
}

/** Hard-wrap a string to `width` columns via the shared, width-exact seam. */
function wrap(text: string, width: number): string[] {
  return WrapText.Class.wrap(text, width);
}

/** The pretty (multi-line) body a tool-use entry expands to. */
function toolInputPretty(input: unknown): string {
  return typeof input === 'string' ? input : JSON.stringify(input, null, 2) ?? '';
}

/** The per-entry projection cache record: an entry's lines are reusable while every input that shaped
 *  them is unchanged. Entries are stable objects in the append-only transcript, so a WeakMap keyed on
 *  the ENTRY holds each record; the mutable inputs (an assistant's growing text, a permission's status,
 *  the expand toggle, width/glyph/palette) are compared by identity per frame. */
interface EntryProjectionCache {
  width: number;
  glyphLevel: GlyphLevel;
  palette: Palette;
  expanded: boolean;
  isFirst: boolean;
  /** The entry's mutable content stamp (assistant text / permission status; '' for immutable roles). */
  stamp: string;
  lines: ProjectedLine[];
}
const entryProjectionCache = new WeakMap<TranscriptEntry, EntryProjectionCache>();

/** The mutable-content stamp for an entry (what can change AFTER the entry was appended). */
function stampOf(entry: TranscriptEntry): string {
  if (entry.role === 'assistant') return entry.text;
  if (entry.role === 'permission-request') return entry.status;
  return '';
}

/** Project ONE entry (including its deterministic leading/trailing blank spacing) into visual lines. */
function projectEntry(
  entry: TranscriptEntry,
  entryIndex: number,
  palette: Palette,
  glyphLevel: GlyphLevel,
  width: number,
  expanded: boolean,
): ProjectedLine[] {
  const lines: ProjectedLine[] = [];
  const caret = CARET[glyphLevel];
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
        for (const wrapped of wrap(`— ${entry.text} —`, width))
          lines.push({ text: wrapped, color: palette.dim, bold: false, entryIndex: -1, toggleable: false });
        blank();
        break;
      case 'user':
        lines.push({ text: 'You', color: palette.accent, bold: true, entryIndex, toggleable: false });
        for (const wrapped of wrap(entry.text, width))
          lines.push({ text: wrapped, color: palette.accent, bold: false, entryIndex, toggleable: false });
        blank(); // trailing space after the user's own turn
        break;
      case 'assistant':
        lines.push({ text: 'Claude', color: palette.func, bold: true, entryIndex, toggleable: false });
        for (const wrapped of wrap(entry.text, width))
          lines.push({ text: wrapped, color: palette.fg, bold: false, entryIndex, toggleable: false });
        break;
      case 'error':
        lines.push({ text: '! error', color: palette.error, bold: true, entryIndex, toggleable: false });
        for (const wrapped of wrap(entry.text, width))
          lines.push({ text: wrapped, color: palette.error, bold: false, entryIndex, toggleable: false });
        break;
      case 'tool-use': {
        const marker = expanded ? caret.expanded : caret.collapsed;
        const head = `${marker} ${TOOL_GLYPH[glyphLevel]} ${entry.name}`;
        if (!expanded) {
          // COLLAPSED: a readable human phrase (tool name + salient arg), never the raw JSON.
          const summary = AgentToolSummary.Class.summarize(entry.name, entry.input);
          const oneLine = summary.length > 0 ? `${head}  ${summary}` : head;
          lines.push({ text: truncate(oneLine, width, glyphLevel), color: palette.type, bold: true, entryIndex, toggleable: true });
        } else {
          // EXPANDED: full pretty-printed input for those who want the detail.
          lines.push({ text: truncate(head, width, glyphLevel), color: palette.type, bold: true, entryIndex, toggleable: true });
          for (const wrapped of wrap(toolInputPretty(entry.input), width))
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
            text: truncate(`? Claude wants to run  ${phrase}`, width, glyphLevel),
            color: palette.warning,
            bold: true,
            entryIndex,
            toggleable: false,
          });
          lines.push({
            text: truncate('  [y] allow · [n] deny · [a] always (session)', width, glyphLevel),
            color: palette.dim,
            bold: false,
            entryIndex,
            toggleable: false,
          });
        } else {
          const allowed = entry.status === 'allowed';
          const outcome = allowed ? RESULT_GLYPH[glyphLevel].ok : RESULT_GLYPH[glyphLevel].error;
          lines.push({
            text: truncate(`${outcome} ${allowed ? 'allowed' : 'denied'}  ${phrase}`, width, glyphLevel),
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
        const outcome = entry.isError ? RESULT_GLYPH[glyphLevel].error : RESULT_GLYPH[glyphLevel].ok;
        const color = entry.isError ? palette.error : palette.dim;
        if (!expanded) {
          // COLLAPSED: a short outcome summary — "✓ 42 lines" / "✗ error: …", not the raw dump.
          const summary = AgentToolSummary.Class.summarizeResult(entry.result, entry.isError);
          lines.push({ text: truncate(`${marker} ${outcome} ${summary}`, width, glyphLevel), color, bold: true, entryIndex, toggleable: true });
        } else {
          // EXPANDED: the full wrapped output.
          lines.push({ text: truncate(`${marker} ${outcome} result`, width, glyphLevel), color, bold: true, entryIndex, toggleable: true });
          for (const wrapped of wrap(entry.result, width))
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
function $project(
  transcript: readonly TranscriptEntry[],
  palette: Palette,
  glyphLevel: GlyphLevel,
  width: number,
  expandedIndices: ReadonlySet<number>,
): ProjectedLine[] {
  const lines: ProjectedLine[] = [];
  transcript.forEach((entry, entryIndex) => {
    const expanded = expandedIndices.has(entryIndex);
    const isFirst = entryIndex === 0;
    const stamp = stampOf(entry);
    const cached = entryProjectionCache.get(entry);
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
      entryLines = projectEntry(entry, entryIndex, palette, glyphLevel, width, expanded);
      entryProjectionCache.set(entry, { width, glyphLevel, palette, expanded, isFirst, stamp, lines: entryLines });
    }
    for (const line of entryLines) lines.push(line);
  });
  if (lines.length === 0) lines.push({ text: EMPTY_HINT, color: palette.dim, bold: false, entryIndex: -1, toggleable: false });
  return lines;
}

/** The first visible line index for a tail-anchored window: stuck-to-bottom shows the newest
 *  `bodyHeight` lines; otherwise it holds `scrollTopLines`, clamped into range. Pure. */
function $firstVisibleLine(totalLines: number, bodyHeight: number, scrollTopLines: number, stickToBottom: boolean): number {
  const maximumTop = Math.max(0, totalLines - bodyHeight);
  if (stickToBottom) return maximumTop;
  return Math.max(0, Math.min(scrollTopLines, maximumTop));
}

class $AgentTranscriptProjection {
  static project = $project;
  static firstVisibleLine = $firstVisibleLine;
}

export namespace AgentTranscriptProjection {
  export const $Class = $AgentTranscriptProjection;
  export const Class = Static($AgentTranscriptProjection);
}
