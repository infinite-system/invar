import { Static } from 'ivue/extras';
import type { StyledText, KeyEvent } from '@opentui/core';
import { computed, ref, type Ref } from 'vue';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';
import type { GlyphLevel } from '../theme/TerminalCapabilities';
import { ThemeIcons } from '../theme/ThemeIcons';
import {
  TextSelectionModel,
  type SelectionPoint,
} from '../ui/TextSelectionModel';
import { WrapText } from '../ui/WrapText';
import { Clipboard } from '../system/Clipboard';
import { TextSegmentation } from '../system/TextSegmentation';
import { TextDocument } from '../editor/TextDocument';
import type { TextInputAction } from '../editor/TextInputModel';
import type { FindBar, FindBarTarget } from '../search/FindBar';
import type { FindInBuffer, FindInBufferMatch } from '../search/FindInBuffer';
import { AgentPaneRenderer, type SelectionRange } from './AgentPaneRenderer';
import { AgentProviderRegistry } from './AgentProviderRegistry';
import {
  AgentTranscriptSearch,
  type TranscriptMatchHighlight,
} from './AgentTranscriptSearch';
import {
  AgentTranscriptProjection,
  type ProjectedLine,
} from './AgentTranscriptProjection';
import { AgentComposer, type AgentSkillInvocation } from './AgentComposer';
import { AgentSpinner } from './AgentSpinner';
import {
  AgentThinkingIndicator,
  type ThinkingSegment,
} from './AgentThinkingIndicator';
import type { AgentSession } from './AgentSession';
import type { AgentTerminalFollowMode } from '../settings/Settings';

// invariant: The agent pane is a PaneContent citizen, not a special case (src/modules/agent/agent.invariants.md)
// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)
// invariant: Every agent turn reaches a terminal state (src/modules/agent/agent.invariants.md)
// invariant: Thinking indicator follows turn state (src/modules/agent/agent.invariants.md)
// invariant: Stream inactivity is visible and non-destructive (src/modules/agent/agent.invariants.md)
// invariant: Queued agent messages preserve order (src/modules/agent/agent.invariants.md)
// invariant: Agent transcript scroll extent is position independent (src/modules/agent/agent.invariants.md)
// invariant: Agent footer stays within its pane (src/modules/agent/agent.invariants.md)

class $AgentPaneContent implements PaneContent {
  static get TRANSCRIPT_FIND_TARGET_IDENTIFIER(): string {
    return 'agent-transcript';
  }

  protected static get TRANSCRIPT_PAD_LEFT(): number {
    return 2;
  }

  protected static get TRANSCRIPT_PAD_RIGHT(): number {
    return 2;
  }

  protected static get COMPOSER_CHROME_ROWS(): number {
    return 5;
  }

  protected static get WAITING_CYCLE_MILLISECONDS(): number {
    return 1500;
  }

  protected get agentPaneContentClass(): typeof $AgentPaneContent {
    return this.constructor as typeof $AgentPaneContent;
  }

  protected isTypedCharacter(key: KeyEvent): boolean {
    if (key.ctrl || key.meta || key.option) return false;
    const sequence = key.sequence;
    if (!sequence || TextSegmentation.Class.graphemes(sequence).length !== 1) {
      return false;
    }
    const codePoint = sequence.codePointAt(0);
    return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
  }

  readonly id: string;
  readonly kind = 'agent';
  readonly instanceLabel: string;
  readonly icon = '✦';

  /** The editable, wrapping, cap-scrolled composer (the second text surface). */
  protected readonly composer = new AgentComposer.Class();
  /** Fuses the session pulse, composer edits, the spinner frame, and view-state changes. */
  protected readonly revision: Ref<number>;
  /** Bumped on scroll/collapse/selection changes (which carry no session/composer change) so they repaint. */
  protected readonly viewRevision = ref(0);
  /** The spinner animator derives from the session's turn predicate and pane visibility. */
  protected readonly spinner: AgentSpinner.Model;
  /** True while the pane is actually painted (host-reported) — gates the spinner timer. */
  protected readonly paneVisible = ref(false);

  /** Transcript indices the user has expanded (tool rows). Default (absent) = collapsed. View state. */
  protected readonly expandedIndices = new Set<number>();
  /** The transcript text selection (read-only surface; shares the model with the composer's own). */
  protected readonly transcriptSelection = new TextSelectionModel.Class();
  /** Per pending-tool start times (tool-use id → ms), for the waiting-note's per-call elapsed. */
  protected readonly toolStartMilliseconds = new Map<string, number>();

