import { Static } from 'ivue/extras';
import { Environment } from '../system/Environment';

// Detects terminal color depth, glyph support, and the image graphics tier so palettes, icons, and
// the image preview can degrade.
// invariant: Terminal color and glyph support varies (project.invariants.md)
// invariant: Terminal capability can only be inferred from the environment (src/modules/theme/theme.invariants.md)
// invariant: Graphics tier prefers the reported capability and degrades to cells (src/modules/theme/theme.invariants.md)

class $TerminalCapabilities {
  static detectColorDepth(): ColorDepth {
    const colorTerm = Environment.Class.env('COLORTERM') ?? '';
    if (/truecolor|24bit/i.test(colorTerm)) return 'truecolor';
    const term = Environment.Class.env('TERM') ?? '';
    // Genuinely legacy / limited terminals that cannot render 24-bit color get the 16-color floor.
    if (
      term === '' ||
      /^(dumb|linux|vt\d+|ansi|xterm|xterm-color|xterm-16color)$/i.test(term)
    )
      return '16';
    // Everything modern — xterm-256color, screen/tmux-256color, alacritty, xterm-kitty, … — is assumed
    // truecolor. Such terminals under-report via TERM (`…-256color` for legacy compat) and FREQUENTLY
    // have COLORTERM unset (tmux/ssh strip it). The old "TERM has 256color → '256'" rule therefore served
    // real 24-bit terminals a coarse 256-cube quantization that mangled soft palettes (Tokyo Night) into
    // harsh, DOS-like approximations. A wrong guess here degrades gracefully in the terminal; the reverse
    // (assuming 256 on a truecolor terminal) does not.
    return 'truecolor';
  }

  static detectGlyphLevel(): GlyphLevel {
    // Nerd fonts announce themselves rarely; use env hints, else unicode (safe default).
    const termProgram = Environment.Class.env('TERM_PROGRAM') ?? '';
    if (Environment.Class.env('NERD_FONT') === '1') return 'nerd';
    if (/wezterm|kitty|ghostty/i.test(termProgram)) return 'nerd';
    const language = Environment.Class.env('LANG') ?? '';
    if (/utf-?8/i.test(language)) return 'unicode';
    return 'ascii';
  }

  /** Auto-detect the image-preview graphics tier, retaining the environment override for callers
   *  without a persisted setting (the reporting instrument and older harness probes). */
  static detectGraphicsTier(
    reported: ReportedGraphicsCapabilities | null,
  ): GraphicsTier {
    return (
      this.graphicsTierEnvironmentOverride() ??
      this.detectAutomaticGraphicsTier(reported)
    );
  }

  /** Resolve the live application tier. Precedence is the harness/CI environment override, then the
   *  persisted declaration, then automatic detection when the declaration is `auto`. */
  static resolveGraphicsTier(
    declared: GraphicsTierSetting,
    reported: ReportedGraphicsCapabilities | null,
  ): GraphicsTier {
    const environmentOverride = this.graphicsTierEnvironmentOverride();
    if (environmentOverride) return environmentOverride;
    if (declared !== 'auto') return declared;
    return this.detectAutomaticGraphicsTier(reported);
  }

  protected static graphicsTierEnvironmentOverride(): GraphicsTier | null {
    const configuredTier = Environment.Class.env('TUI_GRAPHICS_TIER');
    return configuredTier === 'kitty' ||
      configuredTier === 'sixel' ||
      configuredTier === 'halfblock'
      ? configuredTier
      : null;
  }

  /** Automatic tier selection:
   *  1. A positive OpenTUI capability report (the terminal's own answer), even when that answer
   *     arrived through a multiplexer — the reply proves the query passed through.
   *  2. A report with no rich graphics capability: half-block, including under a multiplexer, and
   *     never second-guessed by env.
   *  3. No report object (a caller without a renderer): a tmux floor, then conservative env
   *     heuristics, else the universal half-block floor. A live renderer supplies a negative report
   *     while its query is pending, so its async path can only move UP from the floor. */
  protected static detectAutomaticGraphicsTier(
    reported: ReportedGraphicsCapabilities | null,
  ): GraphicsTier {
    if (reported) {
      if (reported.kitty_graphics) return 'kitty';
      if (reported.sixel) return 'sixel';
      return 'halfblock';
    }
    if (Environment.Class.env('TMUX')) return 'halfblock';
    const term = Environment.Class.env('TERM') ?? '';
    if (/^xterm-(kitty|ghostty)$/i.test(term)) return 'kitty';
    if (Environment.Class.env('KITTY_WINDOW_ID')) return 'kitty';
    const termProgram = Environment.Class.env('TERM_PROGRAM') ?? '';
    if (/^(wezterm|iterm\.app)$/i.test(termProgram)) return 'sixel';
    return 'halfblock';
  }
}

export namespace TerminalCapabilities {
  export const $Class = Static($TerminalCapabilities);
  export let Class = $Class;
}

export type ColorDepth = 'truecolor' | '256' | '16';

export type GlyphLevel = 'nerd' | 'unicode' | 'ascii';

/** How the image preview reaches the screen, richest first. */
export type GraphicsTier = 'kitty' | 'sixel' | 'halfblock';

/** The persisted declaration; `auto` keeps live terminal-capability detection active. */
export type GraphicsTierSetting = 'auto' | GraphicsTier;

/** The slice of OpenTUI's terminal-capability report that graphics-tier detection consumes. */
export interface ReportedGraphicsCapabilities {
  kitty_graphics: boolean;
  sixel: boolean;
  multiplexer: string;
}
