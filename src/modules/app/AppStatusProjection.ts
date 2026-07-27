// Deterministic observability projection: read the live application ports and assemble the one
// StatusChannel snapshot consumed by the driven verification harness.
import { Static } from 'ivue/extras';
import { AgentPaneContent } from '../agent/AgentPaneContent';
import type { AgentSkillPopup } from '../agent/AgentSkillPopup';
import { CommandRegistry } from '../commands/CommandRegistry';
import { BracketMatch } from '../editor/BracketMatch';
import { NarrationProjection } from '../narration/NarrationProjection';
import { FindBar } from '../search/FindBar';
import { QuickOpen } from '../search/QuickOpen';
import { Settings } from '../settings/Settings';
import { SettingsPanel } from '../settings/SettingsPanel';
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import { StatusChannel, type StatusSnapshot } from '../system/StatusChannel';
import { ContextMenu } from '../ui/ContextMenu';
import { BoundedListPopup } from '../ui/BoundedListPopup';
import { CompletionPopup } from '../ui/CompletionPopup';
import { PanelHost } from '../ui/PanelHost';
import type { RootView } from '../ui/RootView';
import { ShortcutHelp } from '../ui/ShortcutHelp';
import { Tooltip } from '../ui/Tooltip';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { TerminalPaneContent } from '../terminal/TerminalPaneContent';
import type { StatusProjectionContributions } from './StatusProjectionContributions';

class $AppStatusProjection {
  static publish(ports: AppStatusProjectionPorts): Partial<StatusSnapshot> {
    const snapshot = this.snapshot(ports);
    StatusChannel.Class.update(snapshot);
    return snapshot;
  }