  /** The shared scroll engine (bound by the host). Null until attached — then render tail-anchors. */
  protected scrollPort: AgentScrollPort | null = null;
  /** The engine seam (bound by the host) — current provider + cycle. Null until attached. */
  protected enginePort: AgentEnginePort | null = null;
  /** The user-owned terminal-follow setting and cycle action, bound by the host. */
  protected terminalFollowPort: AgentTerminalFollowPort | null = null;
  /** Host-owned shared FindBar + open action. The pane owns neither overlay coordination nor a second
   *  query model; it only projects the affordance and invokes the same action Ctrl+F invokes. */
  protected transcriptSearchPort: AgentTranscriptSearchPort | null = null;
  /** The search MIRROR document: a plain-text projection of the SAME projected lines the pane paints,
   *  refreshed inside render() whenever the projected text changes. It is a projection, not a second
   *  history — it can be rebuilt from the transcript at any time and holds nothing of its own. */
  // invariant: Transcript search is a projection of the transcript (src/modules/agent/agent.invariants.md)
  protected readonly transcriptSearchDocument = new TextDocument.Class();
  /** The mirror's last synchronized text (identity compare gates replaceAll + findAll re-runs). */
  protected lastTranscriptSearchText: string | null = null;
  /** The mode-line engine segment's click region, resolved last render (for the click-to-cycle hit-test). */
  protected lastEngineSegment: {
    row: number;
    startColumn: number;
    endColumn: number;
  } | null = null;
  /** The mode-line search button's click region, resolved by the same layout that paints the glyph. */
  protected lastSearchSegment: {
    row: number;
    startColumn: number;
    endColumn: number;
  } | null = null;
  /** The permission-mode setting (bound by the host) — drives the mode line + Shift+Tab toggle. */
  protected permissionMode: Ref<boolean> | null = null;

  /** Last render's geometry, so keys clamp scroll, the host reads the viewport extent, and pointer rows
   *  route to the right surface. */
  protected lastBodyHeight = 1;
  protected lastSpinnerRows = 0;
  protected lastComposerRows = 1;
  /** Pane-local row where the composer's first visible line sits (below body + spinner + blank + rule). */
  protected lastComposerStart = 3;
  protected lastTotalLines = 0;
  protected lastFirstLine = 0;
  protected lastHeight = 1;
  protected lastWidth = 0;
  /** The transcript body rows painted last frame (top-padded) — the hit map for onPointerDown. */
  protected lastBodyRows: readonly ProjectedLine[] = [];
  /** The FULL projected transcript lines last frame — the source for reconstructing selected text. */
  protected lastProjectedLines: readonly ProjectedLine[] = [];
  /** The composer caret cell (viewport-local) resolved last frame. */
  protected lastCaret = { column: 2, row: 0 };
  protected lastGlyphLevel: GlyphLevel = 'unicode';

  constructor(
    protected readonly session: AgentSession.Instance,
    identity: AgentPaneIdentity = {},
  ) {
    this.id = identity.identifier ?? 'agent';
    this.instanceLabel = identity.label ?? 'Agent';
    this.spinner = new AgentSpinner.Class(
      () => this.session.turnInFlight && this.paneVisible.value,
    );
    // MONOTONIC fuse: read every repaint source, then return a strictly increasing counter. An
    // arithmetic SUM here could cancel (spinner-stop −1 + session-bump +1 = net 0 → a finished turn
    // stuck rendering "working…", the reviewed repaint bug); a recompute now ALWAYS yields a new value.
    // Reading composer TEXT (string identity), not its length, also kills same-length-edit cancels.
    let fuseCounter = 0;
    this.revision = computed(() => {
      void this.session.renderRevision.value;
      void this.composer.text.value;
      void this.spinner.frame.value;
      void this.spinner.running;
      void this.viewRevision.value;
      void this.permissionMode?.value;
      void this.terminalFollowPort?.mode.value;
      // Transcript-search state repaints through the SAME fuse: the bar opening (which creates the
      // engine), the live query, the matches, and the cycled current match all change what the body
      // rows paint. Before the engine exists only `open` is subscribed — its flip re-runs this
      // computed, which then finds and subscribes the fresh engine.
      void this.transcriptSearchPort?.findBar.open.value;
      const transcriptSearchEngine =
        this.transcriptSearchPort?.findBar.engineFor(
          this.agentPaneContentClass.TRANSCRIPT_FIND_TARGET_IDENTIFIER,
        );
      void transcriptSearchEngine?.query.value;
      void transcriptSearchEngine?.matches.value;
      void transcriptSearchEngine?.currentMatchIndex.value;
      fuseCounter += 1;
      return fuseCounter;
    });
  }

  /** The host reports whether this pane is actually on screen (panel visible AND the agent is a visible
   *  cell). Drives the spinner's busy∧visible gate. */
  setPaneVisible(visible: boolean): void {
    if (this.paneVisible.value !== visible) this.paneVisible.value = visible;
  }
  /** True while the spinner timer is armed (tests + the visibility-gate smoke read this). */
  get spinnerActive(): boolean {
    return this.spinner.running;
  }

  get agentSession(): AgentSession.Instance {
    return this.session;
  }

  skillInvocation(): AgentSkillInvocation | null {
    return this.composer.skillInvocation();
  }

  acceptSkillInvocation(
    invocation: AgentSkillInvocation,
    skillName: string,
  ): void {
    this.composer.replaceSkillInvocation(invocation, skillName);
    this.composerHandled();
  }
  get title(): string {
    // LIVE identity: the registry's display label for the ACTIVE engine — the engine port when bound
    // (the same live resolution the mode-line segment reads, so the two can never disagree), else the
    // session's own active engine. A hard-coded 'Claude' here was the frozen-label bug: the title
    // claimed Claude regardless of the engine actually answering.
    const label = AgentProviderRegistry.Class.displayLabel(
      this.enginePort?.provider ?? this.session.activeEngine,
    );
    return this.session.turnInFlight ? `${label} (working…)` : label;
  }
  get renderRevision(): Ref<number> {
    return this.revision;
  }

