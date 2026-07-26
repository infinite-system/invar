// The composable-view seam: the honest minimal shape of "a thing that occupies a pane slot". A
// PanelHost hosts a SWITCHABLE SET of these, and each is interchangeable — the terminal is the first
// citizen today; an Output view, a Problems list, or a plugin panel is the same shape tomorrow with
// zero host rewiring. Deliberately NOT retrofitted onto the existing editor/git/tree/markdown panes
// yet (that is an incremental follow-up) — this defines the seam and proves it with one instance.
//
// A pane content renders its region to cells, consumes focused input, and owns a reactive paint
// signal so async producers (a PTY, a log tail) repaint through the single frame effect. The terminal,
// agent, and file tree are citizens today; the editor, git, and Markdown panes remain incremental
// follow-ups. A content knows nothing about the host, the split, or where it is mounted.
import type { StyledText } from '@opentui/core';
import type { KeyEvent } from '@opentui/core';
import type { Ref } from 'vue';
import type { MomentumOptions } from '../system/Momentum';
import type { Palette } from '../theme/ThemePalettes';
import type { GlyphLevel, ColorDepth } from '../theme/TerminalCapabilities';

/** A switchable occupant of any PanelHost-backed slot. */
export interface PaneContent {
  /** Stable identity used by the switcher (unique within a PanelHost). */
  readonly id: string;
  /** Shared-generator kind. Multiple independently owned instances may have the same kind. */
  readonly kind?: string;
  /** Stable user-facing instance name (Terminal, Terminal 2, Agent 2). */
  readonly instanceLabel?: string;
  /** Human-readable name shown in this content region's own heading. */
  readonly title: string;
  /** Optional switcher glyph. */
  readonly icon?: string;
  /** Optional command identifier taught by an activity-bar affordance. */
  readonly activityAction?: string;
  /** Optional compact activity badge. Zero hides it. */
  readonly activityBadge?: number;
  /** Optional keybinding context owned by this content while its host has focus. */
  readonly keybindingContext?: string;
  /** A ref bumped whenever the content's projection changes (observed by the frame effect so an
   *  async change repaints without a keypress). */
  readonly renderRevision: Ref<number>;
  /** Project the content into cells for the given region. */
  render(context: PaneRenderContext): StyledText;
  /** Optional native caret cell (viewport-local column/row) so the host can place the terminal-style
   *  block cursor. Contents with no caret (a log view) omit this. */
  caret?(): { column: number; row: number } | null;
  /** Consume a keystroke while the panel is focused; return true if it was handled. */
  handleKey(key: KeyEvent): boolean;
  /** Optional: a wheel gesture over this cell, in signed content rows (negative = toward older/up,
   *  positive = toward newer/down); magnitude is the settings-sourced step. True if it was consumed. */
  onWheel?(rowDelta: number, context?: PaneWheelContext): boolean;
  /** Optional horizontal-wheel counterpart, in signed content columns. */
  onHorizontalWheel?(columnDelta: number): boolean;
  /** Advance content-owned scroll momentum for one frame. True keeps the demand-driven frame loop live. */
  tickScroll?(deltaSeconds: number): boolean;
  /** Optional scroll projection. The host supplies settings-derived physics and paints the shared bar. */
  attachViewportScrollPort?(scrollPort: PaneScrollPort): void;
  readonly scrollTop?: number;
  readonly scrollContentRows?: number;
  readonly scrollViewportRows?: number;
  readonly scrollbarRowOffset?: number;
  haltScrollMomentum?(): void;
  scrollToLine?(line: number): void;
  /** Optional hover projection in content-local cells. */
  onPointerMove?(column: number, row: number): boolean;
  /** Optional pointer-leave notification for clearing transient hover state. */
  onPointerOut?(): void;
  /** Optional: a pointer-down inside this cell at content-local (column, row) — for click hit-testing
   *  (e.g. toggling a collapsed row). True if it was consumed (a repaint is requested for it). */
  onPointerDown?(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean;
  /** Optional continuation/end of a pointer drag begun inside this content. */
  onPointerDrag?(column: number, row: number): boolean;
  onPointerUp?(column: number, row: number): boolean;
  /** Consume a bulk-text paste (clipboard / dictation) while the panel is focused; return true if it
   *  was handled. Optional — a content that has no text sink (a read-only log) omits it. */
  handlePaste?(text: string): boolean;
  /** The panel's region resized to this many cell columns × rows. */
  onResize(columns: number, rows: number): void;
  /** The panel gained keyboard focus. */
  onFocus(): void;
  /** The panel lost keyboard focus. */
  onBlur(): void;
  /** Release owned resources. */
  dispose(): void;
}

/** What a pane content is handed to render itself into a hosted pane slot. */
export interface PaneRenderContext {
  /** Inner cell columns available to the content. */
  width: number;
  /** Inner cell rows available to the content. */
  height: number;
  palette: Palette;
  /** The active glyph fallback tier (nerd → unicode → ascii) — one source for every pane's icons. */
  glyphLevel: GlyphLevel;
  /** The active colour depth (truecolor → 256 → 16) — one source for every pane's gradient fallback. */
  colorDepth: ColorDepth;
  /** True while the panel owns the keyboard (content may paint focus affordances). */
  focused: boolean;
}

export interface PaneWheelContext {
  /** Content-local cell under the wheel event. */
  readonly column: number;
  readonly row: number;
  readonly modifiers: {
    readonly alt: boolean;
    readonly shift: boolean;
    readonly ctrl: boolean;
  };
}

export interface PanePointerContext {
  readonly screenColumn: number;
  readonly screenRow: number;
  readonly button: number;
  readonly modifiers: {
    readonly alt: boolean;
    readonly shift: boolean;
    readonly ctrl: boolean;
  };
}

export interface PaneScrollPort {
  momentumOptions(): MomentumOptions;
  requestRender(): void;
}