  static snapshot(ports: AppStatusProjectionPorts): Partial<StatusSnapshot> {
    const editor = ports.workspaceSet.active.editor;
    const openInputOverlays = [
      ...(ports.findBar.open.value ? ['findBar'] : []),
      ...(ports.quickOpen.open.value ? ['quickOpen'] : []),
      ...(ports.commands.open.value ? ['commandPalette'] : []),
      ...(ports.settingsPanel.open.value ? ['settingsPanel'] : []),
      ...(ports.contextMenu.open.value ? ['contextMenu'] : []),
      ...(ports.boundedListPopup.open.value ? ['boundedListPopup'] : []),
      ...(ports.shortcutHelp.open.value ? ['shortcutHelp'] : []),
    ];
    return {
      mouse: ports.mouse,
      activeWorkspace: ports.workspaceSet.active.name.value,
      workspaces: ports.workspaceSet
        .tabs()
        .map((workspaceTab) => workspaceTab.name),
      activeWorkspaceIndex: ports.workspaceSet.activeWorkspaceIndex.value,
      activeWorkspaceRoot: ports.workspaceSet.active.root,
      workspaceCount: ports.workspaceSet.count,
      workspaceTabPosition: ports.settings.workspaceTabPosition.value,
      activeBuffer: editor.hasDocument.value ? editor.document.path : null,
      // The active file's LSP size-suppression state — the authoritative channel a driven gate reads
      // to assert a large file was NOT attached to the language server (the guard is never silent).
      lspSizeSuppressed:
        ports.workspaceSet.active.languageSizeNotice() !== null,
      bufferRevision: editor.document.revision.value,
      dirty: editor.document.dirty,
      cursor: editor.hasDocument.value
        ? { line: editor.cursor.line.value, col: editor.cursor.col.value }
        : null,
      // Flat cursor line + the first few document lines — the move-line smoke reads these to assert the
      // lines reordered and the cursor followed (a pure-model op; no frame needed).
      cursorLineIndex: editor.hasDocument.value ? editor.cursor.line.value : -1,
      editorLines: editor.hasDocument.value
        ? Array.from(
            { length: Math.min(editor.document.lineCount, 8) },
            (_unusedValue, index) => editor.document.line(index),
          )
        : [],
      hasSelection: editor.cursor.hasSelection,
      selection: editor.cursor.selectionRange(),
      openBuffers: editor.hasDocument.value ? [editor.document.path] : [],
      overlay: ports.commands.open.value ? 'palette' : null,
      inputOverlay: openInputOverlays[0] ?? null,
      inputOverlayCount: openInputOverlays.length,
      openInputOverlays,
      overlayDialogBounds: ports.view.overlayDialogBounds(),
      overlayScrollPositions: ports.view.overlayScrollPositions(),
      overlayViewportExtents: ports.view.overlayViewportExtents(),
      findOpen: ports.findBar.open.value,
      findMode: ports.findBar.mode.value,
      findTarget: ports.findBar.target?.identifier ?? null,
      findQuery: ports.findBar.engine?.query.value ?? '',
      findMatchCount: ports.findBar.engine?.matchCount ?? 0,
      findCurrentMatchIndex:
        ports.findBar.engine?.currentMatchIndex.value ?? -1,
      findCaseSensitive: ports.findBar.caseSensitive,
      sourceFindQuery: editor.hasDocument.value
        ? (ports.findBar.engineFor(`source:${editor.document.path}`)?.query
            .value ?? '')
        : '',
      quickOpenOpen: ports.quickOpen.open.value,
      quickOpenSelected: ports.quickOpen.selectedIndex.value,
      quickOpenHovered: ports.quickOpen.hoveredIndex.value,
      quickOpenQuery: ports.quickOpen.query.value,
      quickOpenMatches: ports.quickOpen.matches.value.length,
      quickOpenMode: ports.quickOpen.mode.value,
      quickOpenPathOpenable: ports.quickOpen.workspacePathOpenable.value,
      paletteOpen: ports.commands.open.value,
      paletteQuery: ports.commands.open.value ? ports.commands.query.value : '',
      paletteMatches: ports.commands.open.value
        ? ports.commands.filtered.length
        : 0,
      // Settings panel + voice picker (drives smoke-voice-picker): the selected row's label + displayed
      // value, and the live agentNarrationVoice setting. (settingsOpen is already exposed below.)
      settingsSelectedLabel: ports.settingsPanel.open.value
        ? (ports.settingsPanel.rows()[ports.settingsPanel.selectedIndex.value]
            ?.label ?? '')
        : '',
      settingsSelectedValue: ports.settingsPanel.open.value
        ? (ports.settingsPanel.rows()[ports.settingsPanel.selectedIndex.value]
            ?.valueText ?? '')
        : '',
      settingsSections: [
        ...new Set(
          ports.settingsPanel.descriptors.map(
            (descriptor) => descriptor.section,
          ),
        ),
      ],
      settingsLabels: ports.settingsPanel.descriptors.map(
        (descriptor) => descriptor.label,
      ),
      narrationVoice: ports.settings.agentNarrationVoice.value,
      narrationRate: ports.settings.agentNarrationRate.value,
      focus:
        ports.workspaceSet.active.focus.value === 'primaryPane'
          ? (ports.primaryDockHost.activeId.value ?? 'primaryPane')
          : ports.workspaceSet.active.focus.value,
      sidebarView: ports.primaryDockHost.activeId.value,
      pluginPrimaryDockContentIdentifiers: [
        ...ports.pluginPrimaryDockContentIdentifiers,
      ],
      activityBarItemIdentifiers: ports.view.activityBarItemIdentifiers(),
      sidebarViewIdentifiers: ports.primaryDockHost.orderedContents.map(
        (content) => content.id,
      ),
      editorScrollTop: editor.viewport.scrollTop.value,
      editorScrollLeft: editor.viewport.scrollLeft.value,
      editorVerticalScrollImpulseCount:
        editor.viewport.verticalScrollMomentum.value
          .restEquivalentGestureImpulseCount ?? 0,
      editorFrameAttribution: ports.view.editorFrameAttribution(),
      wordWrap: editor.wordWrap.value,
      codeFolding: editor.codeFoldingEnabled,
      foldedLineStarts: editor.codeFoldingEnabled
        ? [...editor.foldState.value.collapsedLineStarts].sort(
            (firstLine, secondLine) => firstLine - secondLine,
          )
        : [],
      showActivityBar: ports.settings.showActivityBar.value,
      contextMenuOpen: ports.contextMenu.open.value,
      boundedListPopupOpen: ports.boundedListPopup.open.value,
      boundedListPopupQuery: ports.boundedListPopup.query.value,
      boundedListPopupSelected: ports.boundedListPopup.selectedIndex.value,
      boundedListPopupMatches: ports.boundedListPopup.filteredMatches.length,
      boundedListPopupTitle: ports.boundedListPopup.title,
      boundedListPopupItemIdentifiers: ports.boundedListPopup.items.value.map(
        (item) => item.identifier,
      ),
      // The rows actually offered right now. The item list carries the pinned `..` entry at all
      // times; only this projection shows whether the active query is hiding it.
      boundedListPopupMatchIdentifiers:
        ports.boundedListPopup.filteredMatches.map(
          (match) => match.item.identifier,
        ),
      boundedListPopupSelectedIdentifier:
        ports.boundedListPopup.filteredMatches[
          ports.boundedListPopup.selectedIndex.value
        ]?.item.identifier ?? null,
      boundedListPopupGeometry: ports.boundedListPopup.geometry,
      // The query model's grapheme caret plus the CELL the painter put it in: a driven contract
      // addresses the caret by this published geometry instead of hunting for a caret glyph.
      boundedListPopupQueryCaret: ports.boundedListPopup.queryCaret,
      boundedListPopupQueryCaretCell: ports.boundedListPopup.queryCaretCell,
      completionOpen: ports.completionPopup.open,
      completionSelectedLabel: ports.completionPopup.selectedLabel,
      completionItemCount: ports.completionPopup.itemCount,
      completionGeometry: ports.completionPopup.geometry,
      agentSkillPopupOpen: ports.agentSkillPopup.open.value,
      agentSkillPopupItemIdentifiers: ports.agentSkillPopup.items.map(
        (item) => item.identifier,
      ),
      agentSkillPopupSelectedIdentifier:
        ports.agentSkillPopup.selectedIdentifier,
      agentSkillPopupGeometry: ports.agentSkillPopup.geometry,
      tooltipVisible: ports.tooltip.visible.value,
      // Whichever contributed surface occupies the editor column, by its own stable identifier —
      // empty while the active buffer's editor owns it. A surface's OWN projection fields come from
      // its plugin's status snapshot; the app core no longer knows what those surfaces are.
      editorSurfaceIdentifier:
        ports.workspaceSet.active.editorSurfaces.occupyingClaim?.identifier ??
        '',
      settingsOpen: ports.settingsPanel.open.value,
      settingsSelected: ports.settingsPanel.selectedIndex.value,
      shortcutHelpOpen: ports.shortcutHelp.open.value,
      shortcutHelpScrollTop: ports.shortcutHelp.scrollTop.value,
      shortcutHelpRowCount: ports.shortcutHelp.open.value
        ? ports.shortcutHelp.rows().length
        : 0,
      sidebarWidth: ports.settings.sidebarWidth.value,
      sidebarPosition: ports.settings.sidebarPosition.value,
      panelAlignment: ports.settings.panelAlignment.value,
      leftDockVerticalSpan: ports.settings.leftDockVerticalSpan.value,
      rightDockVerticalSpan: ports.settings.rightDockVerticalSpan.value,
      rightDockWidth: ports.settings.rightDockWidth.value,
      // Editor buffer tabs (item 10a). liveBufferCount proves the FLYWEIGHT: it must stay far below
      // tabCount (only the active + any dirty background buffer holds a live document).
      bufferTabCount: ports.workspaceSet.active.buffers.count,
      bufferLiveCount: ports.workspaceSet.active.buffers.liveCount,
      activeBufferIndex: ports.workspaceSet.active.buffers.activeIndex.value,
      pendingCloseTab: ports.workspaceSet.active.pendingCloseTabIndex.value,
      // Bottom panel / terminal state (drives smoke-terminal assertions without pane-scraping).
      terminalVisible: ports.panelHost.visible.value,
      terminalFocused: ports.panelHost.focused.value,
      panelActiveContent:
        ports.panelHost.focusedContent?.id ?? ports.panelHost.activeId.value,
      panelContentIds: ports.panelHost.order.value,
      panelContentOrder: ports.panelHost.order.value,
      panelContentLabels: ports.panelHost.orderedContents.map(
        (content) => content.instanceLabel ?? content.title,
      ),
      panelContentKinds: ports.panelHost.orderedContents.map(
        (content) => content.kind ?? content.id,
      ),
      panelExpanded: ports.panelHost.expanded.value,
      panelListVisible: ports.panelHost.panelListVisible,
      panelHeadingGeometry: ports.view.panelHeadingGeometry(),
      panelListGeometry: ports.view.panelContentsListRegion(),
      terminalColumns: ports.view.panelViewportColumns(),
      terminalRows: ports.view.panelViewportRows(),
      // Split state: which cells occupy the slot, which one has the keyboard, and each cell's converged
      // column width — the driving smoke reads this to prove 2-up render, focus routing, and re-flow.
      panelCellIds: ports.panelHost.resolvedCells.map(
        (cell) => cell.content.id,
      ),
      panelFocusedIndex: ports.panelHost.focusedIndex.value,
      panelCellColumns: ports.panelHost
        .cellSpans(ports.view.panelViewportColumns())
        .map((span) => span.columns),
      primaryDockVisible: ports.primaryDockHost.visible.value,
      rightDockVisible: ports.rightDockHost.visible.value,
      rightDockFocused: ports.rightDockHost.focused.value,
      rightDockActiveContent: ports.rightDockHost.activeId.value,
      rightDockContentIds: ports.rightDockHost.order.value,
      rightDockColumns: ports.view.rightDockViewportColumns(),
      rightDockRows: ports.view.rightDockViewportRows(),
      layoutSlots: ports.view.layoutGeometry(),
      splitterRegions: ports.view.splitterRegions(),
      // Active buffer is an image the editor renders as half-block cells (drives smoke-image-preview).
      activeFileIsImage: ports.workspaceSet.active.activeFileIsImage,
      // Bracket match: the matched partner cell for the cursor's bracket (line,col 0-based), or -1/-1
      // when the cursor is not on a bracket — the driving smoke reads this alongside the frame bg.
      matchingBracketLine: (() => {
        if (
          !editor.hasDocument.value ||
          !ports.workspaceSet.active.editorSurfaces.activeDocumentIsPresented
        )
          return -1;
        return (
          BracketMatch.Class.findInDocument(
            editor.document,
            editor.cursor.line.value,
            editor.cursor.col.value,
            LanguageRegistry.Class.forPath(editor.document.path),
          )?.match.line ?? -1
        );
      })(),
      matchingBracketColumn: (() => {
        if (
          !editor.hasDocument.value ||
          !ports.workspaceSet.active.editorSurfaces.activeDocumentIsPresented
        )
          return -1;
        return (
          BracketMatch.Class.findInDocument(
            editor.document,
            editor.cursor.line.value,
            editor.cursor.col.value,
            LanguageRegistry.Class.forPath(editor.document.path),
          )?.match.column ?? -1
        );
      })(),
      // Audio narration (third projection): the toggle, how many assistant turns have been spoken, and
      // the last spoken text — the driving smoke reads these to prove it speaks completed turns when ON
      // and NOTHING when off, all through the silent mock backend (no audio in CI).
      narrationEnabled: ports.settings.agentAudioNarration.value,
      narrationSpokenCount: ports.narration?.spokenCount.value ?? 0,
      narrationLastSpoken: ports.narration?.lastSpoken.value ?? '',
      narrationBargeInCount: ports.narration?.bargeInCount.value ?? 0,
      // Agent pane UX view state (drives smoke-agent-pane-ux): busy shows the spinner; stuckToBottom
      // flips false once the user scrolls up; expandedCount rises when a collapsed tool row is opened.
      agentBusy: ports.agentPaneContent?.agentSession.busy ?? false,
      agentTurnState:
        ports.agentPaneContent?.agentSession.turnState?.value ?? 'idle',
      queuedMessageCount:
        ports.agentPaneContent?.agentSession.queuedMessageCount ?? 0,
      agentStuckToBottom: ports.agentPaneContent?.stuckToBottom ?? true,
      agentExpandedCount: ports.agentPaneContent?.expandedCount ?? 0,
      agentScrollTop: ports.agentPaneContent?.scrollTop ?? 0,
      agentViewportRows: ports.agentPaneContent?.viewportRows ?? 0,
      agentContentLineCount: ports.agentPaneContent?.contentLineCount ?? 0,
      // Interactive permission prompt state (drives the permission-flow smoke): the pending tool name
      // (empty when none) — flips on when ask-mode pauses a tool, off when y/n/a resolves it.
      agentPendingPermissionTool:
        ports.agentPaneContent?.agentSession.pendingPermission?.toolName ?? '',
      agentSkipPermissions: ports.settings.agentSkipPermissions.value,
      // The live engine label (drives the engine-switch smoke) — flips claude⇄codex on cycle.
      agentEngine: ports.agentPaneContent?.currentEngine ?? '',
      // The pane's LIVE title (drives the identity smoke) — the registry display label of the active
      // engine ('Claude'/'Codex'/…, '(working…)' while busy), never a frozen 'Claude'.
      agentTitle: ports.agentPaneContent?.title ?? '',
      agentAssistantEntryCount:
        ports.agentPaneContent?.agentSession.transcript?.filter(
          (entry) => entry.role === 'assistant',
        ).length ?? 0,
      agentLastAssistantText: (() => {
        const transcript =
          ports.agentPaneContent?.agentSession.transcript ?? [];
        for (
          let entryIndex = transcript.length - 1;
          entryIndex >= 0;
          entryIndex -= 1
        ) {
          const entry = transcript[entryIndex]!;
          if (entry.role === 'assistant') return entry.text;
        }
        return '';
      })(),
      terminalFollowMode: ports.settings.agentTerminalFollowMode.value,
      terminalObservedEventCount:
        ports.terminalPaneContent?.observedEventCount ?? 0,
      terminalExited: ports.terminalPaneContent?.terminalExited ?? false,
      terminalExitCode: ports.terminalPaneContent?.terminalExitCode ?? null,
      terminalLastObservedBoundarySource:
        ports.terminalPaneContent?.lastObservedBoundarySource ?? null,
      terminalScrollTop: ports.terminalPaneContent?.scrollTop ?? 0,
      terminalScrollContentRows:
        ports.terminalPaneContent?.scrollContentRows ?? 0,
      terminalScrollViewportRows:
        ports.terminalPaneContent?.scrollViewportRows ?? 0,
      terminalWheelForwardedToChild:
        ports.terminalPaneContent?.forwardsWheelToChild ?? false,
      agentLastToolResult: (() => {
        const transcript =
          ports.agentPaneContent?.agentSession.transcript ?? [];
        for (
          let entryIndex = transcript.length - 1;
          entryIndex >= 0;
          entryIndex -= 1
        ) {
          const entry = transcript[entryIndex]!;
          if (entry.role === 'tool-result') return entry.result;
        }
        return '';
      })(),
      ...ports.statusProjectionContributions.snapshot(),
    };
  }
}