  attachScrollPort(port: AgentScrollPort): void {
    this.scrollPort = port;
  }
  /** Bind the permission-mode setting (reactive) so the mode line reflects it and Shift+Tab toggles it. */
  attachPermissionMode(mode: Ref<boolean>): void {
    this.permissionMode = mode;
  }
  /** Bind the engine seam so the mode line shows the engine + click/Ctrl+E cycle it. */
  attachEnginePort(port: AgentEnginePort): void {
    this.enginePort = port;
  }
  /** Bind the terminal-follow mode so footer clicks project and mutate the same live setting. */
  attachTerminalFollowPort(port: AgentTerminalFollowPort): void {
    this.terminalFollowPort = port;
  }
  /** Bind the shared FindBar and the host-owned open action so Ctrl+F and the mode-line icon reach the
   *  same overlay-coordinated path (count, cycling, case toggle — one search vocabulary). */
  attachTranscriptSearchPort(
    transcriptSearchPort: AgentTranscriptSearchPort,
  ): void {
    this.transcriptSearchPort = transcriptSearchPort;
  }

  /** The transcript as a FindBar target: the mirror document (read-only — replace is peripheral config
   *  the target declines, the markdown preview's exact shape) plus the pane's own reveal writer. */
  findTarget(): FindBarTarget {
    return {
      identifier: this.agentPaneContentClass.TRANSCRIPT_FIND_TARGET_IDENTIFIER,
      document: this.transcriptSearchDocument,
      replaceAllowed: false,
      revealMatch: (match) => this.revealTranscriptMatch(match),
    };
  }

  /** The transcript search engine once the bar has been opened for the transcript at least once (the
   *  FindBar retains one engine per target identifier), else null — zero cost before first use. */
  protected transcriptSearchEngine(): FindInBuffer.Instance | null {
    return (
      this.transcriptSearchPort?.findBar.engineFor(
        this.agentPaneContentClass.TRANSCRIPT_FIND_TARGET_IDENTIFIER,
      ) ?? null
    );
  }

  /** Scroll the transcript viewport so the revealed match's line sits mid-body (the pane's one scroll
   *  writer for a search jump — adopt-and-stop like every other scroll authority). */
  protected revealTranscriptMatch(match: FindInBufferMatch): void {
    const scrollPort = this.scrollPort;
    if (!scrollPort) return;
    const targetTop = Math.max(
      0,
      match.line - Math.floor(this.lastBodyHeight / 2),
    );
    scrollPort.scrollRowsBy(targetTop - scrollPort.scrollTop);
    this.viewRevision.value += 1;
  }

  /** Refresh the search mirror from THIS frame's projected lines and re-derive matches when the text
   *  changed. Runs only while the engine exists AND is live (bar open on the transcript, or a retained
   *  non-empty query keeping highlights fresh) — idle sessions and never-searched panes pay nothing.
   *  Returns the engine when its matches should paint. */
  protected synchronizeTranscriptSearch(
    lines: readonly ProjectedLine[],
  ): FindInBuffer.Instance | null {
    const findBar = this.transcriptSearchPort?.findBar;
    const engine = this.transcriptSearchEngine();
    if (!findBar || !engine) return null;
    const barOpenOnTranscript =
      findBar.open.value &&
      findBar.target?.identifier ===
        this.agentPaneContentClass.TRANSCRIPT_FIND_TARGET_IDENTIFIER;
    if (!barOpenOnTranscript && engine.query.value.length === 0) return null;
    const searchableText =
      AgentTranscriptSearch.Class.searchableLineTexts(lines).join('\n');
    if (searchableText !== this.lastTranscriptSearchText) {
      this.lastTranscriptSearchText = searchableText;
      this.transcriptSearchDocument.replaceAll(searchableText.split('\n'));
      engine.findAll();
    }
    return engine;
  }
  /** The current engine label (for the frame dump / smoke), or '' when unbound. */
  get currentEngine(): string {
    return this.enginePort?.provider ?? '';
  }
  /** Cycle to the next engine (click or Ctrl+E); reveals the switch note. Returns whether it switched. */
  protected cycleEngine(): boolean {
    if (!this.enginePort?.cycle()) return false;
    this.transcriptSelection.clear();
    this.scrollPort?.scrollToBottom(); // reveal the "switched to X" system note
    this.viewRevision.value += 1;
    return true;
  }

  /** The engine changed the scroll position (wheel/momentum/keys) — bump the reactive paint signal so
   *  the frame effect re-projects the window (the viewport's scrollTop is not itself reactive). */
  notifyScrolled(): void {
    this.viewRevision.value += 1;
  }

  /** Content rows the host feeds the viewport's extent() (drives scroll clamp + scrollbar geometry). */
  get contentLineCount(): number {
    return this.lastTotalLines;
  }
  /** Visible transcript body rows the host feeds the viewport's extent(). */
  get viewportRows(): number {
    return this.lastBodyHeight;
  }
  get expandedCount(): number {
    return this.expandedIndices.size;
  }
  /** True while the view auto-sticks to the newest line (from the engine; drives the scroll smoke). */
  get stuckToBottom(): boolean {
    return this.scrollPort?.stuckToBottom ?? true;
  }
  /** The current transcript scroll position (from the engine) — drives the momentum-glide smoke. */
  get scrollTop(): number {
    return this.scrollPort?.scrollTop ?? 0;
  }

