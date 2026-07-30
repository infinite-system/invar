// The composable-view seam: the honest minimal shape of "a thing that occupies a pane slot". A
// PanelHost hosts a SWITCHABLE SET of these, and each is interchangeable. An Output view, a Problems
// list, or another plugin pane can use the same shape with zero host rewiring.
//
// A pane content renders its region to cells, consumes focused input, and owns a reactive paint
// signal so async producers (a PTY, a log tail) repaint through the single frame effect. The
// terminal, agent, file tree, Git, database, extensions, structure, tasks dashboard, and source-text
// editor are citizens today; the Markdown panes remain an incremental follow-up. A content knows
// nothing about the host, the split, or where it is mounted.
//
// A content projects through EXACTLY ONE surface. Most return a StyledText from `render` and the
// host paints it into a host-owned body. One that owns native OpenTUI renderables — the source-text
// editor, whose native selection and layout-anchored caret are the point — declares the
// `native-surface` capability instead and paints them itself. Hosts never choose between those two:
// they call `PaneProjection.paint`, which resolves the capability.
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
import type { StyledText } from '@opentui/core';
import type { KeyEvent } from '@opentui/core';
import type { Ref } from 'vue';
import type { MomentumOptions } from '../system/Momentum';
import type { TextInputAction } from '../text/TextInputModel';
import type { Palette } from '../theme/ThemePalettes';
import type {
  GlyphLevel,
  ColorDepth,
  GraphicsTier,
} from '../theme/TerminalCapabilities';
import type {
  SplitterElement,
  SplitterElementGeometry,
} from './SplitterElement';

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
  /** Optional content-chosen title colour. Absent means the host's own focused/idle convention —
   *  a content only names a colour when the colour carries meaning (a dirty-file title). */
  readonly titleColor?: string;
  /** Optional activity-bar label when the pane heading and affordance use different established names. */
  readonly activityLabel?: string;
  /** Optional switcher glyph. */
  readonly icon?: string;
  /** Optional command identifier taught by an activity-bar affordance. */
  readonly activityAction?: string;
  /** Optional compact activity badge. Zero hides it. */
  readonly activityBadge?: number;
  /** Optional keybinding context owned by this content while its host has focus. */
  readonly keybindingContext?: string;
  /** Optional veto on an action resolved in this content's own keybinding context. A content that
   *  declines lets the keystroke fall through to `handleKey` as raw input — that is how a terminal
   *  selection owns Ctrl+C while an empty selection still sends SIGINT to the child. Absent means
   *  every action resolved in the content's context is claimed. */
  claimsContextAction?(action: string): boolean;
  /** Optional stream of human-readable notes this content emits about its own activity. The host
   *  relays them to whatever surface displays notes; it never composes or parses them. Returns an
   *  unsubscribe. */
  onSystemNote?(listener: (note: string) => void): () => void;
  /** Optional named port this content offers to another plugin, resolved by identifier so neither
   *  side needs the other's concrete class. The host only relays the identifier the CONSUMER asks
   *  for; it never learns what backs the port. */
  capability?<Port>(identifier: string): Port | null;
  /** A ref bumped whenever the content's projection changes (observed by the frame effect so an
   *  async change repaints without a keypress). */
  readonly renderRevision: Readonly<Ref<unknown>>;
  /** Project the content into cells for the given region. Omitted ONLY by a content that declares
   *  the `native-surface` capability and paints its own renderables — never both, never neither.
   *  Hosts call `PaneProjection.paint`, which resolves which of the two this content is. */
  render?(context: PaneRenderContext): StyledText;
  /** Optional native caret cell (viewport-local column/row) so the host can place the terminal-style
   *  block cursor. Contents with no caret (a log view) omit this. */
  caret?(): { column: number; row: number } | null;
  /** Consume a keystroke while the panel is focused; return true if it was handled. */
  handleKey(key: KeyEvent): boolean;
  /** Optional: a wheel gesture over this cell, in signed content rows (negative = toward older/up,
   *  positive = toward newer/down); magnitude is the settings-sourced step. True if it was consumed. */
  onWheel?(rowDelta: number, context?: PaneWheelContext): boolean;
  /** Optional horizontal-wheel counterpart, in signed content columns. */
  onHorizontalWheel?(columnDelta: number, context?: PaneWheelContext): boolean;
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
  readonly scrollLeft?: number;
  readonly scrollContentColumns?: number;
  readonly scrollViewportColumns?: number;
  haltHorizontalScrollMomentum?(): void;
  scrollToColumn?(column: number): void;
  /** Optional hover projection in content-local cells. */
  onPointerMove?(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean;
  /** Optional display-only tooltip at a content-local cell. The host owns dwell and projection. */
  tooltipAt?(column: number, row: number): string | null;
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
  onPointerDrag?(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean;
  onPointerUp?(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean;
  /** Consume a bulk-text paste (clipboard / dictation) while the panel is focused; return true if it
   *  was handled. Optional — a content that has no text sink (a read-only log) omits it. */
  handlePaste?(text: string): boolean;
  /** The panel's region resized to this many cell columns × rows. */
  onResize(columns: number, rows: number): void;
  /** Optional resizable boundaries owned by this content and mounted by its host. */
  splitters?(): readonly PaneContentSplitter[];
  /** The panel gained keyboard focus. */
  onFocus(): void;
  /** The panel lost keyboard focus. */
  onBlur(): void;
  /** Release owned resources. */
  dispose(): void;
}

/** The `native-surface` capability: a pane content that owns OpenTUI renderables and paints them
 *  itself. The host mounts nothing of the content's own — it hands over a slot box once and then
 *  calls `paint` exactly where it would otherwise assign a `render()` StyledText into a host body.
 *  It never learns what is inside, which renderables exist, or how many.
 *
 *  A native surface pays for that autonomy by answering two questions the host can no longer
 *  derive: where its caret sits, and which screen region it actually painted.
 *  invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md) */
export interface PaneNativeSurfacePort {
  /** Project for this region by painting the renderables this content owns. Native selection is
   *  applied inside this call, after the content is set, so a selection never maps onto the
   *  previous frame's buffer. */
  paint(context: PaneRenderContext): void;
  /** The native block caret in SCREEN cells, or null when this content shows none. Screen cells,
   *  not region-local ones, because the host does not own the renderable the caret sits in. This
   *  answers WHERE the caret is; whether this pane owns the keyboard stays the host's ladder. */
  caretAnchor(): { column: number; row: number } | null;
  /** The screen region this content painted, for host-owned overlays that must anchor to what was
   *  actually drawn — a scrollbar track, an out-of-band image placement. Null before first layout. */
  surfaceRegion(): PaneSurfaceRegion | null;
}

/** A painted region in screen cells. */
export interface PaneSurfaceRegion {
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
}

/** The `text-selection` capability: any pane whose visible selection can be copied. */
export interface PaneTextSelectionPort {
  hasSelection(): boolean;
  copySelection(): Promise<number>;
}

/** The `text-input` capability: a pane-owned one-line input that uses the shared input model. */
export interface PaneTextInputPort {
  applyInputAction(action: TextInputAction): void;
  copyInputSelection(): Promise<number>;
}

export interface PaneContentSplitter {
  /** Stable status/probe identity for the contributed splitter. */
  readonly id: string;
  /** Shared paint, hit-test, hover, and captured-drag controller. */
  readonly element: SplitterElement.Model;
  /** Content-local geometry resolved from the same projection that drew the pane. */
  geometry(): SplitterElementGeometry;
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
  /** The image-preview capability ladder selected by the host's one detector. */
  graphicsTier?: GraphicsTier;
  /** Screen-cell origin for a content-owned out-of-band pixel placement. */
  screenColumn?: number;
  /** Screen-cell origin for a content-owned out-of-band pixel placement. */
  screenRow?: number;
  /** True while a modal owns the screen and out-of-band graphics must withdraw. */
  screenObscured?: boolean;
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