export namespace AppStatusProjection {
  export const $Class = $AppStatusProjection;
  export const Class = Static($AppStatusProjection);
}

export interface AppStatusMouseEvent {
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly button: number;
}

export interface AppStatusProjectionPorts {
  readonly workspaceSet: Pick<
    InstanceType<typeof WorkspaceSet.Class>,
    'active' | 'tabs' | 'activeWorkspaceIndex' | 'count' | 'entries'
  >;
  readonly settings: Pick<
    InstanceType<typeof Settings.Class>,
    | 'workspaceTabPosition'
    | 'sidebarPosition'
    | 'panelAlignment'
    | 'leftDockVerticalSpan'
    | 'rightDockVerticalSpan'
    | 'agentNarrationVoice'
    | 'agentNarrationRate'
    | 'showActivityBar'
    | 'sidebarWidth'
    | 'rightDockWidth'
    | 'agentAudioNarration'
    | 'agentTerminalFollowMode'
    | 'agentSkipPermissions'
  >;
  readonly commands: Pick<
    InstanceType<typeof CommandRegistry.Class>,
    'open' | 'query' | 'filtered'
  >;
  readonly findBar: Pick<
    InstanceType<typeof FindBar.Class>,
    'open' | 'mode' | 'target' | 'engine' | 'caseSensitive' | 'engineFor'
  >;
  readonly quickOpen: Pick<
    InstanceType<typeof QuickOpen.Class>,
    | 'open'
    | 'selectedIndex'
    | 'hoveredIndex'
    | 'query'
    | 'matches'
    | 'mode'
    | 'workspacePathOpenable'
  >;
  readonly settingsPanel: Pick<
    InstanceType<typeof SettingsPanel.Class>,
    'open' | 'selectedIndex' | 'rows' | 'descriptors'
  >;
  readonly contextMenu: Pick<InstanceType<typeof ContextMenu.Class>, 'open'>;
  readonly boundedListPopup: Pick<
    InstanceType<typeof BoundedListPopup.Class>,
    | 'open'
    | 'items'
    | 'query'
    | 'selectedIndex'
    | 'filteredMatches'
    | 'geometry'
    | 'title'
    | 'queryCaret'
    | 'queryCaretCell'
  >;
  readonly completionPopup: Pick<
    InstanceType<typeof CompletionPopup.Class>,
    'open' | 'selectedLabel' | 'itemCount' | 'geometry'
  >;
  readonly agentSkillPopup: Pick<
    AgentSkillPopup.Model,
    'open' | 'items' | 'selectedIdentifier' | 'geometry'
  >;
  readonly shortcutHelp: Pick<
    InstanceType<typeof ShortcutHelp.Class>,
    'open' | 'scrollTop' | 'rows'
  >;
  readonly tooltip: Pick<InstanceType<typeof Tooltip.Class>, 'visible'>;
  readonly panelHost: Pick<
    InstanceType<typeof PanelHost.Class>,
    | 'visible'
    | 'focused'
    | 'expanded'
    | 'activeId'
    | 'order'
    | 'orderedContents'
    | 'resolvedCells'
    | 'focusedContent'
    | 'focusedIndex'
    | 'cellSpans'
    | 'panelListVisible'
  >;
  readonly primaryDockHost: Pick<
    InstanceType<typeof PanelHost.Class>,
    'visible' | 'activeId' | 'orderedContents'
  >;
  readonly pluginPrimaryDockContentIdentifiers: readonly string[];
  readonly statusProjectionContributions: Pick<
    StatusProjectionContributions.Model,
    'snapshot'
  >;
  readonly rightDockHost: Pick<
    InstanceType<typeof PanelHost.Class>,
    | 'visible'
    | 'focused'
    | 'activeId'
    | 'order'
    | 'resolvedCells'
    | 'focusedContent'
  >;
  readonly view: Pick<
    RootView,
    | 'panelViewportColumns'
    | 'panelViewportRows'
    | 'panelHeadingGeometry'
    | 'panelContentsListRegion'
    | 'rightDockViewportColumns'
    | 'rightDockViewportRows'
    | 'layoutGeometry'
    | 'splitterRegions'
    | 'activityBarItemIdentifiers'
    | 'overlayDialogBounds'
    | 'overlayScrollPositions'
    | 'overlayViewportExtents'
    | 'editorFrameAttribution'
  >;
  readonly mouse: AppStatusMouseEvent | null;
  readonly narration: Pick<
    InstanceType<typeof NarrationProjection.Class>,
    'spokenCount' | 'lastSpoken' | 'bargeInCount'
  > | null;
  readonly agentPaneContent: Pick<
    AgentPaneContent.Model,
    | 'agentSession'
    | 'stuckToBottom'
    | 'expandedCount'
    | 'scrollTop'
    | 'viewportRows'
    | 'contentLineCount'
    | 'currentEngine'
    | 'title'
  > | null;
  readonly terminalPaneContent: Pick<
    TerminalPaneContent.Model,
    | 'observedEventCount'
    | 'terminalExited'
    | 'terminalExitCode'
    | 'lastObservedBoundarySource'
    | 'scrollTop'
    | 'scrollContentRows'
    | 'scrollViewportRows'
    | 'forwardsWheelToChild'
  > | null;
}