  render(context: PaneRenderContext): StyledText {
    // A width change reflows both surfaces' wrap, so any selection's coords are stale — drop them.
    if (context.width !== this.lastWidth) {
      this.transcriptSelection.clear();
      this.composer.clearSelection();
    }
    this.lastHeight = context.height;
    this.lastWidth = context.width;
    this.lastGlyphLevel = context.glyphLevel;
    const turnInFlight = this.session.turnInFlight;

    // The animated thinking indicator (busy) + the calm waiting-note (≥1 pending tool). The note adds a
    // blank gap + its own row, so the indicator block is 1 or 3 rows.
    const thinking = turnInFlight ? this.composeTurnIndicator(context) : null;
    const waitingNote = turnInFlight ? this.composeWaitingNote(context) : null;
    const indicatorRows = turnInFlight ? (waitingNote ? 3 : 1) : 0;

    // Layout top→bottom: transcript body (flex, padded L/R) · thinking · [blank · note] · blank · blank ·
    // rule · composer (1..cap) · rule · mode line · blank(bottom pad). Chrome takes fixed rows; body flexes.
    // The composer is indented by the same left gutter, so it wraps to width − padLeft.
    const composerLayout = this.composer.layout(
      context.width - this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT,
    );
    const composerRows = composerLayout.rowCount;
    const bodyHeight = Math.max(
      1,
      context.height -
        this.agentPaneContentClass.COMPOSER_CHROME_ROWS -
        composerRows -
        indicatorRows,
    );
    this.lastSpinnerRows = indicatorRows;
    this.lastComposerRows = composerRows;
    this.lastComposerStart = bodyHeight + indicatorRows + 3; // below body + indicator + 2 blanks + top rule

    // The transcript text wraps inside its L/R padding (the scrollbar column is already reserved by the
    // host via context.width).
    const textWidth = Math.max(
      1,
      context.width -
        this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT -
        this.agentPaneContentClass.TRANSCRIPT_PAD_RIGHT,
    );
    const lines = AgentTranscriptProjection.Class.project(
      this.session.transcript,
      context.palette,
      context.glyphLevel,
      textWidth,
      this.expandedIndices,
      // The greeting names the ACTIVE provider (same live source as the title + mode line).
      AgentProviderRegistry.Class.displayLabel(
        this.enginePort?.provider ?? this.session.activeEngine,
      ),
    );
    this.lastBodyHeight = bodyHeight;
    this.lastTotalLines = lines.length;
    this.lastProjectedLines = lines;

    // While tail-anchored, window at the FRESH maximum (this projection's own line count) — the engine's
    // scrollTop can lag one frame behind a synchronous whole-turn append (its extent reads the PREVIOUS
    // render's geometry), which would show the top of the log instead of the newest turn. Unstuck, honor
    // the engine's position clamped into the fresh range.
    const maximumTop = Math.max(0, lines.length - bodyHeight);
    const firstLine = this.scrollPort
      ? this.scrollPort.stuckToBottom
        ? maximumTop
        : Math.max(0, Math.min(this.scrollPort.scrollTop, maximumTop))
      : maximumTop;
    this.lastFirstLine = firstLine;

    const visible = lines.slice(firstLine, firstLine + bodyHeight);
    const padCount = Math.max(0, bodyHeight - visible.length);
    const bodyRows: ProjectedLine[] = [];
    for (let blank = 0; blank < padCount; blank += 1)
      bodyRows.push({
        text: '',
        color: context.palette.fg,
        bold: false,
        entryIndex: -1,
        toggleable: false,
      });
    for (const line of visible) bodyRows.push(line);
    this.lastBodyRows = bodyRows;

    const selectionRanges: (SelectionRange | null)[] = bodyRows.map(
      (row, rowIndex) => {
        if (rowIndex < padCount) return null;
        const absoluteLine = firstLine + (rowIndex - padCount);
        return this.transcriptSelection.rangeForLine(
          absoluteLine,
          WrapText.Class.displayWidth(row.text),
        );
      },
    );

    // Transcript search: refresh the mirror projection, then derive each visible row's match spans
    // (display cells) for the renderer's per-row highlight machinery. Empty everywhere when no search.
    const transcriptSearchEngine = this.synchronizeTranscriptSearch(lines);
    const searchMatches = transcriptSearchEngine?.matches.value ?? [];
    const searchCurrentMatchIndex =
      transcriptSearchEngine?.currentMatchIndex.value ?? -1;
    const searchHighlights: (readonly TranscriptMatchHighlight[])[] =
      bodyRows.map((row, rowIndex) => {
        if (rowIndex < padCount || searchMatches.length === 0) return [];
        const absoluteLine = firstLine + (rowIndex - padCount);
        return AgentTranscriptSearch.Class.highlightsForLine(
          row.text,
          absoluteLine,
          searchMatches,
          searchCurrentMatchIndex,
        );
      });

    // The rule is inset by the L/R gutter too (side margins → airier canvas).
    const ruleWidth = Math.max(
      1,
      context.width -
        this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT -
        this.agentPaneContentClass.TRANSCRIPT_PAD_RIGHT,
    );
    const rule = ThemeIcons.Class.agentTranscriptIconsFor(
      context.glyphLevel,
    ).rule.repeat(ruleWidth);

    // The composer caret sits on its last visible row inside the frame, shifted right by the left gutter.
    this.lastCaret = {
      column:
        this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT +
        composerLayout.caretColumn,
      row: this.lastComposerStart + composerLayout.caretRow,
    };

    const modeLineRow = this.lastComposerStart + composerLayout.rowCount + 1; // below composer + bottom rule
    return AgentPaneRenderer.Class.render({
      palette: context.palette,
      padLeft: this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT,
      bodyRows,
      selectionRanges,
      searchHighlights,
      thinking,
      waitingNote,
      rule,
      composer: composerLayout.rows,
      modeLine: this.modeLineSegments(context, modeLineRow),
      focused: context.focused,
    });
  }

