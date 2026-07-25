import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { GlyphLevel, ColorDepth } from '../theme/TerminalCapabilities';
import { AgentSpinnerFrames } from './AgentSpinnerFrames';

class $AgentThinkingIndicator {
  protected static get $coreWords(): readonly string[] {
    const coreWords = Object.freeze([
      'Reducing…',
      'Distilling…',
      'Carving away…',
      'Collapsing the space…',
      'Converging…',
      'Generating…',
      'Synthesizing…',
      'Triangulating…',
      'Grounding in reality…',
      'Scoping…',
      'Testing invariance…',
      'Refining…',
      'Isolating what remains…',
      'Testing boundaries…',
      'Auditing…',
      'Breaking assumptions…',
      'Reframing…',
      'Finding the invariant…',
      'Crystallizing…',
    ]);
    Object.defineProperty(this, '$coreWords', {
      configurable: true,
      value: coreWords,
    });
    return coreWords;
  }

  protected static get $easterEggs(): readonly string[] {
    const easterEggs = Object.freeze([
      'Quantum-hopping the solution space…',
      'Consulting the negative space…',
      'Deleting what refuses to matter…',
      'Quantizing the ineffable…',
      'Two-axis Auditing…',
      'Approaching the limit…',
    ]);
    Object.defineProperty(this, '$easterEggs', {
      configurable: true,
      value: easterEggs,
    });
    return easterEggs;
  }

  protected static get wordRotateSeconds(): number {
    return 3;
  }

  protected static get $gradientSchemes(): ReadonlyArray<
    readonly [keyof Palette, keyof Palette]
  > {
    const gradientSchemes: ReadonlyArray<
      readonly [keyof Palette, keyof Palette]
    > = Object.freeze([
      ['func', 'operator'],
      ['type', 'number'],
      ['keyword', 'error'],
      ['string', 'type'],
      ['number', 'error'],
    ]);
    Object.defineProperty(this, '$gradientSchemes', {
      configurable: true,
      value: gradientSchemes,
    });
    return gradientSchemes;
  }

  static get coreWords(): readonly string[] {
    return this.$coreWords;
  }

  static get easterEggs(): readonly string[] {
    return this.$easterEggs;
  }

  static get easterEggOdds(): number {
    return 15;
  }

  static pickWord(slot: number): string {
    const hash = Math.imul((slot >>> 0) + 0x9e3779b9, 2654435761) >>> 0;
    if (hash % this.easterEggOdds === 0)
      return this.$easterEggs[(hash >>> 8) % this.$easterEggs.length]!;
    return this.$coreWords[slot % this.$coreWords.length]!;
  }

  protected static twinkleGlyphColor(
    frameIndex: number,
    highlightColor: string,
    brightColor: string,
  ): string {
    return frameIndex % 12 < 2 ? brightColor : highlightColor;
  }

  static compose(state: ThinkingState): ThinkingSegment[] {
  const { frameIndex, elapsedSeconds, glyphLevel, colorDepth, palette } = state;

  // The primary line always shows the agent WORKING — a rotating reduction verb with a shimmer; what
  // it's blocked on (a pending tool) lives in the calm secondary note, not here.
  const slot = Math.floor(Math.max(0, elapsedSeconds) / this.wordRotateSeconds);
  const word = this.pickWord(slot);

  // The gradient palette switches with each slot (visual variety as the words change).
  const scheme = this.$gradientSchemes[slot % this.$gradientSchemes.length]!;
  const baseColor = palette[scheme[0]] as string;
  const highlightColor = palette[scheme[1]] as string;

  const glyph = AgentSpinnerFrames.Class.glyphFor(frameIndex, glyphLevel);
  const characters = Array.from(word);
  const shimmer =
    glyphLevel === 'ascii'
      ? characters.map(() => highlightColor) // ascii: plain (single colour) word
      : AgentSpinnerFrames.Class.shimmerColors(characters.length, frameIndex, colorDepth, baseColor, highlightColor);

  const segments: ThinkingSegment[] = [];
  // EXACTLY ONE front glyph (a single-width braille cell at a fixed column), twinkling by COLOUR — the
  // word after it always starts at the same column, so the line never reflows.
  segments.push({ text: glyph, color: this.twinkleGlyphColor(frameIndex, highlightColor, palette.fg), bold: true });
  segments.push({ text: ' ', color: palette.dim, bold: false });
  // The shimmering word, one segment per glyph so each carries its own gradient colour.
  characters.forEach((character, index) => {
    segments.push({ text: character, color: shimmer[index] ?? highlightColor, bold: true });
  });
  // Dim elapsed-seconds counter (trailing TEXT, never a glyph).
  segments.push({ text: `  ${AgentSpinnerFrames.Class.formatElapsed(elapsedSeconds)}`, color: palette.dim, bold: false });
  return segments;
  }

/** The calm secondary note: which pending tool the agent is blocked on, with that tool's elapsed time.
 *  The pane cycles `toolName` through the pending set over time; a "2/3" counter hints there are more.
 *  Dim/informative (not shimmering), with a gentle pulse on switch. Empty when nothing is pending. */
  static composeWaitingNote(state: WaitingNoteState): ThinkingSegment[] {
  if (!state.toolName) return [];
  const glyph = state.glyphLevel === 'ascii' ? '*' : '⧗';
  const ellipsis = state.glyphLevel === 'ascii' ? '...' : '…';
  const glyphColor = state.highlight ? state.palette.accent : state.palette.info; // pulse on switch
  const segments: ThinkingSegment[] = [
    { text: `${glyph} `, color: glyphColor, bold: state.highlight },
    { text: state.toolName, color: state.palette.info, bold: false },
    { text: `${ellipsis} ${AgentSpinnerFrames.Class.formatElapsed(state.elapsedSeconds)}`, color: state.palette.dim, bold: false },
  ];
  if (state.pendingCount > 1) {
    // Which of the N pending calls this is (cycling); the pane sets highlight on the switch frame.
    segments.push({ text: `  (${state.pendingCount} pending)`, color: state.palette.dim, bold: false });
  }
    return segments;
  }
}

export namespace AgentThinkingIndicator {
  export const $Class = $AgentThinkingIndicator;
  export const Class = Static($AgentThinkingIndicator);
}

export interface ThinkingSegment {
  readonly text: string;
  readonly color: string;
  readonly bold: boolean;
}

export interface ThinkingState {
  frameIndex: number;
  elapsedSeconds: number;
  glyphLevel: GlyphLevel;
  colorDepth: ColorDepth;
  palette: Palette;
}

export interface WaitingNoteState {
  toolName: string | null;
  elapsedSeconds: number;
  pendingCount: number;
  highlight: boolean;
  glyphLevel: GlyphLevel;
  palette: Palette;
}