  /** The mode line: ENGINE, PERMISSION, then SEARCH.
   *  The layout records button cell ranges while emitting their segments, so paint and hit-test share
   *  one geometry source. */
  protected modeLineSegments(
    context: PaneRenderContext,
    modeLineRow: number,
  ): ThinkingSegment[] {
    const bypass = this.permissionMode?.value ?? false;
    const askSupported = this.session.permissionPromptsSupported;
    const permissionText = bypass
      ? 'perm: bypass'
      : askSupported
        ? 'perm: ask'
        : 'perm: bypass-only';

    const segments: ThinkingSegment[] = [
      {
        text: ' '.repeat(this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT),
        color: context.palette.dim,
        bold: false,
      },
    ];
    let modeLineColumn = this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT;
    const maximumModeLineColumn = Math.max(0, Math.floor(context.width));
    const appendText = (
      text: string,
      color: string,
      maximumWidth = Number.MAX_SAFE_INTEGER,
    ): { startColumn: number; endColumn: number } | null => {
      const remainingWidth = Math.max(
        0,
        maximumModeLineColumn - modeLineColumn,
      );
      const visibleText = WrapText.Class.sliceByDisplayCells(
        text,
        0,
        Math.min(remainingWidth, maximumWidth),
      );
      const visibleWidth = WrapText.Class.displayWidth(visibleText);
      if (visibleWidth === 0) return null;
      const range = {
        startColumn: modeLineColumn,
        endColumn: modeLineColumn + visibleWidth,
      };
      segments.push({ text: visibleText, color, bold: false });
      modeLineColumn = range.endColumn;
      return range;
    };
    const separatorText = ' · ';
    const searchButtonText = this.transcriptSearchPort
      ? ` ${ThemeIcons.Class.findIconsFor(context.glyphLevel).search} `
      : '';
    const reservedWidth =
      WrapText.Class.displayWidth(separatorText) +
      WrapText.Class.displayWidth(permissionText) +
      (searchButtonText
        ? WrapText.Class.displayWidth(separatorText) +
          WrapText.Class.displayWidth(searchButtonText)
        : 0);

    // Engine segment (only when bound). The cycle affordance shows when >1 engine is switchable.
    this.lastEngineSegment = null;
    if (this.enginePort) {
      const cyclable = this.enginePort.canCycle;
      const cycleGlyph = cyclable
        ? context.glyphLevel === 'ascii'
          ? ' <->'
          : ' ⇄'
        : '';
      const engineText = `${this.enginePort.provider}${cycleGlyph}`;
      const maximumEngineWidth = Math.max(
        1,
        maximumModeLineColumn - modeLineColumn - reservedWidth,
      );
      const engineRange = appendText(
        engineText,
        cyclable ? context.palette.accent : context.palette.dim,
        maximumEngineWidth,
      );
      if (engineRange) {
        this.lastEngineSegment = { row: modeLineRow, ...engineRange };
        appendText(separatorText, context.palette.dim);
      }
    }

    appendText(
      permissionText,
      bypass
        ? context.palette.accent
        : askSupported
          ? context.palette.info
          : context.palette.dim,
    );

    // Search is a compact chrome button beside the engine control. Its glyph comes from the SAME
    // semantic find-icon ladder the FindBar itself uses; the padded cells form its mouse target.
    this.lastSearchSegment = null;
    if (this.transcriptSearchPort && searchButtonText) {
      appendText(separatorText, context.palette.dim);
      const searchIsOpen =
        this.transcriptSearchPort.findBar.open.value &&
        this.transcriptSearchPort.findBar.target?.identifier ===
          this.agentPaneContentClass.TRANSCRIPT_FIND_TARGET_IDENTIFIER;
      const searchRange = appendText(
        searchButtonText,
        searchIsOpen ? context.palette.accent : context.palette.info,
      );
      if (searchRange) {
        this.lastSearchSegment = { row: modeLineRow, ...searchRange };
      }
    }
    return segments;
  }

  /** Pending tool calls = tool-use entries with no matching tool-result yet, in emission order.
   *  Derived PURELY from the transcript (real session state) — no invented flags. */
  protected pendingTools(): { id: string; name: string }[] {
    const pending = new Map<string, string>();
    for (const entry of this.session.transcript) {
      if (entry.role === 'tool-use') pending.set(entry.id, entry.name);
      else if (entry.role === 'tool-result') pending.delete(entry.id);
    }
    return [...pending].map(([id, name]) => ({ id, name }));
  }

  /** Compose the calm waiting-note: CYCLE through the pending tools (~1.5s each), each with its own
   *  elapsed time (tracked from when its tool-use first appeared), with a gentle pulse on switch. */
  protected composeWaitingNote(
    context: PaneRenderContext,
  ): ThinkingSegment[] | null {
    const pending = this.pendingTools();
    const now = this.spinner.nowMilliseconds();
    // Track per-tool start times; add newcomers, prune resolved ones (so elapsed is per-call, honest).
    const liveIds = new Set(pending.map((tool) => tool.id));
    for (const id of [...this.toolStartMilliseconds.keys()])
      if (!liveIds.has(id)) this.toolStartMilliseconds.delete(id);
    for (const tool of pending)
      if (!this.toolStartMilliseconds.has(tool.id))
        this.toolStartMilliseconds.set(tool.id, now);
    if (pending.length === 0) return null;

    const cycleIndex =
      Math.floor(now / this.agentPaneContentClass.WAITING_CYCLE_MILLISECONDS) %
      pending.length;
    const active = pending[cycleIndex]!;
    const startMilliseconds = this.toolStartMilliseconds.get(active.id) ?? now;
    const elapsedSeconds = Math.max(
      0,
      Math.floor((now - startMilliseconds) / 1000),
    );
    // Pulse for the first ~300ms of each cycle window (the switch moment), only when there is >1 to cycle.
    const highlight =
      pending.length > 1 &&
      now % this.agentPaneContentClass.WAITING_CYCLE_MILLISECONDS < 300;
    return AgentThinkingIndicator.Class.composeWaitingNote({
      toolName: active.name,
      elapsedSeconds,
      pendingCount: pending.length,
      highlight,
      glyphLevel: context.glyphLevel,
      palette: context.palette,
    });
  }

  protected composeTurnIndicator(
    context: PaneRenderContext,
  ): ThinkingSegment[] {
    const segments = AgentThinkingIndicator.Class.compose({
      frameIndex: this.spinner.frame.value,
      elapsedSeconds: this.spinner.elapsedSeconds(),
      glyphLevel: context.glyphLevel,
      colorDepth: context.colorDepth,
      palette: context.palette,
    });
    const stalled = this.session.turnState.value === 'stalled';
    segments.push({
      text: stalled ? '  stalled — esc to cancel' : '  esc to cancel',
      color: stalled ? context.palette.warning : context.palette.dim,
      bold: stalled,
    });
    return segments;
  }

  handleKey(key: KeyEvent): boolean {
    // Shift+Tab cycles the permission mode (a boolean → on↔off); the mode line updates live.
    if ((key.name === 'tab' && key.shift) || key.name === 'backtab') {
      if (this.permissionMode) {
        this.permissionMode.value = !this.permissionMode.value;
        this.viewRevision.value += 1;
      }
      return true;
    }
    // Ctrl+E cycles the engine (claude ⇄ codex), swapping the backend behind the same transcript. No-op
    // while busy (the session guards the swap) — so it never disrupts an in-flight turn.
    if (key.ctrl && !key.meta && !key.option && key.name === 'e') {
      this.cycleEngine();
      return true;
    }
    // A PENDING PERMISSION owns the keyboard: y = allow · a = always-allow (session) · n / Escape =
    // deny. Scroll keys (PageUp/Down) stay live so the user can review context; every other key is
    // swallowed while the prompt is up (the composer is suspended — no accidental typing answers it).
    const pendingPermission = this.session.pendingPermission;
    if (pendingPermission) {
      if (key.name === 'pageup') {
        this.scrollPort?.scrollRowsBy(-(this.lastBodyHeight - 1));
        return true;
      }
      if (key.name === 'pagedown') {
        this.scrollPort?.scrollRowsBy(this.lastBodyHeight - 1);
        return true;
      }
      if (!key.ctrl && !key.meta && !key.option && !key.super) {
        if (key.name === 'y') {
          this.session.respondToPermission(pendingPermission.id, 'allow');
          return true;
        }
        if (key.name === 'a') {
          this.session.respondToPermission(
            pendingPermission.id,
            'always-allow',
          );
          return true;
        }
        if (key.name === 'n' || key.name === 'escape') {
          this.session.respondToPermission(pendingPermission.id, 'deny');
          return true;
        }
      }
      return true; // swallow everything else while the prompt is up
    }
    if (key.name === 'return') {
      // Clear the draft ONLY when the session accepted it — Enter while busy must keep the follow-up
      // draft intact (unconditional clearing destroyed it, the reviewed data loss).
      if (this.session.send(this.composer.value)) {
        this.composer.clear();
        this.transcriptSelection.clear();
        this.scrollPort?.scrollToBottom(); // sending re-anchors to the newest output
      }
      return true;
    }
    // Transcript paging always works (the composer keeps the arrow keys for cursor motion).
    if (key.name === 'pageup') {
      this.scrollPort?.scrollRowsBy(-(this.lastBodyHeight - 1));
      return true;
    }
    if (key.name === 'pagedown') {
      this.scrollPort?.scrollRowsBy(this.lastBodyHeight - 1);
      return true;
    }
    // Alt/Option/Ctrl → move by WORD (mac overlay uses Option); super/Cmd → jump to line start/end.
    const byWord = key.ctrl || key.option || key.meta;
    if (key.name === 'left') {
      if (key.super) this.composer.moveHome();
      else if (byWord) this.composer.moveWordLeft();
      else this.composer.moveLeft();
      return this.composerHandled();
    }
    if (key.name === 'right') {
      if (key.super) this.composer.moveEnd();
      else if (byWord) this.composer.moveWordRight();
      else this.composer.moveRight();
      return this.composerHandled();
    }
    if (key.name === 'home') {
      this.composer.moveHome();
      return this.composerHandled();
    }
    if (key.name === 'end') {
      this.composer.moveEnd();
      return this.composerHandled();
    }
    // Up/Down move the composer cursor between its visual lines; at the first/last line they fall
    // through to transcript scroll (an empty single-line composer therefore scrolls, as before).
    if (key.name === 'up') {
      if (this.composer.moveUp()) return this.composerHandled();
      this.scrollPort?.scrollRowsBy(-1);
      return true;
    }
    if (key.name === 'down') {
      if (this.composer.moveDown()) return this.composerHandled();
      this.scrollPort?.scrollRowsBy(1);
      return true;
    }
    if (key.name === 'backspace') {
      // Ctrl/Cmd+Backspace clears the whole line; Alt/Option+Backspace deletes the word BEFORE the
      // cursor; plain Backspace deletes the grapheme before the cursor.
      if (key.ctrl || key.super) this.composer.deleteLine();
      else if (key.option || key.meta) this.composer.deletePreviousWord();
      else this.composer.backspace();
      return this.composerHandled();
    }
    if (key.name === 'delete') {
      if (key.option || key.meta) this.composer.deleteNextWord();
      else this.composer.deleteForward();
      return this.composerHandled();
    }
    if (this.isTypedCharacter(key)) {
      this.composer.insert(key.sequence);
      return this.composerHandled();
    }
    return false;
  }

  /** A composer edit/motion happened: bump the paint signal (a cursor-only move changes no observed ref,
   *  so the caret would not repaint otherwise) and report the key handled. */
  protected composerHandled(): boolean {
    this.viewRevision.value += 1;
    return true;
  }

  applyComposerInputAction(action: TextInputAction): void {
    this.composer.applyInputAction(action);
    this.composerHandled();
  }

  cancelTurn(): boolean {
    return this.session.interrupt();
  }

  /** A pointer-down inside the pane at content-local (column, row): run a mode-line action or toggle a
   *  tool row's expand state. Called by the host for a BARE transcript click and for chrome rows. */
  onPointerDown(column: number, row: number): boolean {
    const engine = this.lastEngineSegment;
    if (
      engine &&
      this.enginePort?.canCycle &&
      row === engine.row &&
      column >= engine.startColumn &&
      column < engine.endColumn
    ) {
      return this.cycleEngine();
    }
    const search = this.lastSearchSegment;
    if (
      search &&
      row === search.row &&
      column >= search.startColumn &&
      column < search.endColumn
    ) {
      // invariant: No action requires a memorized motion (project.invariants.md)
      this.transcriptSearchPort?.open();
      return true;
    }
    const line = this.lastBodyRows[row];
    if (!line || line.entryIndex < 0) return false;
    if (this.session.sendQueuedMessage(line.entryIndex)) {
      this.transcriptSelection.clear();
      this.scrollPort?.scrollToBottom();
      this.viewRevision.value += 1;
      return true;
    }
    if (!line.toggleable) return false;
    if (this.expandedIndices.has(line.entryIndex))
      this.expandedIndices.delete(line.entryIndex);
    else this.expandedIndices.add(line.entryIndex);
    this.transcriptSelection.clear(); // expand/collapse reflows lines, invalidating selection coords
    this.viewRevision.value += 1;
    return true;
  }

  // --- region routing + selection (host maps screen cells; this pane owns the models) ----------------

  /** Which surface a pane-local row (0 at the pane's top) belongs to. Rows outside the transcript body
   *  and composer input (spinner, blank, rules, mode line) are inert 'other'. */
  regionAtRow(localRow: number): AgentPaneRegion {
    if (localRow < this.lastBodyHeight) return { kind: 'transcript', localRow };
    const composerEnd = this.lastComposerStart + this.lastComposerRows;
    if (localRow >= this.lastComposerStart && localRow < composerEnd) {
      return {
        kind: 'composer',
        visibleRow: localRow - this.lastComposerStart,
      };
    }
    return { kind: 'other' };
  }

  /** Map a transcript-region local row to an absolute projected-line index (clamped). */
  protected transcriptLineAtRow(localRow: number): number {
    const visibleCount = Math.min(
      this.lastBodyHeight,
      Math.max(0, this.lastTotalLines - this.lastFirstLine),
    );
    const padCount = Math.max(0, this.lastBodyHeight - visibleCount);
    const absolute = this.lastFirstLine + (localRow - padCount);
    return Math.max(
      0,
      Math.min(absolute, Math.max(0, this.lastTotalLines - 1)),
    );
  }

  // Transcript selection (driven by the ScrollableTextViewport drag through the host). The transcript
  // text is inset by TRANSCRIPT_PAD_LEFT, so the pointer column subtracts that gutter.
  transcriptPointAt(localColumn: number, localRow: number): SelectionPoint {
    return {
      line: this.transcriptLineAtRow(localRow),
      column: Math.max(
        0,
        localColumn - this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT,
      ),
    };
  }
  beginTranscriptSelection(point: SelectionPoint): void {
    this.composer.clearSelection();
    this.transcriptSelection.begin(point);
    this.viewRevision.value += 1;
  }
  extendTranscriptSelection(point: SelectionPoint): void {
    this.transcriptSelection.extend(point);
    this.viewRevision.value += 1;
  }
  finishTranscriptSelection(): void {
    this.transcriptSelection.finish();
    this.viewRevision.value += 1;
  }
  transcriptLineGraphemeCount(lineIndex: number): number {
    // DISPLAY cells (the drag's inclusive-head clamp works in the pointer's own unit).
    return WrapText.Class.displayWidth(
      this.lastProjectedLines[lineIndex]?.text ?? '',
    );
  }

  // Composer selection (a small manual drag through the host — no momentum/edge-autoscroll). The composer
  // is inset by the left gutter too, so the pointer column subtracts it before mapping into composer space.
  composerPointAt(localColumn: number, visibleRow: number): SelectionPoint {
    return this.composer.pointAt(
      localColumn - this.agentPaneContentClass.TRANSCRIPT_PAD_LEFT,
      visibleRow,
    );
  }
  beginComposerSelection(point: SelectionPoint): void {
    this.transcriptSelection.clear();
    this.composer.beginSelection(point);
    this.viewRevision.value += 1;
  }
  extendComposerSelection(point: SelectionPoint): void {
    this.composer.extendSelection(point);
    this.viewRevision.value += 1;
  }
  finishComposerSelection(): void {
    this.composer.finishSelection();
    this.viewRevision.value += 1;
  }

  /** True when either surface holds a non-empty selection (routes Ctrl+C / Cmd+C to it). */
  hasSelection(): boolean {
    return (
      this.composer.hasSelection() || this.transcriptSelection.hasSelection()
    );
  }
  /** Copy whichever surface has a selection (composer wins when both, but only one is ever set at a
   *  time). Resolves to the character count copied — the observable proof channel. */
  async copySelection(): Promise<number> {
    if (this.composer.hasSelection()) return this.composer.copySelection();
    if (!this.transcriptSelection.hasSelection()) return 0;
    // Surface-owned reconstruction: transcript rows are separate visual lines joined with newlines;
    // each line slice is grapheme-safe over DISPLAY cells through the shared WrapText slicer.
    const text = this.transcriptSelection.selectedText(
      (line, startCell, endCell) => {
        const rowText = this.lastProjectedLines[line]?.text;
        if (rowText === undefined) return null;
        return WrapText.Class.sliceByDisplayCells(
          rowText,
          startCell,
          endCell ?? Number.MAX_SAFE_INTEGER,
        );
      },
      '\n',
    );
    if (!text) return 0;
    await Clipboard.Class.copy(text);
    return text.length;
  }
  /** Drop any selection on either surface. */
  clearSelection(): void {
    const cleared = this.transcriptSelection.clear();
    const composerCleared = this.composer.clearSelection();
    if (cleared || composerCleared) this.viewRevision.value += 1;
  }

  /** A paste into the composer: insert at the caret (newlines flatten to spaces). */
  handlePaste(text: string): boolean {
    if (!text) return false;
    this.composer.insert(text);
    return true;
  }

  caret(): { column: number; row: number } | null {
    return {
      column: this.lastCaret.column,
      row: Math.max(0, Math.min(this.lastCaret.row, this.lastHeight - 1)),
    };
  }

  onResize(_columns: number, _rows: number): void {
    /* the surfaces reflow purely from width at render time; nothing to push down a seam */
  }
  onFocus(): void {
    /* no focus-specific state; the composer caret follows context.focused */
  }
  onBlur(): void {
    /* no-op */
  }
  dispose(): void {
    this.spinner.dispose();
    this.session.dispose();
  }
}

export namespace AgentPaneContent {
  export const $Class = Static($AgentPaneContent);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface AgentPaneIdentity {
  identifier?: string;
  label?: string;
}

export interface AgentScrollPort {
  readonly scrollTop: number;
  readonly stuckToBottom: boolean;
  scrollRowsBy(deltaRows: number): void;
  scrollToBottom(): void;
}

export interface AgentEnginePort {
  readonly provider: string;
  readonly canCycle: boolean;
  cycle(): boolean;
}

export interface AgentTranscriptSearchPort {
  readonly findBar: FindBar.Instance;
  open(): void;
}

export interface AgentTerminalFollowPort {
  readonly mode: Ref<AgentTerminalFollowMode>;
}

export type AgentPaneRegion =
  | { readonly kind: 'transcript'; readonly localRow: number }
  | { readonly kind: 'composer'; readonly visibleRow: number }
  | { readonly kind: 'other' };
