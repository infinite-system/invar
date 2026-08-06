// Boot sequence: seal the kernel, create the renderer, open the workspace, build the frame,
// wire ONE reactive frame effect, wire input, and run until quit.
//
// invariant: The app is built only after the kernel is sealed (project.invariants.md)
// invariant: Data flows one way (project.invariants.md)
// invariant: Rendering is one coarse frame effect (src/modules/app/app.invariants.md)
// invariant: Construction goes through overridable seams (project.invariants.md)
import {
  createCliRenderer,
  RGBA,
  type CliRenderer,
  type KeyEvent,
} from '@opentui/core';
import { Static } from 'ivue/extras';
import throttle from 'lodash.throttle';
import { App } from './App';
import { Kernel } from '../kernel/Kernel';
import { Workspace } from '../workspace/Workspace';
import { WorkspaceSet } from '../workspace/WorkspaceSet';
import { LayoutSlots } from '../layout/LayoutSlots';
import { WorkspaceLayoutContributor } from '../layout/WorkspaceLayoutContributor';
import { Theme } from '../theme/Theme';
import { TerminalCapabilities } from '../theme/TerminalCapabilities';
import { CommandRegistry } from '../commands/CommandRegistry';
import { CommandDefaults } from '../commands/CommandDefaults';
import { RootView } from '../ui/RootView';
import { TabStrip } from '../ui/TabStrip';
import { ContextMenu } from '../ui/ContextMenu';
import { BoundedListPopup } from '../ui/BoundedListPopup';
import { CompletionPopup } from '../ui/CompletionPopup';
import { RenderRequest } from '../ui/RenderRequest';
import { OverlayCoordinator } from '../ui/OverlayCoordinator';
import { ShortcutHelp } from '../ui/ShortcutHelp';
import { Tooltip } from '../ui/Tooltip';
import { Settings, type PanelWorkspacePaneState } from '../settings/Settings';
import { SettingsPanel } from '../settings/SettingsPanel';
import { FindBar } from '../search/FindBar';
import { QuickOpen } from '../search/QuickOpen';
import { Files } from '../system/Files';
import { StatusChannel } from '../system/StatusChannel';
import { GraphChannel } from '../system/GraphChannel';
import { FrameProbe } from '../system/FrameProbe';
import { ScrollPhysics } from '../ui/ScrollPhysics';
import { Clipboard } from '../system/Clipboard';
import { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import { KeybindingDefaults } from '../keybindings/KeybindingDefaults';
import { KeybindingMac } from '../keybindings/KeybindingMac';
import { Environment } from '../system/Environment';
import { Logging } from '../system/Logging';
import { ChannelDropNotification } from '../channel/ChannelDropNotification';
import { HandlerGuard } from './HandlerGuard';
import { TerminalSession } from './TerminalSession';
import {
  AppStatusProjection,
  type AppStatusMouseEvent,
  type AppStatusProjectionPorts,
} from './AppStatusProjection';
import { PanelHost, type PanelContentSet } from '../ui/PanelHost';
import { PanelWorkspaceState } from '../ui/PanelWorkspaceState';
import { ActivitySurface } from '../ui/ActivitySurface';
import { PanelHostFocusSet } from '../ui/PanelHostFocusSet';
import { PanelAddPopup } from '../ui/PanelAddPopup';
import type {
  PaneContent,
  PaneTextInputPort,
  PaneTextSelectionPort,
} from '../ui/PaneContent.interface';
import { PaneRuntimes } from '../ui/PaneRuntimes';
import { PanelContentFactories } from '../ui/PanelContentFactories';
import type { PaneRuntimeRequest } from '../ui/PaneRuntime.interface';
import { TextCoordinates } from '../text/TextCoordinates';
import { TextInputKey } from '../text/TextInputKey';
import type { TextInputAction } from '../text/TextInputModel';
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import { dirname, join } from 'node:path';
import type { ApplicationContributor } from './ApplicationContributor.interface';
import { StatusProjectionContributions } from './StatusProjectionContributions';
import { SystemNoteContributions } from './SystemNoteContributions';
import { PanelContentLifecycle } from './PanelContentLifecycle';
import { EditorSurfaceContents } from '../ui/EditorSurfaceContents';
import { EditorColumnDefault } from '../ui/EditorColumnDefault';
import { StatusBarSegments } from '../ui/StatusBarSegments';
import { CoreStatusBarSegments } from '../ui/CoreStatusBarSegments';
import { ApplicationContributions } from './ApplicationContributions';
import { TaskLauncher } from '../tasks/TaskLauncher';
import { TaskNoticePaneContent } from '../tasks/TaskNoticePaneContent';
import { Tasks } from '../tasks/Tasks';
import { GoToLinePrompt } from '../navigation/GoToLinePrompt';
import { Dialog } from '../ui/Dialog';
import type { SourceTextViewProvider } from '../workspace/SourceTextView.interface';
import { PathDropController } from './PathDropController';
import { FileOpenController } from './FileOpenController';

class $Bootstrap {
  protected static awaitProjectedFrame(
    renderer: Pick<CliRenderer, 'once' | 'requestRender'>,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      renderer.once('frame', () => resolve());
      renderer.requestRender();
    });
  }

  static async boot(options: BootOptions = {}): Promise<BootedApp> {
    Logging.Class.info('Boot start');

    // Pointer trail (observability, TUI_POINTER_TRAIL=1): paints the pointer
    // cell, a fading wake of recent positions, and click rings as a render
    // POST-PROCESS — over everything, touching no layout, fed by the app's
    // own received mouse events, so what it shows is exactly the gestures
    // that ARRIVED, never a reconstruction. Built for the mirror: a human
    // watching an agent drive needs to see the agent's hand. Inert without
    // the env flag; the mirror server enables it by default.
    const pointerTrailEnabled =
      Environment.Class.env('TUI_POINTER_TRAIL') === '1';
    const pointerTrailEvents: Array<{
      x: number;
      y: number;
      atMs: number;
      kind: 'move' | 'click' | 'scroll';
    }> = [];
    // The fade needs FRAMES to fade through: after the last mouse event no
    // reactive state changes, so nothing would repaint and the wake freezes
    // on screen. While any trail cell remains, the painter itself asks for
    // the next frame; it stops asking when the trail drains — self-limiting.
    let pointerTrailRenderer: { requestRender: () => void } | null = null;
    const paintPointerTrail = (buffer: {
      setCell: (x: number, y: number, char: string, fg: RGBA, bg: RGBA) => void;
    }): void => {
      const now = Date.now();
      // Prune the wake; click rings and scroll marks linger so a tap reads.
      const lifespanMs = { move: 650, click: 900, scroll: 800 };
      while (
        pointerTrailEvents.length > 0 &&
        now - pointerTrailEvents[0]!.atMs >
          lifespanMs[pointerTrailEvents[0]!.kind]
      ) {
        pointerTrailEvents.shift();
      }
      const trailBackground = RGBA.fromInts(122, 162, 247, 255);
      const trailInk = RGBA.fromInts(22, 22, 30, 255);
      for (const event of pointerTrailEvents) {
        const age = now - event.atMs;
        if (event.kind === 'click') {
          buffer.setCell(
            event.x,
            event.y,
            age < 300 ? '◉' : '◎',
            RGBA.fromInts(255, 200, 120, 255),
            trailInk,
          );
          continue;
        }
        if (event.kind === 'scroll') {
          buffer.setCell(
            event.x,
            event.y,
            '⇅',
            RGBA.fromInts(158, 206, 106, 255),
            trailInk,
          );
          continue;
        }
        buffer.setCell(
          event.x,
          event.y,
          age < 250 ? '•' : '·',
          trailBackground,
          trailInk,
        );
      }
      const pointer = pointerTrailEvents.at(-1);
      if (pointer && pointer.kind === 'move') {
        buffer.setCell(pointer.x, pointer.y, '✛', trailInk, trailBackground);
      }
      if (pointerTrailEvents.length > 0) {
        pointerTrailRenderer?.requestRender();
      }
    };
    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      targetFps: 30,
      useMouse: true,
      enableMouseMovement: true, // hover highlighting (over/out/move)
      // Kitty keyboard protocol where available: super-modifier fidelity for the mac overlay
      // (Cmd chords); legacy terminals silently stay at base fidelity.
      useKittyKeyboard: {},
      postProcessFns: pointerTrailEnabled ? [paintPointerTrail] : [],
    });
    const requestRendererFrame = renderer.requestRender.bind(renderer);
    renderer.requestRender = () => {
      StatusChannel.Class.markRenderRequested();
      requestRendererFrame();
    };
    pointerTrailRenderer = renderer;

    // Ctrl+click routing guard. OpenTUI treats Ctrl+left-down as "extend the current native
    // selection" and CONSUMES the event whenever `currentSelection` exists — and an ordinary
    // click on any selectable text (a tab label, a tree row) leaves a zero-width selection
    // behind. That residue silently eats every later Ctrl+click, so any renderable listening
    // for a modified click (a rendered link, a go-to-definition target) never hears it. A
    // selection the user is actively DRAGGING keeps the native gesture; a non-dragging one is
    // cleared here so the down reaches the renderable under the pointer. Host-generic: no
    // consumer is named — whoever handles Ctrl+click simply receives it again.
    {
      const routedRenderer = renderer as unknown as {
        processSingleMouseEvent: (mouseEvent: {
          type: string;
          button?: number;
          modifiers?: { ctrl?: boolean };
        }) => boolean;
        currentSelection?: { isDragging: boolean } | null;
        clearSelection: () => void;
      };
      const originalProcessSingleMouseEvent =
        routedRenderer.processSingleMouseEvent.bind(renderer);
      routedRenderer.processSingleMouseEvent = (mouseEvent) => {
        if (
          mouseEvent.type === 'down' &&
          mouseEvent.button === 0 &&
          mouseEvent.modifiers?.ctrl === true &&
          routedRenderer.currentSelection &&
          !routedRenderer.currentSelection.isDragging
        ) {
          routedRenderer.clearSelection();
        }
        return originalProcessSingleMouseEvent(mouseEvent);
      };
    }

    Kernel.Class.instance.seal();
    Kernel.Class.instance.assertSealed();

    const app = new App.Class();
    StatusChannel.Class.update({
      kernelExtensions: Kernel.Class.instance.registeredExtensions(),
      appClassExtended: App.Class !== App.$Class,
    });
    app.attach(renderer);
    // OpenTUI owns stdout and may flush frames from a native render thread. Its OSC 52 writer shares
    // that serialization authority, so clipboard bytes can only land between complete frame writes.
    // The higher-level copy helper is capability-gated and rejects terminals that accept OSC 52 but do
    // not advertise it (including the user-verified host), so use the renderer's raw serialized writer.
    // invariant: Clipboard emissions flush at frame boundaries (src/modules/system/system.invariants.md)
    const disposeClipboardEmitter = Clipboard.Class.setOsc52Emitter(
      (sequence) =>
        (
          renderer as unknown as {
            writeOut(outputSequence: string): boolean;
          }
        ).writeOut(sequence),
    );
    app.onDispose(disposeClipboardEmitter);

    const theme = new Theme.Class();
    const commands = new CommandRegistry.Class();

    // Reactive settings store (item G): load user + project settings; changes live-apply + persist.
    const settings = new Settings.Class();
    settings.load({ workspaceRoot: options.root ?? Environment.Class.cwd });
    const codeFoldingEnabled = settings.registerSetting({
      identifier: 'editor.codeFolding',
      label: 'Code folding',
      section: 'Editor',
      defaultValue: true,
      spec: { kind: 'boolean' },
    });
    app.onDispose(() => codeFoldingEnabled.dispose());
    // The live layout slot sizes, seeded from the stored defaults. From here they belong to the
    // workspace on screen; `WorkspaceLayoutContributor` below gives every workspace its own set.
    // invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
    const layoutSlots = new LayoutSlots.Class();
    layoutSlots.primaryDockColumns.value = Math.round(
      settings.sidebarWidth.value,
    );
    layoutSlots.rightDockColumns.value = Math.round(
      settings.rightDockWidth.value,
    );
    const workspaceSet = new WorkspaceSet.Class(settings, {
      awaitNextViewPaint: () =>
        new Promise<void>((resolve) => {
          renderer.once('frame', () => resolve());
        }),
      codeFoldingEnabled: codeFoldingEnabled.value,
      createSourceTextViews: options.createSourceTextViews,
    });
    workspaceSet.open(options.root ?? Environment.Class.cwd);
    const keybindings = new KeybindingRegistry.Class();
    keybindings.registerGuard(
      'editorHasSelection',
      () => workspaceSet.activeEditor.cursor.hasSelection,
    );
    keybindings.registerLayer(
      'canonical',
      KeybindingDefaults.Class.canonicalBindings,
    );
    keybindings.registerLayer('mac', KeybindingMac.Class.overlayBindings);
    const bufferTabStrip = new TabStrip.Class('horizontal', () =>
      workspaceSet.active.buffers.tabs().map((bufferTab) => ({
        identifier: bufferTab.path,
        label:
          Files.Class.basename(bufferTab.path) +
          (bufferTab.readOnly ? ' [read-only]' : ''),
        active: bufferTab.active,
        dirty: bufferTab.dirty,
        closable: true,
      })),
    );
    const workspaceTabStrip = new TabStrip.Class(
      settings.workspaceTabPosition.value === 'left'
        ? 'vertical'
        : 'horizontal',
      () =>
        workspaceSet.tabs().map((workspaceTab) => ({
          identifier: workspaceTab.root,
          label: workspaceTab.name,
          detailLabel: workspaceTab.detail,
          active: workspaceTab.active,
          closable: workspaceSet.count > 1,
        })),
    );

    // App-level overlay view models (the view projects them; input routes through here).
    const contextMenu = new ContextMenu.Class();
    const scrollPhysics = new ScrollPhysics.Class();
    const boundedListPopup = new BoundedListPopup.Class({
      renderer,
      settings,
      theme,
      scrollPhysics,
    });
    const completionPopup = new CompletionPopup.Class({
      renderer,
      settings,
      theme,
      scrollPhysics,
    });
    let completionRequestGeneration = 0;
    let completionRequestPending = false;
    let identifierCompletionRequestScheduled = false;
    const dismissCompletion = (): void => {
      completionRequestGeneration++;
      completionRequestPending = false;
      identifierCompletionRequestScheduled = false;
      completionPopup.close();
      // A completion request can open while the renderer still has that frame queued. OpenTUI
      // coalesces another request made in the same input turn, so retry on the next turn after the
      // popup's paint revision has republished the closed semantic state.
      RenderRequest.Class.afterCurrentTurn(() => renderer.requestRender());
    };
    const tooltip = new Tooltip.Class();
    const settingsPanel = new SettingsPanel.Class(settings);
    const findBar = new FindBar.Class();
    const quickOpen = new QuickOpen.Class();
    const goToLinePrompt = new GoToLinePrompt.Class();
    let confirmQuit = (): void => {};
    const quitConfirmation = new Dialog.Class();
    const shortcutHelp = new ShortcutHelp.Class(keybindings, commands);
    // The bottom panel slot is a generic, content-agnostic host. Its occupants come from contributed
    // runtimes and start lazily on their first content-specific request.
    // invariant: Panel content order is one persisted sequence (src/modules/ui/ui.invariants.md)
    // invariant: A pane runtime owns its processes (src/modules/ui/ui.invariants.md)
    const paneRuntimes = new PaneRuntimes.Class();
    for (const persistedIdentifier of [
      ...settings.panelContentOrder.value,
      ...Object.values(settings.panelWorkspaceStates.value).flatMap((state) =>
        PanelWorkspaceState.Class.paneIdentifiers(state),
      ),
    ]) {
      paneRuntimes.reservePersistedInstanceIdentifier(persistedIdentifier);
    }
    const panelContentFactories = new PanelContentFactories.Class();
    let openPanelContent = (_kind: string): boolean => false;
    let openRuntimePane = (
      _runtimeKind: string,
      _request: PaneRuntimeRequest,
    ): boolean => false;
    let ensureRuntimePane = (_kind: string): PaneContent | null => null;
    let openFindTarget = (
      _target: import('../search/FindBar').FindBarTarget,
    ): void => {};
    let requestFindReplaceAll = (): void => {};
    let focusedPanelCaretAnchor = (): {
      column: number;
      row: number;
    } | null => null;
    let handlePanelContentRemoved: (content: PaneContent) => void = () => {};
    let persistPanelWorkspaceState = (): void => {};
    let copyPaneSelection = (_content: PaneContent): void => {};
    let replacePaneWithRuntime = (
      _identifier: string,
      _runtimeKind: string,
    ): boolean => false;
    let restorePanelWorkspaceState = (
      _workspace: Workspace.Instance,
    ): void => {};
    const panelHostFocusSet = new PanelHostFocusSet.Class();
    const panelHost = new PanelHost.Class({
      focusSet: panelHostFocusSet,
      contentOrder: settings.panelContentOrder,
      persistContentOrder: () => settings.save(),
      persistWorkspaceState: () => persistPanelWorkspaceState(),
      onContentRemoved: (content) => handlePanelContentRemoved(content),
      requestCloseSpace: (identifier, instanceCount) => {
        const space = panelHost.spaces.value.find(
          (candidate) => candidate.identifier === identifier,
        );
        if (!space || instanceCount === 0) {
          panelHost.closeSpace(identifier);
          return;
        }
        overlayCoordinator.openExclusiveOverlay('quitConfirmation', () =>
          quitConfirmation.show({
            identifier: 'panel-container-close',
            message:
              `Close ${space.label} and its ${instanceCount} ` +
              `${instanceCount === 1 ? 'instance' : 'instances'}?`,
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            onConfirm: () => panelHost.closeSpace(identifier),
          }),
        );
      },
    });
    const acceptsAnyPane = (): boolean => true;
    const isRuntimeDefaultPane = (content: PaneContent): boolean =>
      content.task === undefined;
    /** Resolve a visible kind through an explicit selection policy. Kind is never used as an id. */
    const visiblePaneOfKind = (
      kind: string,
      acceptsPane: (content: PaneContent) => boolean = acceptsAnyPane,
    ): PaneContent | null => {
      const focusedContent = panelHost.focusedContent;
      if (
        focusedContent &&
        (focusedContent.kind ?? focusedContent.id) === kind &&
        acceptsPane(focusedContent)
      ) {
        return focusedContent;
      }
      return panelHost.visibleContentsOfKind(kind).find(acceptsPane) ?? null;
    };
    /** Resolve a requested kind through an explicit focused, visible, then registered policy. */
    const currentPaneOfKind = (
      kind: string,
      acceptsPane: (content: PaneContent) => boolean = acceptsAnyPane,
    ): PaneContent | null =>
      visiblePaneOfKind(kind, acceptsPane) ??
      panelHost.contentsOfKind(kind).find(acceptsPane) ??
      null;
    const workspacePanelWorlds = new Map<
      Workspace.Instance,
      WorkspacePanelWorld
    >();
    let nextWorkspacePanelWorldNumber = 1;
    const initialWorkspacePanelWorld: WorkspacePanelWorld = {
      contentSet: panelHost.activeContentSet,
      identityScope: '',
    };
    workspacePanelWorlds.set(workspaceSet.active, initialWorkspacePanelWorld);
    let activeWorkspacePanelWorld = initialWorkspacePanelWorld;
    let reconnectPanelWorldDependencies = (): void => {};
    const workspacePanelWorldFor = (
      workspace: Workspace.Instance,
    ): WorkspacePanelWorld => {
      const existingWorkspacePanelWorld = workspacePanelWorlds.get(workspace);
      if (existingWorkspacePanelWorld) return existingWorkspacePanelWorld;
      nextWorkspacePanelWorldNumber += 1;
      const workspacePanelWorld: WorkspacePanelWorld = {
        contentSet: panelHost.createContentSet(),
        identityScope: String(nextWorkspacePanelWorldNumber),
      };
      workspacePanelWorlds.set(workspace, workspacePanelWorld);
      return workspacePanelWorld;
    };
    const stopSelectingWorkspacePanelWorlds =
      workspaceSet.onActiveWorkspaceChanged((workspace) => {
        activeWorkspacePanelWorld = workspacePanelWorldFor(workspace);
        panelHost.selectContentSet(activeWorkspacePanelWorld.contentSet);
        restorePanelWorkspaceState(workspace);
        reconnectPanelWorldDependencies();
      });
    const stopDisposingWorkspacePanelWorlds = workspaceSet.onWorkspaceDisposed(
      (workspace) => {
        const workspacePanelWorld = workspacePanelWorlds.get(workspace);
        if (!workspacePanelWorld) return;
        panelHost.disposeContentSet(workspacePanelWorld.contentSet);
        workspacePanelWorlds.delete(workspace);
      },
    );
    app.onDispose(stopSelectingWorkspacePanelWorlds);
    app.onDispose(stopDisposingWorkspacePanelWorlds);
    // invariant: Activity bar order is one persisted sequence (src/modules/ui/ui.invariants.md)
    const primaryDockHost = new PanelHost.Class({
      focusSet: panelHostFocusSet,
      contentOrder: settings.primaryDockContentOrder,
      persistContentOrder: () => settings.save(),
      retainUnregisteredContentOrder: true,
    });
    const rightDockHost = new PanelHost.Class({
      focusSet: panelHostFocusSet,
      contentOrder: settings.primaryDockContentOrder,
      persistContentOrder: () => settings.save(),
      retainUnregisteredContentOrder: true,
    });
    const activitySurface = new ActivitySurface.Class({
      hosts: [primaryDockHost, rightDockHost],
      contentOrder: settings.primaryDockContentOrder,
      persistContentOrder: () => settings.save(),
    });

    const overlayCoordinator = new OverlayCoordinator.Class({
      findBar: () => findBar.close(),
      goToLine: () => goToLinePrompt.close(),
      quickOpen: () => quickOpen.close(),
      commandPalette: () => commands.closePalette(),
      settingsPanel: () => settingsPanel.close(),
      contextMenu: () => contextMenu.close(),
      boundedListPopup: () => boundedListPopup.close(),
      completionPopup: dismissCompletion,
      shortcutHelp: () => shortcutHelp.close(),
      quitConfirmation: () => quitConfirmation.dismiss(),
    });
    const statusBarSegments = new StatusBarSegments.Class();
    const statusProjectionContributions =
      new StatusProjectionContributions.Class();
    const systemNoteContributions = new SystemNoteContributions.Class();
    const panelContentLifecycle = new PanelContentLifecycle.Class();
    // Contributed occupants of the editor column register here. Created BEFORE plugin activation
    // (which runs before buildRootView), so a provider registers early and its content is built
    // lazily at mount time from a view-supplied context.
    const editorSurfaceContents = new EditorSurfaceContents.Class();
    // The editor column's DEFAULT occupant, registered by a contributor rather than built here.
    // Created before activation for the same reason: the provider registers early, and its content
    // is built lazily once the view attaches the slot.
    // invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
    const editorColumnDefault = new EditorColumnDefault.Class();
    let restartApplication = (): void => {};
    let editorInteractionIsAvailable = (): boolean => false;
    let dismissEditorSuggestions = (): void => {};
    const pluginPrimaryDockContentIdentifiers = (options.plugins ?? []).flatMap(
      (plugin) => plugin.primaryDockContentIdentifiers ?? [],
    );
    const applicationContributions = new ApplicationContributions.Class(
      options.plugins ?? [],
      {
        renderer,
        workspaceSet,
        settings,
        theme,
        commands,
        keybindings,
        primaryDockHost,
        rightDockHost,
        bottomPanelHost: panelHost,
        contextMenu,
        boundedListPopup,
        findBar,
        overlayCoordinator,
        statusBarSegments,
        statusProjectionContributions,
        systemNoteContributions,
        panelContentLifecycle,
        editorSurfaceContents,
        editorColumnDefault,
        paneRuntimes,
        panelContentFactories,
        openPanelContent: (kind) => openPanelContent(kind),
        openRuntimePane: (runtimeKind, request) =>
          openRuntimePane(runtimeKind, request),
        currentPaneOfKind,
        ensureRuntimePane: (kind) => ensureRuntimePane(kind),
        openFindTarget: (target) => openFindTarget(target),
        focusedPanelCaretAnchor: () => focusedPanelCaretAnchor(),
        copyPaneSelection: (content) => copyPaneSelection(content),
        replacePaneWithRuntime: (identifier, runtimeKind) =>
          replacePaneWithRuntime(identifier, runtimeKind),
        releasePane: (identifier) =>
          panelHost.removeContentFromAnySet(identifier),
        editorInteractionIsAvailable: () => editorInteractionIsAvailable(),
        dismissEditorSuggestions: () => dismissEditorSuggestions(),
        bindingHint: (action, context) =>
          keybindings.bindingHint(action, context),
        requestRender: () => renderer.requestRender(),
        restartApplication: () => restartApplication(),
      },
    );
    const pathDropController = new PathDropController.Class({
      workspaceSet,
      droppedPathOpeners: applicationContributions,
      boundedListPopup,
      overlayCoordinator,
      pasteIntoFocusedPane: (text) => {
        if (!panelHost.visible.value || !panelHost.focused.value) return false;
        if (!panelHost.focusedContent?.acceptsDroppedPathPaste) return false;
        return panelHost.handlePaste(text);
      },
      focusEditor: () => {
        panelHost.blur();
        primaryDockHost.blur();
        rightDockHost.blur();
        workspaceSet.active.focusEditor();
      },
      screenSize: () => ({ columns: renderer.width, rows: renderer.height }),
    });
    const fileOpenController = new FileOpenController.Class({
      workspaceSet,
      pathDropController,
      boundedListPopup,
      overlayCoordinator,
      theme,
      popupAnchor: () => ({
        column: Math.floor(renderer.width / 4),
        row: Math.floor(renderer.height / 5),
      }),
    });
    applicationContributions.activateAll();
    app.onDispose(() => applicationContributions.dispose());
    const primaryDockFallbackContentIdentifier = (options.plugins ?? []).find(
      (plugin) => plugin.primaryDockFallbackContentIdentifier !== undefined,
    )?.primaryDockFallbackContentIdentifier;
    if (
      primaryDockFallbackContentIdentifier &&
      primaryDockHost.has(primaryDockFallbackContentIdentifier)
    ) {
      primaryDockHost.showContent(primaryDockFallbackContentIdentifier);
    }
    const restartPrimaryDockIdentifier = process.env.INVAR_RESTART_PRIMARY_DOCK;
    if (
      restartPrimaryDockIdentifier &&
      primaryDockHost.has(restartPrimaryDockIdentifier)
    ) {
      primaryDockHost.showContent(restartPrimaryDockIdentifier);
      workspaceSet.active.focusPrimaryPane(restartPrimaryDockIdentifier);
      delete process.env.INVAR_RESTART_PRIMARY_DOCK;
    }
    statusBarSegments.register(CoreStatusBarSegments.Class);
    let panelAddPopup: PanelAddPopup.Instance | null = null;
    let panelPaneAddPopup: PanelAddPopup.Instance | null = null;
    let pendingPanelSplitTargetIdentifier: string | null = null;

    // The terminal chord keeps its established content-specific behavior: select an existing
    // interactive terminal or create one lazily when the workspace has none.
    const toggleTerminal = (): void => {
      const visibleTerminal = visiblePaneOfKind(
        'terminal',
        isRuntimeDefaultPane,
      );
      if (panelHost.visible.value && visibleTerminal) panelHost.hide();
      else {
        const pane = ensureRuntimePane('terminal');
        if (pane) panelHost.showContent(pane.id);
      }
    };
    // The status control owns the generic panel visibility seam. It does not invent content.
    const toggleBottomPanel = (): void => {
      panelHost.toggle();
    };
    statusBarSegments.register({
      segments: () => [],
      controls: () => [
        {
          identifier: 'bottom-panel',
          icon: theme.terminalIcon,
          label: `Toggle Bottom Panel${
            keybindings.bindingHint('panel.toggleTerminal', 'global')
              ? ` (${keybindings.bindingHint('panel.toggleTerminal', 'global')})`
              : ''
          }`,
          active: panelHost.visible.value,
          run: toggleBottomPanel,
        },
      ],
    });

    const toggleRightDock = (): void => {
      // invariant: Right dock command and mouse affordance share one toggle (src/modules/ui/ui.invariants.md)
      rightDockHost.toggle();
      if (rightDockHost.visible.value) panelHost.blur();
    };

    // Reveal through the bound pane target: the source editor and every contributed surface's panes keep their own
    // scroll/selection writer while FindBar retains independent engines for all of them.
    const revealFindMatch = (): void => {
      const match = findBar.engine?.currentMatch;
      if (!match || !findBar.target) return;
      findBar.target.revealMatch(match);
    };

    // Quick-open activation — the SINGLE path shared by the Enter key and a mouse click on a result row,
    // so the two can never diverge. Files mode opens the selected file; the path-navigator opens the
    // CURRENT input path as a workspace (folder rows are drilled into by a click, not opened here).
    const activateQuickOpenSelection = (): void => {
      const path = quickOpen.activate(); // files: a project-ROOT-relative path; workspacePath: an absolute path
      if (quickOpen.mode.value === 'workspacePath') {
        if (!path || !Files.Class.isDir(path)) {
          quickOpen.setError('Enter an existing folder path');
          return;
        }
        quickOpen.close();
        workspaceSet.open(path);
      } else {
        quickOpen.close();
        // Resolve against the workspace root — openFileInTab (like the tree) reads an ABSOLUTE path.
        if (path) {
          workspaceSet.active.openFileInTab(
            Files.Class.join(workspaceSet.active.root, path),
          );
          workspaceSet.active.focusEditor();
        }
      }
    };
    const submitGoToLine = (): void => {
      const target = goToLinePrompt.parse();
      if (!target) return;
      const contributedSurface = view.contributedEditorSurface();
      if (
        contributedSurface?.goToSourceLine &&
        !workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget
      ) {
        contributedSurface.goToSourceLine(target.line);
        goToLinePrompt.close();
        return;
      }
      if (workspaceSet.active.goToLine(target)) goToLinePrompt.close();
    };

    const view = RootView.Class.buildRootView(
      renderer,
      workspaceSet,
      bufferTabStrip,
      workspaceTabStrip,
      theme,
      keybindings,
      commands,
      app,
      contextMenu,
      boundedListPopup,
      tooltip,
      settingsPanel,
      findBar,
      quickOpen,
      goToLinePrompt,
      quitConfirmation,
      shortcutHelp,
      overlayCoordinator,
      panelHost,
      primaryDockHost,
      rightDockHost,
      activitySurface,
      statusBarSegments,
      editorSurfaceContents,
      editorColumnDefault,
      (anchor) => panelAddPopup?.show(anchor),
      (anchor, splitTargetIdentifier) => {
        pendingPanelSplitTargetIdentifier = splitTargetIdentifier ?? null;
        panelPaneAddPopup?.show(anchor);
      },
      toggleRightDock,
      activateQuickOpenSelection,
      revealFindMatch,
      () => requestFindReplaceAll(),
      layoutSlots,
    );
    focusedPanelCaretAnchor = () => view.focusedPanelCaretAnchor();
    openFindTarget = (target): void => {
      overlayCoordinator.openExclusiveOverlay('findBar', () =>
        findBar.openForTarget(target, 'find'),
      );
      revealFindMatch();
    };
    // Every workspace keeps its own dock widths, dock visibility, right-dock content, and bottom
    // panel height. The layout module owns those values; this is only the wiring that tells it
    // which live cells they are. Registered after the view exists, so the defaults it captures are
    // the seeded ones rather than zeroes.
    // invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
    const workspaceLayoutContributor = new WorkspaceLayoutContributor.Class({
      workspaceIsActive: (workspace) =>
        workspaceSet.count > 0 && workspaceSet.active === workspace,
      ports: {
        readSlots: () => ({
          primaryDockVisible: primaryDockHost.visible.value,
          primaryDockColumns: layoutSlots.primaryDockColumns.value,
          rightDockVisible: rightDockHost.visible.value,
          rightDockColumns: layoutSlots.rightDockColumns.value,
          rightDockContentIdentifier: rightDockHost.activeId.value,
          bottomPanelRows: layoutSlots.bottomPanelRows.value,
        }),
        applySlots: (values) => {
          layoutSlots.primaryDockColumns.value = values.primaryDockColumns;
          layoutSlots.rightDockColumns.value = values.rightDockColumns;
          layoutSlots.bottomPanelRows.value = values.bottomPanelRows;
          // Visibility only. `show()` and `hide()` also move the keyboard, and where the keyboard
          // sits is the workspace focus model's own state, restored by its own path — a restore
          // that called them would hand the keyboard to whichever dock happened to be open.
          primaryDockHost.visible.value = values.primaryDockVisible;
          if (!values.primaryDockVisible) primaryDockHost.blur();
          if (values.rightDockContentIdentifier) {
            rightDockHost.activate(values.rightDockContentIdentifier);
          }
          rightDockHost.visible.value = values.rightDockVisible;
          if (!values.rightDockVisible) rightDockHost.blur();
          renderer.requestRender();
        },
      },
    });
    app.onDispose(workspaceSet.registerContributor(workspaceLayoutContributor));
    // A settings-panel edit still resizes the dock on screen. It changes the workspace the user is
    // looking at, never the hidden ones — those keep the widths they were left at.
    app.$watch(
      () => settings.sidebarWidth.value,
      (width) => {
        layoutSlots.primaryDockColumns.value = Math.round(width);
      },
    );
    app.$watch(
      () => settings.rightDockWidth.value,
      (width) => {
        layoutSlots.rightDockColumns.value = Math.round(width);
      },
    );
    editorInteractionIsAvailable = () =>
      !view.modalOverlayOwnsScreen() && !completionPopup.open;
    dismissEditorSuggestions = dismissCompletion;

    // Lazily create + register a runtime's PaneContent on first toggle (idle cost is zero until
    // then). The initial cols×rows seed from the laid-out panel region; the frame loop converges the
    // true size. The host names no runtime: it passes a KIND to the registry and registers whatever
    // comes back.
    const runtimePanes = new Map<string, PaneContent>();
    const runtimeSystemNoteDisposers = new Map<string, () => void>();
    const registerRuntimePaneContent = (content: PaneContent): void => {
      runtimePanes.set(content.id, content);
      const disposeSystemNote = content.onSystemNote?.((note) =>
        systemNoteContributions.publish(note),
      );
      if (disposeSystemNote) {
        runtimeSystemNoteDisposers.set(content.id, disposeSystemNote);
      }
      panelHost.register(content);
      panelContentLifecycle.publishRegistered(content);
    };
    // Build a pane through its contributed runtime. The host supplies identity and the laid-out
    // geometry; the runtime decides what — if anything — it starts behind them.
    const createRuntimePane = (
      kind: string,
      additionalInstance = false,
      process?: PaneRuntimeRequest['process'],
      labelOverride?: string,
      persistedIdentifier?: string,
    ): PaneContent | null => {
      const anyExisting = panelHost.contentsOfKind(kind).length > 0;
      const identity = persistedIdentifier
        ? paneRuntimes.claimPersistedInstanceIdentifier(persistedIdentifier)
          ? {
              identifier: persistedIdentifier,
              label:
                labelOverride ??
                paneRuntimes.runtime(kind)?.instanceLabel ??
                kind,
            }
          : null
        : paneRuntimes.allocateInstanceIdentity(
            kind,
            additionalInstance || anyExisting,
            activeWorkspacePanelWorld.identityScope,
          );
      if (!identity) return null;
      if (runtimePanes.has(identity.identifier)) {
        throw new Error(
          `Runtime pane identifier already belongs to another pane: ${identity.identifier}`,
        );
      }
      const content = paneRuntimes.createPane(kind, {
        identifier: identity.identifier,
        label: labelOverride ?? identity.label,
        columns: view.panelViewportColumns() || 80,
        rows: view.panelViewportRows() || 24,
        workingDirectory: workspaceSet.active.root,
        process,
      });
      if (!content) return null;
      registerRuntimePaneContent(content);
      return content;
    };
    ensureRuntimePane = (kind: string): PaneContent | null =>
      currentPaneOfKind(kind, isRuntimeDefaultPane) ?? createRuntimePane(kind);
    replacePaneWithRuntime = (identifier, runtimeKind): boolean => {
      const replacement = createRuntimePane(runtimeKind, true);
      return replacement
        ? panelHost.replaceContent(identifier, replacement.id)
        : false;
    };
    openRuntimePane = (
      runtimeKind: string,
      request: PaneRuntimeRequest,
    ): boolean => {
      const existingContent = panelHost.content(request.identifier);
      if (existingContent) {
        panelHost.showContent(existingContent.id);
        return true;
      }
      if (runtimePanes.has(request.identifier)) {
        throw new Error(
          `Runtime pane identifier already belongs to another pane: ${request.identifier}`,
        );
      }
      const content = paneRuntimes.createPane(runtimeKind, request);
      if (!content) return false;
      registerRuntimePaneContent(content);
      panelHost.showContent(content.id);
      return true;
    };

    handlePanelContentRemoved = (content): void => {
      if (!runtimePanes.delete(content.id)) return;
      runtimeSystemNoteDisposers.get(content.id)?.();
      runtimeSystemNoteDisposers.delete(content.id);
      paneRuntimes.paneRemoved(content);
    };

    const createContributedPaneInstance = (
      kind: string,
      labelOverride?: string,
      persistedIdentifier?: string,
    ): PaneContent | null => {
      const factory = panelContentFactories.factory(kind);
      if (!factory) return null;
      const label = labelOverride ?? nextWindowLabel(factory.instanceLabel);
      const identifier = persistedIdentifier
        ? paneRuntimes.claimPersistedInstanceIdentifier(persistedIdentifier)
          ? persistedIdentifier
          : null
        : paneRuntimes.allocateInstanceIdentifier();
      if (!identifier) return null;
      const instance = factory.createPane(identifier, label);
      panelHost.register(instance);
      return instance;
    };
    const addPanelContent = (kind: string): void => {
      const content =
        createContributedPaneInstance(kind) ?? createRuntimePane(kind, true);
      if (content) {
        panelHost.createSpaceForContent(content.id, kind);
      }
    };
    openPanelContent = (kind: string): boolean => {
      const content =
        createContributedPaneInstance(kind) ?? createRuntimePane(kind, true);
      if (!content) return false;
      panelHost.createSpaceForContent(content.id, kind);
      return true;
    };
    panelAddPopup = new PanelAddPopup.Class({
      popup: boundedListPopup,
      overlayCoordinator,
      addableKinds: () => [
        ...paneRuntimes.spaceAddableKinds(),
        ...panelContentFactories.addableKinds(),
      ],
      addContent: addPanelContent,
    });
    const nextWindowLabel = (baseLabel: string): string => {
      const count = panelHost.orderedContents.filter((content) => {
        const label = content.instanceLabel ?? '';
        return label === baseLabel || label.startsWith(`${baseLabel} `);
      }).length;
      return count === 0 ? baseLabel : `${baseLabel} ${count + 1}`;
    };
    const addPaneWindow = (entryIdentifier: string): void => {
      const runtimeMenuEntry = paneRuntimes.paneAddMenuEntry(entryIdentifier);
      const factoryMenuEntry =
        panelContentFactories.paneAddMenuEntry(entryIdentifier);
      const content = runtimeMenuEntry
        ? createRuntimePane(
            runtimeMenuEntry.runtimeKind,
            true,
            runtimeMenuEntry.entry.process,
            nextWindowLabel(runtimeMenuEntry.entry.instanceLabel),
          )
        : factoryMenuEntry
          ? createContributedPaneInstance(
              factoryMenuEntry.factoryKind,
              nextWindowLabel(factoryMenuEntry.entry.instanceLabel),
            )
          : null;
      if (!content) return;
      const splitTargetIdentifier = pendingPanelSplitTargetIdentifier;
      pendingPanelSplitTargetIdentifier = null;
      if (
        splitTargetIdentifier &&
        panelHost.addContentToGroup(content.id, splitTargetIdentifier)
      ) {
        return;
      }
      panelHost.showContent(content.id);
    };
    panelPaneAddPopup = new PanelAddPopup.Class({
      popup: boundedListPopup,
      overlayCoordinator,
      title: () =>
        `Add ${panelHost.activeSpace ? panelHost.spaceLabel(panelHost.activeSpace.kind) : 'Pane'}`,
      addableKinds: () => {
        const spaceKind = panelHost.activeSpace?.kind;
        if (!spaceKind) return [];
        return [
          ...paneRuntimes.paneAddMenuEntries(spaceKind),
          ...panelContentFactories
            .paneAddMenuEntries(spaceKind)
            .map(({ entry }) => entry),
        ].map((entry) => ({ kind: entry.identifier, label: entry.label }));
      },
      addContent: addPaneWindow,
    });
    let restoringPanelWorkspaceState = false;
    const restoredPanelWorkspaceState = new WeakSet<Workspace.Instance>();
    const persistedPaneKind = (content: PaneContent): string | null =>
      content instanceof TaskNoticePaneContent.Class
        ? null
        : (content.kind ?? content.id);
    const deadRestoredTaskPaneIdentifiers = new Set<string>();
    persistPanelWorkspaceState = (): void => {
      if (restoringPanelWorkspaceState) return;
      const workspaceRoot = workspaceSet.active.root;
      settings.panelWorkspaceStates.value = {
        ...settings.panelWorkspaceStates.value,
        [workspaceRoot]: PanelWorkspaceState.Class.snapshot(
          panelHost,
          persistedPaneKind,
        ),
      };
      settings.save();
    };
    const restorePane = (pane: PanelWorkspacePaneState): PaneContent | null => {
      if (pane.identifier) {
        const existingContent = panelHost.content(pane.identifier);
        if (existingContent) return existingContent;
        if (pane.identifier.endsWith(':notice')) return null;
      }
      if (pane.kind === 'task-notice') return null;
      const persistedTaskIdentifier = taskLauncher.persistedTaskIdentifier(
        pane.identifier,
        pane.kind,
      );
      if (persistedTaskIdentifier) {
        deadRestoredTaskPaneIdentifiers.add(persistedTaskIdentifier);
        return null;
      }
      return (
        createContributedPaneInstance(pane.kind, pane.label, pane.identifier) ??
        createRuntimePane(
          pane.kind,
          true,
          undefined,
          pane.label,
          pane.identifier,
        )
      );
    };
    restorePanelWorkspaceState = (workspace): void => {
      if (restoredPanelWorkspaceState.has(workspace)) return;
      restoredPanelWorkspaceState.add(workspace);
      const state = settings.panelWorkspaceStates.value[workspace.root];
      if (!state || state.spaces.length === 0) return;
      deadRestoredTaskPaneIdentifiers.clear();
      restoringPanelWorkspaceState = true;
      try {
        panelHost.restoreWorkspaceState(
          PanelWorkspaceState.Class.restore(
            state,
            (pane) => restorePane(pane),
            (kind) => panelHost.declaredSpaceKindForPaneKind(kind),
          ),
        );
      } finally {
        restoringPanelWorkspaceState = false;
      }
      if (deadRestoredTaskPaneIdentifiers.size > 0) {
        settings.panelContentOrder.value =
          settings.panelContentOrder.value.filter(
            (identifier) => !deadRestoredTaskPaneIdentifiers.has(identifier),
          );
      }
      persistPanelWorkspaceState();
    };
    const taskLauncher = new TaskLauncher.Class({
      port: {
        launch: (request) => {
          // invariant: Each task owns one terminal (src/modules/tasks/tasks.invariants.md)
          if (panelHost.has(request.identifier)) {
            panelHost.removeContent(request.identifier);
          }
          // A declared task is the same runtime request as an ordinary terminal, plus the process it
          // declares. The host passes the declaration through; only the runtime knows a PTY is how
          // it gets started.
          const taskPaneRuntimeKind = 'terminal';
          const content = paneRuntimes.createPane(taskPaneRuntimeKind, {
            identifier: request.identifier,
            label: request.label,
            kind: taskPaneRuntimeKind,
            heading: request.label,
            task: request.task,
            columns: view.panelViewportColumns() || 80,
            rows: view.panelViewportRows() || 24,
            workingDirectory: request.workspaceRoot,
            process: {
              command: request.command,
              arguments: request.arguments,
              environment: request.environment,
            },
          });
          if (content) registerRuntimePaneContent(content);
        },
        notice: (request) => {
          const activeSpace = panelHost.activeSpace;
          panelHost.register(
            new TaskNoticePaneContent.Class(
              request,
              activeSpace
                ? {
                    kind: activeSpace.kind,
                    label: panelHost.spaceLabel(activeSpace.kind),
                  }
                : undefined,
            ),
          );
        },
        // invariant: Folder open starts declared tasks (src/modules/tasks/tasks.invariants.md)
        present: (identifiers, transferFocus) => {
          panelHost.split([...identifiers]);
          if (transferFocus) {
            panelHost.show();
          } else {
            panelHost.visible.value = true;
          }
        },
        has: (identifier) => panelHost.has(identifier),
        remove: (identifier) => {
          if (panelHost.has(identifier)) panelHost.removeContent(identifier);
        },
      },
    });
    restorePanelWorkspaceState(workspaceSet.active);
    const tasks = new Tasks.Class({
      commands,
      launcher: taskLauncher,
      builtInDefaultEnabled:
        Environment.Class.env('INVAR_TEST_SUPPRESS_BUILT_IN_TASK') !== '1',
      folderOpenTaskLaunchEnabled:
        Environment.Class.env('INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS') !== '1',
    });
    const disposeTasksContribution = workspaceSet.registerContributor(tasks);
    const disposeTasksStatus = statusProjectionContributions.register({
      snapshot: () => tasks.statusSnapshot(),
    });
    app.onDispose(disposeTasksStatus);
    app.onDispose(disposeTasksContribution);
    app.onDispose(() => {
      panelHost.dispose();
      primaryDockHost.dispose();
      rightDockHost.dispose();
    });

    // Split the two first available runtime panes, or collapse the current split.
    const togglePanelSplit = (): void => {
      if (panelHost.isSplit) {
        panelHost.unsplit();
        return;
      }
      const contents = paneRuntimes
        .defaultSplitKinds()
        .map(({ kind }) => ensureRuntimePane(kind))
        .filter((content): content is PaneContent => content !== null)
        .slice(0, 2);
      if (contents.length === 0) return;
      if (!panelHost.visible.value) panelHost.show();
      panelHost.split(contents.map((content) => content.id));
    };
    const focusPanelContent = (direction: -1 | 1): void => {
      panelHost.cycle(direction);
    };
    const movePanelContent = (direction: -1 | 1): void => {
      const identifier = panelHost.focusedContent?.id;
      if (identifier) panelHost.moveOpenContent(identifier, direction);
    };
    const moveActivityItem = (direction: -1 | 1): void => {
      const identifier = activitySurface.activeIdentifier;
      if (identifier) activitySurface.moveContent(identifier, direction);
    };
    const closeActivePanelContent = (): void => {
      const identifier = panelHost.focusedContent?.id;
      if (identifier) panelHost.closeOpenContent(identifier);
    };

    // Theme + glyph mode are settings-driven (single source): the panel edits settings.theme /
    // settings.glyphMode, and these reactive hooks PUSH the change into the Theme so it live-applies with
    // no restart. GOTCHA reconciled here: the panel's theme option strings ('dark'/'light') are NOT the
    // palette keys ('invar-dark'/'invar-light') — map explicitly, never by string concat.
    const THEME_OPTION_TO_PALETTE_KEY: Record<string, string> = {
      dark: 'invar-dark',
      light: 'invar-light',
    };
    app.$watchEffect(() => {
      const paletteKey =
        THEME_OPTION_TO_PALETTE_KEY[settings.theme.value] ??
        settings.theme.value;
      theme.setPalette(paletteKey);
    });
    app.$watchEffect(() => {
      const mode = settings.glyphMode.value;
      theme.setGlyphLevel(
        mode === 'auto' ? TerminalCapabilities.Class.detectGlyphLevel() : mode,
      );
    });
    let panelTabCycleTimer: ReturnType<typeof setTimeout> | null = null;
    app.$watchEffect(() => {
      const cycling = settings.panelTabCycling.value;
      const visible = panelHost.visible.value;
      const seconds = Math.max(1, settings.panelTabCycleSeconds.value);
      const spaceCount = panelHost.spaces.value.length;
      void panelHost.activeSpaceId.value;
      if (panelTabCycleTimer) clearTimeout(panelTabCycleTimer);
      panelTabCycleTimer = null;
      if (!cycling || !visible || spaceCount < 2) return;
      panelTabCycleTimer = setTimeout(() => {
        panelTabCycleTimer = null;
        panelHost.cycle(1);
        renderer.requestRender();
      }, seconds * 1000);
    });
    app.onDispose(() => {
      if (panelTabCycleTimer) clearTimeout(panelTabCycleTimer);
      panelTabCycleTimer = null;
    });
    app.$watch(
      () => settings.workspaceTabPosition.value,
      (position) =>
        workspaceTabStrip.setOrientation(
          position === 'left' ? 'vertical' : 'horizontal',
        ),
    );
    app.$watch(
      () => workspaceSet.activeWorkspaceIndex.value,
      () =>
        primaryDockHost.activate(
          workspaceSet.active.primaryPaneContentIdentifier.value,
        ),
    );
    app.$watch(
      () => workspaceSet.active.focus.value,
      (focus) => {
        if (focus === 'primaryPane') {
          const contentIdentifier =
            workspaceSet.active.primaryPaneContentIdentifier.value;
          if (contentIdentifier) {
            primaryDockHost.activate(contentIdentifier);
            primaryDockHost.focus();
          }
        } else {
          primaryDockHost.blur();
        }
      },
      // A sidebar click can synchronously focus its pane and then open a file, returning Workspace
      // focus to `editor` in the same input turn. The default queued watcher coalesces that
      // editor→primaryPane→editor round trip to "no change" and leaves PanelHost.focused stale, so
      // the dock steals the next context-bound key. Focus projection is ownership transfer, not
      // deferred enrichment: observe every transition before input routing can see split state.
      { flush: 'sync' },
    );
    // Word wrap toggling (command OR settings panel) switches viewport.scrollTop between LOGICAL-line and
    // VISUAL-row units. Re-anchoring on the cursor sets a valid scrollTop in the new units — no fragile
    // conversion — so the cursor stays on screen. This MUST be a TARGETED watch on settings.wordWrap, NOT
    // a $watchEffect: revealCursor() READS viewport.scrollTop, so a $watchEffect would re-run on EVERY
    // scroll and re-reveal the cursor — snapping a wheel-scroll back to the cursor's line (the "opening a
    // file, wheel does nothing / can't leave the top" bug: cursor at line 0 pinned the viewport at 0).
    app.$watch(
      () => settings.wordWrap.value,
      () => workspaceSet.activeEditor.revealCursor(),
    );
    // Language-provider document sync: every edit bumps document.revision; this targeted watch pushes
    // the new text as a revision-idempotent update (providers skip versions they
    // already sent). A TARGETED watch, not a $watchEffect — the handler must depend on the revision
    // signal only, never on the other state syncActiveDocumentWithLanguageProviders reads.
    app.$watch(
      () => {
        const editor = workspaceSet.activeEditor;
        return editor.hasDocument.value ? editor.document.revision.value : -1;
      },
      () => workspaceSet.active.syncActiveDocumentWithLanguageProviders(),
    );

    // Last mouse event seen (for the observability side channel — proves the mouse path is live).
    let lastMouse: AppStatusMouseEvent | null = null;
    let renderApplication: () => Promise<void>;
    const render = (): Promise<void> => renderApplication();
    let shutdownApplication: () => Promise<void>;
    const shutdown = (): Promise<void> => shutdownApplication();

    // One real composition object owns every graph root and is also what boot returns.
    // Contributor membership comes from ApplicationContributions itself, so installing a
    // contributor cannot create a new observation gap.
    const applicationComposition: BootedApp = {
      app,
      get workspace() {
        return workspaceSet.active;
      },
      workspaceSet,
      bufferTabStrip,
      workspaceTabStrip,
      settings,
      theme,
      commands,
      keybindings,
      findBar,
      quickOpen,
      fileOpenController,
      goToLinePrompt,
      quitConfirmation,
      settingsPanel,
      contextMenu,
      boundedListPopup,
      completionPopup,
      shortcutHelp,
      tooltip,
      panelHost,
      primaryDockHost,
      rightDockHost,
      overlayCoordinator,
      activitySurface,
      statusBarSegments,
      statusProjectionContributions,
      systemNoteContributions,
      panelContentLifecycle,
      editorSurfaceContents,
      editorColumnDefault,
      paneRuntimes,
      panelContentFactories,
      applicationContributions,
      get contributors() {
        return applicationContributions.contributors;
      },
      layoutSlotSizes: layoutSlots,
      pluginPrimaryDockContentIdentifiers,
      view,
      renderer,
      render,
      shutdown,
      get mouse() {
        return lastMouse;
      },
      get terminalPaneContent() {
        return currentPaneOfKind('terminal');
      },
    };
    GraphChannel.Class.arm({
      roots: applicationComposition as unknown as Record<string, unknown>,
      requestRender: () => renderer.requestRender(),
    });
    app.onDispose(() => GraphChannel.Class.disarm());

    // Pull current state into the renderables and request a frame. READ-ONLY over model state
    // (no ref writes), so it is safe to run inside the reactive effect with no feedback loop.
    const paint = (): void => {
      view.beginEditorFrameAttribution();
      try {
        view.update();
      } finally {
        view.completeEditorFrameAttribution();
      }
      boundedListPopup.update();
      completionPopup.update();
      AppStatusProjection.Class.publish(applicationComposition);
      renderer.requestRender();
    };
    // A trackpad can publish about 150 wheel events per second. Each pane consumes every event as
    // an impulse, but the root's bubbled mouse observer needs at most one projection pass per frame:
    // the animation cadence owns subsequent scroll frames.
    const requestFrameAfterWheelInput = throttle(
      () => renderer.requestRender(),
      1000 / renderer.targetFps,
      { leading: true, trailing: false },
    );
    app.onDispose(() => requestFrameAfterWheelInput.cancel());

    // The editor viewport size derives from the rendered layout (non-reactive), so it is synced on
    // the external triggers (boot, resize) — NOT inside the frame effect, which would be a
    // projection→model write feeding the effect it observes.
    // invariant: Rendering is one coarse frame effect (src/modules/app/app.invariants.md)
    const syncSize = (): void => {
      workspaceSet.activeEditor.viewport.setSize(
        view.editorViewportWidth(),
        view.editorViewportHeight(),
      );
    };

    // The single coarse reactive frame effect: observe the load-bearing signals and repaint on ANY
    // change — keyboard input OR an async producer. This lets contributed state or an LSP
    // diagnostic repaint the screen without a keypress.
    // invariant: Rendering is one coarse frame effect (src/modules/app/app.invariants.md)
    app.$watchEffect(() => {
      const workspace = workspaceSet.active;
      const editor = workspace.editor;
      // The whole paint pass is exception-isolated: a throw while projecting model→renderables must
      // degrade this one frame (logged to file) and request a repaint, never wedge the demand-driven
      // loop. The signal reads stay first so reactive dependency tracking is unaffected by the guard.
      // invariant: The render loop never wedges (project.invariants.md)
      // Explicit subscriptions to the load-bearing signals (document.revision in particular is only
      // read indirectly by update(), so touch it here to guarantee content changes repaint).
      void editor.document.revision.value;
      void editor.cursor.line.value;
      void editor.cursor.col.value;
      void editor.cursor.anchor.value;
      void editor.viewport.scrollTop.value;
      void editor.viewport.scrollLeft.value;
      void editor.wordWrap.value;
      void editor.codeFoldingEnabled;
      void editor.foldRevision.value;
      // Contributed editor surfaces subscribe their own paint signals.
      editorSurfaceContents.observePaintSignals();
      void settings.workspaceTabPosition.value;
      // The workspace-owned layout slot sizes. They are read only INDIRECTLY, inside the layout
      // resolve, so they are touched here for the same reason document.revision is: a splitter drag
      // and a workspace switch both change geometry and must repaint.
      // invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
      void layoutSlots.primaryDockColumns.value;
      void layoutSlots.rightDockColumns.value;
      void layoutSlots.bottomPanelRows.value;
      void workspaceSet.entries.value;
      void workspaceSet.activeWorkspaceIndex.value;
      void workspaceTabStrip.scrollOffset.value;
      void bufferTabStrip.scrollOffset.value;
      void workspace.focus.value;
      // The breadcrumb's ‹ › history buttons re-colour (enabled/disabled) as the trail moves.
      void workspace.navigationHistory.currentIndex.value;
      void workspace.navigationHistory.entries.value;
      // Overlay models: the context menu and tooltip repaint on any of their display state.
      void contextMenu.open.value;
      void contextMenu.items.value;
      void contextMenu.anchorX.value;
      void contextMenu.anchorY.value;
      void contextMenu.hoveredIndex.value;
      void contextMenu.selectedIndex.value;
      void boundedListPopup.open.value;
      void boundedListPopup.items.value;
      void boundedListPopup.query.value;
      void boundedListPopup.selectedIndex.value;
      void boundedListPopup.hoveredIndex.value;
      void boundedListPopup.paintRevision.value;
      void completionPopup.paintRevision.value;
      void tooltip.visible.value;
      void tooltip.text.value;
      void tooltip.anchorX.value;
      void tooltip.anchorY.value;
      view.observeHoverRepaint(); // the LSP hover card projects on its reactive paint signal (async landing)
      void commands.open.value;
      void commands.query.value;
      void commands.queryInput.caret.value;
      void commands.queryInput.selectionAnchor.value;
      void quickOpen.open.value; // repaint the quick-open modal on open/query/selection/hover change
      void quickOpen.query.value;
      void quickOpen.queryInput.caret.value;
      void quickOpen.queryInput.selectionAnchor.value;
      void quickOpen.selectedIndex.value;
      void quickOpen.hoveredIndex.value;
      void quickOpen.workspacePathOpenable.value; // repaint the path-alert glyph live as the path changes
      void goToLinePrompt.open.value;
      void goToLinePrompt.input.text.value;
      void goToLinePrompt.input.caret.value;
      void goToLinePrompt.input.selectionAnchor.value;
      void quitConfirmation.open.value;
      void quitConfirmation.focusedChoice.value;
      void findBar.open.value;
      void findBar.engine?.query.value;
      void findBar.focusedInput?.caret.value;
      void findBar.focusedInput?.selectionAnchor.value;
      void findBar.engine?.matches.value;
      void findBar.engine?.currentMatchIndex.value; // repaint the match counter on next/prev
      void findBar.caseSensitive; // repaint the case toggle on flip
      void findBar.wholeWord;
      void findBar.useRegex;
      void findBar.bulkFlowState.value;
      void shortcutHelp.open.value; // repaint the cheat-sheet on open/close and scroll
      void shortcutHelp.scrollTop.value;
      void commands.selectedIndex.value;
      void theme.paletteName.value;
      void app.quitChordArmed.value;
      void app.copyNotice.value;
      // Bottom panel: repaint on visibility/focus/switch AND on the active content's paint signal, so
      // async terminal output (PTY bytes) repaints without a keypress (idle shell bumps nothing → the
      // demand-driven loop stays at rest).
      void panelHost.visible.value;
      void panelHost.focused.value;
      void panelHost.expanded.value;
      void panelHost.activeId.value;
      void panelHost.order.value;
      void panelHost.layout.value;
      void panelHost.focusedIndex.value;
      // Repaint on ANY visible cell's paint signal — a split panel has two live panes, either of which
      // can emit async output (PTY bytes) that must repaint without a keypress.
      for (const content of panelHost.visibleContents())
        void content.renderRevision.value;
      void primaryDockHost.visible.value;
      void primaryDockHost.focused.value;
      void primaryDockHost.activeId.value;
      for (const content of primaryDockHost.visibleContents()) {
        void content.renderRevision.value;
      }
      void rightDockHost.visible.value;
      void rightDockHost.focused.value;
      void rightDockHost.activeId.value;
      void rightDockHost.order.value;
      for (const content of rightDockHost.visibleContents()) {
        void content.renderRevision.value;
      }
      HandlerGuard.Class.run('paint', paint, () => renderer.requestRender());
    });

    // Frame-settle signal for the tmux harness (a frame actually rendered).
    const framePath =
      process.env.TUI_FRAME_PATH ||
      join(
        dirname(StatusChannel.Class.path),
        StatusChannel.Class.path.split('/').pop()!.replace('status', 'frame'),
      );
    let frame = 0;
    // Smooth-scroll animation clock. dt is clamped so a resume from idle (a "paused clock") advances
    // one frame's worth, not the whole idle gap — the paused-clock invariant.
    let lastAnimationTickMilliseconds = 0;
    const MAXIMUM_DELTA_TIME_SECONDS = 0.1; // seconds
    // Animation liveness: while ANY animation runs (any pane's wheel-momentum glide, drag-edge
    // auto-scroll, tooltip dwell), one fixed cadence requests frames. The timer owns absolute
    // deadlines, so frame-listener and paint work cannot accumulate into the next delay. At
    // quiescence the timer stops (frames and status writes cease).
    // invariant: A fast glide crosses rows in many small steps (src/modules/ui/ui.invariants.md)
    // invariant: Cost tracks the actively observed set (project.invariants.md)
    let animationFrameCadenceTimer: ReturnType<typeof setTimeout> | null = null;
    let nextAnimationFrameDeadlineMilliseconds = 0;
    StatusChannel.Class.update({ animationFrameCadenceTimerCount: 0 });
    // Last panel geometry pushed to the terminal — so the resize ioctl fires only on a real change.
    // The panel converge signature: total rows + each cell's id=width. Keyed on the LAYOUT, not just the
    // total width, so splitting/un-splitting/dragging the divider (which redistributes the SAME total
    // width across cells) re-fires setViewportSize — otherwise a cell's child (a real terminal) keeps its
    // pre-split full width because the panel's outer width never changed.
    let lastPanelLayoutKey = '';
    let lastRightDockLayoutKey = '';
    const stopAnimationFrameCadence = (): void => {
      if (animationFrameCadenceTimer !== null) {
        clearTimeout(animationFrameCadenceTimer);
        animationFrameCadenceTimer = null;
      }
      StatusChannel.Class.update({ animationFrameCadenceTimerCount: 0 });
      // Paused-clock: the next animation's first tick gets a fresh delta.
      lastAnimationTickMilliseconds = 0;
      nextAnimationFrameDeadlineMilliseconds = 0;
    };

    const advanceAnimationFrame = (): boolean => {
      const nowMilliseconds = performance.now();
      const deltaTimeSeconds =
        lastAnimationTickMilliseconds === 0
          ? 1 / renderer.targetFps
          : Math.min(
              MAXIMUM_DELTA_TIME_SECONDS,
              (nowMilliseconds - lastAnimationTickMilliseconds) / 1000,
            );
      lastAnimationTickMilliseconds = nowMilliseconds;
      let animating = false;
      // All pane wheel-momentum regimes settle to EXACTLY zero, so `animating`
      // returns to false at rest and quiescence is preserved.
      const workspaceScrollMomentumIsActive =
        workspaceSet.active.tickScrollAnimations(deltaTimeSeconds);
      animating = workspaceScrollMomentumIsActive || animating;
      // invariant: Rendering is one coarse frame effect (src/modules/app/app.invariants.md)
      StatusChannel.Class.update({
        workspaceScrollMomentumAtRest: !workspaceScrollMomentumIsActive,
      });
      // Drag-edge auto-scroll: while a selection drag holds at a pane edge, keep scrolling +
      // extending the selection.
      animating = view.tickDragAutoScroll(deltaTimeSeconds) || animating;
      // The mounted contributed surface advances its own glide + settle-repaint.
      const contributedSurfaceAnimationIsActive =
        view.tickContributedSurface(deltaTimeSeconds);
      animating = contributedSurfaceAnimationIsActive || animating;
      StatusChannel.Class.update({
        contributedSurfaceAnimationAtRest: !contributedSurfaceAnimationIsActive,
      });
      // Tooltip dwell: the frame tick advances the timer; it's just another animation source, so it
      // folds into the SAME single-live-request model (holds a frame while counting, false at rest).
      animating = tooltip.tick(deltaTimeSeconds) || animating;
      // The LSP hover-card dwell advances on the SAME frame tick (holds a frame while counting or while a
      // hover request is in flight, false once the card is shown or disarmed).
      animating = view.tickHover(deltaTimeSeconds) || animating;
      // Every hosted pane's scroll-momentum glide + drag edge-autoscroll advances on the SAME tick and
      // settles to zero at rest (idle-quiescence preserved).
      const panelScrollMomentumIsActive =
        view.tickHostedPaneScroll(deltaTimeSeconds);
      animating = panelScrollMomentumIsActive || animating;
      StatusChannel.Class.update({
        panelScrollMomentumAtRest: !panelScrollMomentumIsActive,
      });
      animating = boundedListPopup.tick(deltaTimeSeconds) || animating;
      animating = completionPopup.tick(deltaTimeSeconds) || animating;
      animating = view.tickOverlayScroll(deltaTimeSeconds) || animating;
      if (!animating) stopAnimationFrameCadence();
      return animating;
    };

    const scheduleAnimationFrame = (): void => {
      const frameIntervalMilliseconds = 1000 / renderer.targetFps;
      const nowMilliseconds = performance.now();
      if (nextAnimationFrameDeadlineMilliseconds === 0) {
        nextAnimationFrameDeadlineMilliseconds =
          nowMilliseconds + frameIntervalMilliseconds;
      }
      const delayMilliseconds = Math.max(
        0,
        nextAnimationFrameDeadlineMilliseconds - nowMilliseconds,
      );
      animationFrameCadenceTimer = setTimeout(() => {
        animationFrameCadenceTimer = null;
        nextAnimationFrameDeadlineMilliseconds += frameIntervalMilliseconds;
        const animating = advanceAnimationFrame();
        // Animation steps mutate reactive projection inputs. Let the one coarse paint effect run
        // before requesting the synchronized frame; otherwise the final settling tick can serialize
        // the previous projection and then stop the cadence with no post-effect frame remaining.
        queueMicrotask(() => renderer.requestRender());
        if (animating) scheduleAnimationFrame();
      }, delayMilliseconds);
      StatusChannel.Class.update({ animationFrameCadenceTimerCount: 1 });
    };

    const frameTick = (): void => {
      frame += 1;
      // A demand-rendered input frame detects a newly active animation. Once
      // active, the deadline timer owns both physics steps and render requests.
      if (animationFrameCadenceTimer === null && advanceAnimationFrame()) {
        scheduleAnimationFrame();
      }
      // Converge the viewport size with the LAID-OUT layout (gutter width changes when a file opens
      // or its line count crosses a digit boundary; boot/resize alone goes stale). Mutating outside
      // the reactive effect: the write triggers one repaint and converges — no feedback loop.
      const editorViewport = workspaceSet.activeEditor.viewport;
      const laidOutWidth = view.editorViewportWidth();
      const laidOutHeight = view.editorViewportHeight();
      if (
        editorViewport.width.value !== laidOutWidth ||
        editorViewport.height.value !== laidOutHeight
      ) {
        editorViewport.setSize(laidOutWidth, laidOutHeight);
        renderer.requestRender(); // one-shot convergence (not an animation — no live request)
      }
      // Converge the terminal's cols×rows with the laid-out panel region (like the editor viewport):
      // resize the emulator + child ONLY on a real change, so the ioctl fires on split/window resize,
      // never per frame. Drives the child's SIGWINCH so `stty size` reflects the new geometry.
      if (panelHost.visible.value) {
        const panelColumns = view.panelViewportColumns();
        const panelRows = view.panelViewportRows();
        const layoutKey = `${panelRows}:${panelHost
          .cellSpans(panelColumns)
          .map((span) => `${span.content.id}=${span.columns}`)
          .join(',')}`;
        if (
          panelColumns > 0 &&
          panelRows > 0 &&
          layoutKey !== lastPanelLayoutKey
        ) {
          lastPanelLayoutKey = layoutKey;
          panelHost.setViewportSize(panelColumns, panelRows);
          renderer.requestRender();
        }
      }
      if (rightDockHost.visible.value) {
        const rightDockColumns = view.rightDockViewportColumns();
        const rightDockRows = view.rightDockViewportRows();
        const layoutKey = `${rightDockColumns}:${rightDockRows}:${rightDockHost.activeId.value ?? ''}`;
        if (
          rightDockColumns > 0 &&
          rightDockRows > 0 &&
          layoutKey !== lastRightDockLayoutKey
        ) {
          lastRightDockLayoutKey = layoutKey;
          rightDockHost.setViewportSize(rightDockColumns, rightDockRows);
          renderer.requestRender();
        }
      }
      // Re-publish the projection AT the settle boundary (harness runs only). The paint effect's
      // publish can be one frame stale here: a close() mutates renderables synchronously, an
      // already-scheduled frame paints the new state and settles, and the effect's re-publish +
      // requestRender lands after this flush with no further frame to carry it — the status file
      // then holds the pre-close state for as long as the app stays quiescent, and every status
      // wait on the closing transition starves (the panel-chrome contention flake, #529).
      // invariant: Rendering is one coarse frame effect (src/modules/app/app.invariants.md)
      if (StatusChannel.Class.observing) {
        AppStatusProjection.Class.publish(applicationComposition);
      }
      StatusChannel.Class.settle(frame);
      // Settle-mode graph answers fire HERE — the same boundary the status
      // projection publishes at, so a graph wait never observes a state no
      // completed frame had.
      GraphChannel.Class.settle();
      // Exact per-cell visual snapshot for tests (env-gated; no-op otherwise).
      FrameProbe.Class.dump(renderer, framePath);
    };
    // A throw in a frame tick (animation step, layout convergence) must not stop the pump: isolate it
    // and keep the loop alive. invariant: The render loop never wedges (project.invariants.md)
    const onFrame = (): void => {
      HandlerGuard.Class.run('frame', frameTick, () =>
        renderer.requestRender(),
      );
    };
    renderer.on('frame', onFrame);
    app.onDispose(() => renderer.off('frame', onFrame));
    app.onDispose(stopAnimationFrameCadence);
    app.onDispose(() => workspaceSet.dispose()); // stop all working-tree watchers + dispose open buffers

    // Awaitable render for boot/resize/harness determinism: sync size, paint, then observe the
    // completed frame requested for that projection. Renderer-wide idle also waits for unrelated
    // terminal capability work, so it is broader than the first-paint condition boot requires.
    renderApplication = async (): Promise<void> => {
      syncSize();
      paint();
      await this.awaitProjectedFrame(renderer);
    };

    let shuttingDown = false;
    shutdownApplication = async (): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      Logging.Class.info('Shutdown start');
      app.$stopEffects(); // stop the frame effect FIRST — no repaint during teardown
      view.dispose();
      boundedListPopup.dispose();
      completionPopup.dispose();
      app.dispose();
      if (restartRequested) options.onRestart?.();
      else options.onQuit?.();
    };
    let restartRequested = false;
    restartApplication = () => {
      restartRequested = true;
      void shutdown();
    };
    confirmQuit = () => {
      void shutdown();
    };

    // invariant: Quit requires explicit confirmation (src/modules/app/app.invariants.md)
    const requestQuit = (): void => {
      // PTY harnesses use Ctrl+Q as their teardown protocol. The shared driver sets this flag by
      // default, while Drive clears it so product exploration always follows the real dialog path.
      if (Environment.Class.env('INVAR_HARNESS_DIRECT_QUIT') === '1') {
        void shutdown();
        return;
      }
      if (quitConfirmation.open.value) {
        quitConfirmation.dismiss();
        return;
      }
      if (workspaceSet.active.pendingCloseTabIndex.value >= 0)
        workspaceSet.active.cancelCloseTab();
      overlayCoordinator.openExclusiveOverlay('quitConfirmation', () =>
        quitConfirmation.show({
          identifier: 'quit',
          message: 'Are you sure you want to quit?',
          confirmLabel: 'Yes',
          cancelLabel: 'No',
          onConfirm: () => confirmQuit(),
        }),
      );
    };

    requestFindReplaceAll = (): void => {
      const request = findBar.replaceAll();
      if (!request) return;
      overlayCoordinator.openExclusiveOverlay('quitConfirmation', () =>
        quitConfirmation.show({
          identifier: 'replace-all-in-file',
          title: 'Replace all in this file',
          message:
            `Replace ${request.metadata.bulkItemCount} items in ` +
            `${request.metadata.displayPath}?\n\n` +
            'The editor will record one undo step.',
          confirmLabel: 'Replace',
          cancelLabel: 'Cancel',
          onConfirm: () => {
            findBar.applyReplaceAll(request);
            revealFindMatch();
          },
          onCancel: () => findBar.cancelReplaceAll(),
        }),
      );
      findBar.bulkFlowState.value = 'awaitingConsent';
    };

    const requestEditorUndo = (): void => {
      const editor = workspaceSet.activeEditor;
      const metadata = editor.nextUndoMetadata;
      if (metadata?.label !== 'Replace All in file') {
        editor.performUndo();
        return;
      }
      overlayCoordinator.openExclusiveOverlay('quitConfirmation', () =>
        quitConfirmation.show({
          identifier: 'undo-replace-all-in-file',
          title: 'Undo Replace All',
          message:
            `Undo will revert ${metadata.bulkItemCount} items in ` +
            `${metadata.displayPath}.`,
          confirmLabel: 'Undo',
          cancelLabel: 'Cancel',
          onConfirm: () => editor.performUndo(),
        }),
      );
    };

    const requestEditorRedo = (): void => {
      const editor = workspaceSet.activeEditor;
      const metadata = editor.nextRedoMetadata;
      if (metadata?.label !== 'Replace All in file') {
        editor.performRedo();
        return;
      }
      overlayCoordinator.openExclusiveOverlay('quitConfirmation', () =>
        quitConfirmation.show({
          identifier: 'redo-replace-all-in-file',
          title: 'Redo Replace All',
          message:
            `Redo will replace ${metadata.bulkItemCount} items in ` +
            `${metadata.displayPath}.`,
          confirmLabel: 'Redo',
          cancelLabel: 'Cancel',
          onConfirm: () => editor.performRedo(),
        }),
      );
    };

    CommandDefaults.Class.registerDefaultCommands(commands, {
      workspaceSet,
      theme,
      openWorkspaceFolder: () =>
        overlayCoordinator.openExclusiveOverlay('quickOpen', () =>
          quickOpen.showWorkspacePath(workspaceSet.active.root),
        ),
      openFile: () => void fileOpenController.open(),
      openGoToLine: () =>
        overlayCoordinator.openExclusiveOverlay('goToLine', () =>
          goToLinePrompt.show(),
        ),
      toggleWordWrap: () => {
        const workspace = workspaceSet.active;
        const contributedSurface = view.contributedEditorSurface();
        if (
          contributedSurface?.toggleWordWrap &&
          !workspace.editorSurfaces.activeDocumentIsKeyboardTarget
        ) {
          contributedSurface.toggleWordWrap();
          return;
        }
        workspace.editor.toggleWordWrap();
      },
      wordWrapEnabled: () => {
        const workspace = workspaceSet.active;
        const contributedSurface = view.contributedEditorSurface();
        return contributedSurface?.wordWrapEnabled !== undefined &&
          !workspace.editorSurfaces.activeDocumentIsKeyboardTarget
          ? contributedSurface.wordWrapEnabled
          : workspace.editor.wordWrap.value;
      },
      goToBottom: () => {
        const workspace = workspaceSet.active;
        const contributedSurface = view.contributedEditorSurface();
        if (
          contributedSurface?.goToBottom &&
          !workspace.editorSurfaces.activeDocumentIsKeyboardTarget
        ) {
          contributedSurface.goToBottom();
          return;
        }
        workspace.editor.gotoBottom();
      },
      quit: requestQuit,
      undo: requestEditorUndo,
      redo: requestEditorRedo,
      requestRender: () => app.requestRender(),
      toggleActivityBar: () => {
        settings.showActivityBar.value = !settings.showActivityBar.value;
        app.requestRender();
      },
      toggleRightDock,
      toggleFocus: () => workspaceSet.active.toggleFocus(),
      toggleTerminal,
      togglePanelSplit,
      focusPreviousPanelContent: () => focusPanelContent(-1),
      focusNextPanelContent: () => focusPanelContent(1),
      movePanelContentUp: () => movePanelContent(-1),
      movePanelContentDown: () => movePanelContent(1),
      moveActivityItemUp: () => moveActivityItem(-1),
      moveActivityItemDown: () => moveActivityItem(1),
      closeActivePanelContent,
      openShortcutHelp: () =>
        overlayCoordinator.openExclusiveOverlay('shortcutHelp', () =>
          shortcutHelp.show(),
        ),
    });

    // --- input: handlers MUTATE model state only; the frame effect repaints. -----------------
    // Accelerated arrows: terminals report key REPEAT (not down/up), so ScrollPhysics infers the
    // shared run from direction and cadence for editor and list consumers.
    // invariant: Terminals report key repeat not key up (project.invariants.md)
    const movementAcceleration = (
      key: KeyEvent,
      movementScope: 'editor' | 'editorSurface',
    ): number =>
      scrollPhysics.keyAccelerationFor(`${movementScope}:${key.name}`);
    const isTypedCharacter = (key: KeyEvent): boolean =>
      TextInputKey.Class.isTypedCharacter(key);
    const completionPrefix = (): {
      text: string;
      range: {
        start: { line: number; column: number };
        end: { line: number; column: number };
      };
    } => {
      const editor = workspaceSet.activeEditor;
      const line = editor.cursor.line.value;
      const endColumn = editor.cursor.col.value;
      const lineText = editor.document.line(line);
      const linePrefix = lineText.slice(
        0,
        TextCoordinates.Class.graphemeToU16(lineText, endColumn),
      );
      const text = linePrefix.match(/[\p{L}\p{N}_$]+$/u)?.[0] ?? '';
      return {
        text,
        range: {
          start: {
            line,
            column: endColumn - TextCoordinates.Class.graphemeCount(text),
          },
          end: { line, column: endColumn },
        },
      };
    };
    const requestCompletion = (
      triggerKind: 'invoked' | 'triggerCharacter',
      triggerCharacter?: string,
    ): void => {
      const workspace = workspaceSet.active;
      const editor = workspace.editor;
      if (!editor.hasDocument.value || workspace.focus.value !== 'editor')
        return;
      const document = editor.document;
      const path = document.path;
      const revision = document.revision.value;
      const position = {
        line: editor.cursor.line.value,
        column: editor.cursor.col.value,
      };
      const requestPrefix = completionPrefix();
      const requestGeneration = ++completionRequestGeneration;
      completionRequestPending = true;
      void workspace
        .completionAt(position, { triggerKind, triggerCharacter })
        .then((completionList) => {
          const activeEditor = workspaceSet.activeEditor;
          if (requestGeneration !== completionRequestGeneration) return;
          completionRequestPending = false;
          const currentPrefix = completionPrefix();
          const prefixExtendedWhileRequestWasPending =
            activeEditor.document === document &&
            activeEditor.document.path === path &&
            activeEditor.cursor.line.value === position.line &&
            currentPrefix.range.start.line === requestPrefix.range.start.line &&
            currentPrefix.range.start.column ===
              requestPrefix.range.start.column &&
            currentPrefix.text.startsWith(requestPrefix.text);
          if (
            activeEditor.document !== document ||
            activeEditor.document.path !== path ||
            (activeEditor.document.revision.value !== revision &&
              !prefixExtendedWhileRequestWasPending) ||
            activeEditor.cursor.line.value !== position.line ||
            (activeEditor.cursor.col.value !== position.column &&
              !prefixExtendedWhileRequestWasPending)
          )
            return;
          if (
            activeEditor.document.revision.value !== revision &&
            (completionList.isIncomplete || completionList.items.length === 0)
          ) {
            requestCompletion('invoked');
            return;
          }
          const anchor = view.editorCaretAnchor();
          if (!anchor || completionList.items.length === 0) {
            dismissCompletion();
            return;
          }
          completionPopup.show(
            completionList,
            anchor,
            currentPrefix.text,
            (item) => {
              const currentPrefix = completionPrefix();
              const originalTextEdit = item.textEdit;
              const itemTextEditMatchesOriginalPrefix =
                originalTextEdit !== null &&
                originalTextEdit.range.start.line ===
                  requestPrefix.range.start.line &&
                originalTextEdit.range.start.column ===
                  requestPrefix.range.start.column &&
                originalTextEdit.range.end.line ===
                  requestPrefix.range.end.line &&
                originalTextEdit.range.end.column ===
                  requestPrefix.range.end.column;
              const acceptedItem =
                itemTextEditMatchesOriginalPrefix && originalTextEdit
                  ? {
                      ...item,
                      textEdit: {
                        newText: originalTextEdit.newText,
                        range: {
                          start: originalTextEdit.range.start,
                          end: currentPrefix.range.end,
                        },
                      },
                    }
                  : item;
              workspaceSet.activeEditor.applyCompletion(
                acceptedItem,
                currentPrefix.range,
              );
            },
          );
        })
        .catch(() => {
          if (requestGeneration === completionRequestGeneration)
            dismissCompletion();
        });
    };
    // invariant: Plugin boundaries grant one authority (project.invariants.md)
    const scheduleIdentifierCompletionRequest = (): void => {
      if (
        identifierCompletionRequestScheduled ||
        completionRequestPending ||
        completionPopup.open
      )
        return;
      identifierCompletionRequestScheduled = true;
      queueMicrotask(() => {
        if (!identifierCompletionRequestScheduled) return;
        identifierCompletionRequestScheduled = false;
        if (
          completionRequestPending ||
          completionPopup.open ||
          completionPrefix().text.length === 0
        )
          return;
        requestCompletion('invoked');
      });
    };

    // ---------------------------------------------------------------------------------------------
    // Keyboard: ONE decode layer (OpenTUI) -> registry resolution (pure data lookup) -> action
    // dispatch. No chord conditionals live here — bindings are data in keybindings.defaults/mac.
    // invariant: Bindings are intent addressed (src/modules/keybindings/keybindings.invariants.md)
    const activeTextInputPort = (): PaneTextInputPort | null => {
      // The bounded popup is modal and topmost, so its search field owns text input first.
      if (boundedListPopup.acceptsQueryInput) {
        return boundedListPopup;
      }
      if (findBar.open.value) {
        return findBar;
      }
      if (quickOpen.open.value) {
        return quickOpen;
      }
      if (commands.open.value) {
        return commands;
      }
      if (goToLinePrompt.open.value) {
        return goToLinePrompt;
      }
      const primaryDockTextInput = primaryDockHost.focused.value
        ? primaryDockHost.focusedContent?.capability?.<PaneTextInputPort>(
            'text-input',
          )
        : null;
      if (primaryDockTextInput) {
        return primaryDockTextInput;
      }
      const rightDockTextInput =
        rightDockHost.focusedContent?.capability?.<PaneTextInputPort>(
          'text-input',
        );
      if (rightDockHost.focused.value && rightDockTextInput) {
        return rightDockTextInput;
      }
      const focusedContent = panelHost.focusedContent;
      return (
        focusedContent?.capability?.<PaneTextInputPort>('text-input') ?? null
      );
    };

    const applyTextInputAction = (action: TextInputAction): void => {
      const inputPort = activeTextInputPort();
      if (!inputPort) return;
      inputPort.applyInputAction(action);
      if (inputPort === findBar) revealFindMatch();
    };

    const copyPathTelemetryEnabled =
      process.env.INVAR_COPY_PATH_TELEMETRY === '1';
    const logCopyAttempt = (attempt: CopyPathTelemetryAttempt): void => {
      if (!copyPathTelemetryEnabled) return;
      Logging.Class.info(`COPY_PATH_TELEMETRY ${JSON.stringify(attempt)}`);
    };
    let clipboardCopyCompletionCount = 0;
    const publishCopyResult = (
      copyPromise: Promise<number>,
      telemetryContext?: CopyPathTelemetryContext,
    ): void => {
      void copyPromise.then((copiedCharacters) => {
        if (copiedCharacters > 0) {
          app.copyNotice.value =
            `Copied ${copiedCharacters} chars ` +
            `(${Clipboard.Class.lastBackend ?? 'no backend'})`;
        }
        clipboardCopyCompletionCount += 1;
        StatusChannel.Class.update({
          lastCopyChars: copiedCharacters,
          lastCopyHash: Clipboard.Class.lastCopiedTextHash,
          clipboardBackend: Clipboard.Class.lastBackend,
          clipboardCopyCompletionCount,
        });
        StatusChannel.Class.flush();
        if (telemetryContext) {
          logCopyAttempt({
            focusedSurface: telemetryContext.focusedSurface,
            selectionOwner: telemetryContext.selectionOwner,
            selectionLength:
              telemetryContext.selectionLength ?? copiedCharacters,
            routeTaken: telemetryContext.routeTaken,
            osc52Emitted:
              copiedCharacters > 0 && Clipboard.Class.lastOsc52Emitted,
            osc52ByteLength:
              copiedCharacters > 0 ? Clipboard.Class.lastOsc52ByteLength : 0,
          });
        }
      });
    };
    copyPaneSelection = (content): void => {
      const selection =
        content.capability?.<PaneTextSelectionPort>('text-selection');
      if (!selection) return;
      const telemetry = selection.selectionTelemetry?.();
      publishCopyResult(selection.copySelection(), {
        focusedSurface: content.kind ?? content.id,
        selectionOwner: telemetry?.owner ?? content.kind ?? content.id,
        selectionLength: telemetry?.characterLength ?? null,
        routeTaken: 'copy-handler',
      });
    };

    // The ACTION TABLE: every binding's action id -> its handler. Handlers receive the raw KeyEvent
    // for parameters that compose (shift = extend; repeat runs = acceleration).
    const actionHandlers: Record<string, (key: KeyEvent) => void> = {
      'app.quit': requestQuit,
      'find.open': () => {
        const target = view.findTarget();
        if (!target) return;
        overlayCoordinator.openExclusiveOverlay('findBar', () =>
          findBar.openForTarget(target, 'find'),
        );
        revealFindMatch();
      },
      'find.replace': () => {
        const target = view.findTarget();
        if (!target) return;
        overlayCoordinator.openExclusiveOverlay('findBar', () =>
          findBar.openForTarget(target, 'replace'),
        );
        revealFindMatch();
      },
      'quickopen.open': () =>
        overlayCoordinator.openExclusiveOverlay(
          'quickOpen',
          () => void quickOpen.show(workspaceSet.active.root),
        ),
      'workspace.openFolder': () =>
        overlayCoordinator.openExclusiveOverlay('quickOpen', () =>
          quickOpen.showWorkspacePath(workspaceSet.active.root),
        ),
      'file.open': () => void fileOpenController.open(),
      'workspace.close': () => {
        workspaceSet.closeActive();
      },
      'workspace.next': () => {
        workspaceSet.cycle(1);
      },
      'workspace.previous': () => {
        workspaceSet.cycle(-1);
      },
      'palette.open': () =>
        overlayCoordinator.openExclusiveOverlay('commandPalette', () =>
          commands.openPalette(),
        ),
      'palette.close': () => commands.closePalette(),
      'palette.run': () => commands.runSelected(),
      'palette.previous': () => commands.moveSelection(-1),
      'palette.next': () => commands.moveSelection(1),
      'goToLine.close': () => goToLinePrompt.close(),
      'goToLine.submit': submitGoToLine,
      'textInput.moveLeft': () => applyTextInputAction('moveLeft'),
      'textInput.moveRight': () => applyTextInputAction('moveRight'),
      'textInput.moveWordLeft': () => applyTextInputAction('moveWordLeft'),
      'textInput.moveWordRight': () => applyTextInputAction('moveWordRight'),
      'textInput.moveHome': () => applyTextInputAction('moveHome'),
      'textInput.moveEnd': () => applyTextInputAction('moveEnd'),
      'textInput.selectLeft': () => applyTextInputAction('selectLeft'),
      'textInput.selectRight': () => applyTextInputAction('selectRight'),
      'textInput.selectWordLeft': () => applyTextInputAction('selectWordLeft'),
      'textInput.selectWordRight': () =>
        applyTextInputAction('selectWordRight'),
      'textInput.selectHome': () => applyTextInputAction('selectHome'),
      'textInput.selectEnd': () => applyTextInputAction('selectEnd'),
      'textInput.selectAll': () => applyTextInputAction('selectAll'),
      'textInput.copy': () => {
        const inputPort = activeTextInputPort();
        if (inputPort) publishCopyResult(inputPort.copyInputSelection());
      },
      'textInput.backspace': () => applyTextInputAction('backspace'),
      'textInput.deleteForward': () => applyTextInputAction('deleteForward'),
      'textInput.deletePreviousWord': () =>
        applyTextInputAction('deletePreviousWord'),
      'textInput.deleteNextWord': () => applyTextInputAction('deleteNextWord'),
      'textInput.deleteLine': () => applyTextInputAction('deleteLine'),
      'find.toggleCaseSensitive': () => {
        findBar.toggleCaseSensitive();
        revealFindMatch();
      },
      'find.toggleWholeWord': () => {
        findBar.toggleWholeWord();
        revealFindMatch();
      },
      'find.toggleRegex': () => {
        findBar.toggleRegex();
        revealFindMatch();
      },
      'dialog.copy': () => publishCopyResult(view.dialogCopySelection()),
      'focus.toggle': () => workspaceSet.active.toggleFocus(),
      'settings.toggle': () => {
        if (settingsPanel.open.value) settingsPanel.close();
        else
          overlayCoordinator.openExclusiveOverlay('settingsPanel', () =>
            settingsPanel.toggle(),
          );
      },
      'settings.close': () => settingsPanel.close(),
      // The cheat-sheet: the same chord toggles; Esc closes; arrows/pages scroll the row window.
      // invariant: The shortcut sheet lists the effective bindings (src/modules/ui/ui.invariants.md)
      'help.shortcuts': () => {
        if (shortcutHelp.open.value) shortcutHelp.close();
        else
          overlayCoordinator.openExclusiveOverlay('shortcutHelp', () =>
            shortcutHelp.show(),
          );
      },
      'help.close': () => shortcutHelp.close(),
      'help.up': () => view.scrollShortcutHelpBy(-1),
      'help.down': () => view.scrollShortcutHelpBy(1),
      'help.pageUp': () =>
        view.scrollShortcutHelpBy(-view.shortcutHelpViewportRows()),
      'help.pageDown': () =>
        view.scrollShortcutHelpBy(view.shortcutHelpViewportRows()),
      'settings.up': () => settingsPanel.moveSelection(-1),
      'settings.down': () => settingsPanel.moveSelection(1),
      'settings.increase': () => settingsPanel.adjust(1),
      'settings.decrease': () => settingsPanel.adjust(-1),
      'settings.copy': () => publishCopyResult(view.settingsCopySelection()),
      'buffer.close': () => workspaceSet.active.closeActiveTab(),
      'buffer.next': () => workspaceSet.active.cycleTab(1),
      'buffer.previous': () => workspaceSet.active.cycleTab(-1),
      // Ctrl+] parity with Ctrl/Cmd+click: definition of the symbol AT THE CURSOR.
      'go.definition': () => void workspaceSet.active.goToDefinition(),
      // Browser-style Go Back / Go Forward through the navigation trail (Alt+Left / Alt+Right). Safe no-ops
      // at the ends of the history.
      'navigation.back': () => workspaceSet.active.navigateBack(),
      'navigation.forward': () => workspaceSet.active.navigateForward(),
      // Ctrl+Shift+B shows/hides the whole activity bar (same setting-flip the palette command runs).
      'view.toggleActivityBar': () => {
        settings.showActivityBar.value = !settings.showActivityBar.value;
        app.requestRender();
      },
      'view.toggleRightDock': toggleRightDock,
      // Movement arrives through the REBINDABLE command, not a raw-key intercept, so a remapped
      // chord still drives whichever surface owns the keyboard.
      'editor.moveUp': (key) => {
        const workspace = workspaceSet.active;
        if (!workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          view
            .contributedEditorSurface()
            ?.scrollFocusedPaneByRows(
              -movementAcceleration(key, 'editorSurface'),
            );
        else
          workspace.editor.moveVertical(
            -movementAcceleration(key, 'editor'),
            key.shift,
          );
      },
      'editor.completion': () => requestCompletion('invoked'),
      'editor.moveDown': (key) => {
        const workspace = workspaceSet.active;
        if (!workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          view
            .contributedEditorSurface()
            ?.scrollFocusedPaneByRows(
              movementAcceleration(key, 'editorSurface'),
            );
        else
          workspace.editor.moveVertical(
            movementAcceleration(key, 'editor'),
            key.shift,
          );
      },
      'editor.moveLeft': (key) => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget) {
          workspace.editor.moveHorizontal(
            -movementAcceleration(key, 'editor'),
            key.shift,
          );
        }
      },
      'editor.moveRight': (key) => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget) {
          workspace.editor.moveHorizontal(
            movementAcceleration(key, 'editor'),
            key.shift,
          );
        }
      },
      'editor.pageUp': (key) => {
        const workspace = workspaceSet.active;
        if (!workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          view.contributedEditorSurface()?.pageFocusedPane(-1);
        else workspace.editor.pageUp(key.shift);
      },
      'editor.pageDown': (key) => {
        const workspace = workspaceSet.active;
        if (!workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          view.contributedEditorSurface()?.pageFocusedPane(1);
        else workspace.editor.pageDown(key.shift);
      },
      'editor.lineStart': (key) => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.moveToLineStart(key.shift);
      },
      'editor.lineEnd': (key) => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.moveToLineEnd(key.shift);
      },
      'editor.jumpUp': (key) => {
        const workspace = workspaceSet.active;
        if (!workspace.editorSurfaces.activeDocumentIsKeyboardTarget) {
          view
            .contributedEditorSurface()
            ?.scrollFocusedPaneByRows(
              -scrollPhysics.jumpRowsFor(`editorSurface:${key.name}`),
            );
          return;
        }
        workspace.editor.moveVertical(
          -scrollPhysics.jumpRowsFor(`editor:${key.name}`),
          key.shift,
        );
      },
      'editor.jumpDown': (key) => {
        const workspace = workspaceSet.active;
        if (!workspace.editorSurfaces.activeDocumentIsKeyboardTarget) {
          view
            .contributedEditorSurface()
            ?.scrollFocusedPaneByRows(
              scrollPhysics.jumpRowsFor(`editorSurface:${key.name}`),
            );
          return;
        }
        workspace.editor.moveVertical(
          scrollPhysics.jumpRowsFor(`editor:${key.name}`),
          key.shift,
        );
      },
      'editor.wordLeft': (key) => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.moveWordHorizontal(-1, key.shift);
      },
      'editor.wordRight': (key) => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.moveWordHorizontal(1, key.shift);
      },
      'editor.documentStart': (key) => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.moveDocumentStart(key.shift);
      },
      'editor.documentEnd': (key) => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.moveDocumentEnd(key.shift);
      },
      'editor.newline': () => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.insertNewline();
      },
      'editor.backspace': () => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.backspace();
      },
      'editor.delete': () => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.deleteChar();
      },
      'editor.deleteToLineStart': () => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          workspace.editor.deleteToLineStart();
      },
      'edit.deletePreviousWord': () => {
        if (workspaceSet.active.editorSurfaces.activeDocumentIsKeyboardTarget)
          commands.run('edit.deletePreviousWord');
      },
      'editor.escape': () => {
        const workspace = workspaceSet.active;
        if (!workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          view.contributedEditorSurface()?.yieldKeyboardToSourceEditor();
        else if (workspace.editor.hasSelection)
          workspace.editor.cursor.clearSelection();
        else workspace.focusPrimaryPane();
      },
      'editor.save': () => workspaceSet.active.saveActiveFile(),
      'editor.selectAll': () => {
        const workspace = workspaceSet.active;
        if (!workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          view.contributedEditorSurface()?.selectAllInFocusedPane();
        else workspace.editor.selectAll();
      },
      'editor.copy': () => {
        // Publish how many characters landed on the clipboard — the observable proof that copy
        // actually copied (the human-QA "cannot copy" bug's verification channel).
        // An engaged hover card with a selection owns Ctrl+C — copy ITS text, not the editor's
        // beneath. Otherwise the mounted contributed surface is asked whether it owns a selection;
        // a null answer falls through to the source editor.
        const contributedSurfaceCopy =
          view.contributedEditorSurface()?.copySelection() ?? null;
        const copyPromise = view.hoverHasSelection()
          ? view.hoverCopySelection()
          : (contributedSurfaceCopy ??
            workspaceSet.activeEditor.copySelection());
        publishCopyResult(copyPromise);
      },
      // Copy from whichever focused pane publishes a text-selection port; the host never learns
      // which pane that is. The word actions exist so the terminal context claims those chords —
      // handling is the pane's own, reached by forwarding the original key.
      'terminal.copy': () => {
        const focusedContent =
          panelHost.focusedContent ?? currentPaneOfKind('terminal');
        if (!focusedContent) return;
        copyPaneSelection(focusedContent);
      },
      'terminal.wordLeft': (key) => panelHost.handleKey(key),
      'terminal.wordRight': (key) => panelHost.handleKey(key),
      'terminal.deletePreviousWord': (key) => panelHost.handleKey(key),
      'editor.cut': () => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          void workspace.editor.cutSelection();
      },
      'editor.paste': () => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          void workspace.editor.pasteClipboard();
      },
      'editor.undo': () => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          requestEditorUndo();
      },
      'editor.redo': () => {
        const workspace = workspaceSet.active;
        if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
          requestEditorRedo();
      },
      'editor.moveLineUp': () => workspaceSet.activeEditor.moveLineUp(),
      'editor.moveLineDown': () => workspaceSet.activeEditor.moveLineDown(),
      'editor.duplicateLine': () => workspaceSet.activeEditor.duplicateLine(),
      'editor.indent': () => workspaceSet.activeEditor.indent(),
      'editor.outdent': () => workspaceSet.activeEditor.outdent(),
      // Toggle the terminal from any mode, including from within its own focused PTY. The status-bar
      // control toggles generic panel visibility instead, so opening an empty panel does not create content.
      'panel.toggleTerminal': toggleTerminal,
      'panel.toggleSplit': togglePanelSplit,
      'panel.contentsPrevious': () => focusPanelContent(-1),
      'panel.contentsNext': () => focusPanelContent(1),
      'panel.contentsMoveUp': () => movePanelContent(-1),
      'panel.contentsMoveDown': () => movePanelContent(1),
      'panel.contentsClose': closeActivePanelContent,
      'menu.previous': () => contextMenu.moveSelection(-1),
      'menu.next': () => contextMenu.moveSelection(1),
      'menu.run': () => contextMenu.runSelected(),
      'menu.close': () => contextMenu.close(),
      'listPopup.previous': () => boundedListPopup.moveSelection(-1),
      'listPopup.next': () => boundedListPopup.moveSelection(1),
      'listPopup.run': () => boundedListPopup.runSelected(),
      'listPopup.drill': () => boundedListPopup.drillSelected(),
      'listPopup.navigateBackward': () => boundedListPopup.navigateBackward(),
      'listPopup.close': () => boundedListPopup.close(),
      'listPopup.erase': () => boundedListPopup.eraseQueryCharacter(),
    };
    const dispatchAction = (action: string, key: KeyEvent): void => {
      const handler = actionHandlers[action];
      if (handler) handler(key);
      else commands.run(action);
    };

    const inputOverlayOpeningActionIdentifiers = new Set([
      'find.open',
      'find.replace',
      'quickopen.open',
      'editor.goToLine',
      'workspace.openFolder',
      'file.open',
      'palette.open',
      'settings.toggle',
      'help.shortcuts',
    ]);

    // The find/replace bar's key handling, shared VERBATIM by the two routes that reach it — the global
    // 'find' context (the source editor and every contributed surface's own targets) and the focused agent pane's interception
    // (the transcript target) — so transcript search speaks the ONE find vocabulary: type = live query,
    // Enter/Shift+Enter cycle + reveal, Tab switches field, Esc closes (returning keys to whatever owns
    // them beneath — the editor there, the agent composer here).
    const handleFindBarKey = (key: KeyEvent): void => {
      // Ctrl+H arrives as the ASCII Backspace control byte (0x08) — same normalization as the router.
      const rawControlH = key.name === 'backspace' && key.sequence === '\u0008';
      const normalizedChordEvent = {
        name: rawControlH ? 'h' : key.name,
        ctrl: rawControlH ? true : key.ctrl,
        shift: key.shift,
        option: key.option || key.meta,
        super: key.super,
      };
      const findResolution = keybindings.resolve(
        normalizedChordEvent,
        'find',
        Date.now(),
      );
      if (findResolution.action) {
        dispatchAction(findResolution.action, key);
        return;
      }
      if (key.name === 'escape') {
        findBar.close();
        return;
      }
      if (key.name === 'return') {
        if (key.ctrl && key.shift) requestFindReplaceAll();
        else if (key.ctrl) findBar.replaceCurrent();
        else if (key.shift) findBar.previous();
        else findBar.next();
        revealFindMatch();
        return;
      }
      if (key.name === 'tab') {
        findBar.switchField();
        return;
      }
      if (key.name === 'backspace') {
        findBar.applyInputAction('backspace');
        revealFindMatch();
        return;
      }
      if (isTypedCharacter(key)) {
        findBar.append(key.sequence);
        revealFindMatch();
        return;
      }
      // swallow other keys while the bar is open
    };

    const keyTick = (key: KeyEvent): void => {
      const workspace = workspaceSet.active;
      applicationContributions.observeKey(key);
      tooltip.clear(); // any keypress hides the tooltip (display-only affordance)
      // Escape always closes the hover card; any other key closes it too UNLESS the pointer is engaged
      // with it (over the card / dragging a selection) — so a sticky card lets Ctrl+C copy its selection.
      if (key.name === 'escape') view.dismissHover();
      else view.dismissHoverSoft();
      // RESERVED GLOBAL CHORDS (quit) are escape hatches that must fire from ANY mode — checked BEFORE
      // every modal/search branch below, or a focused find/quick-open/settings input would swallow the
      // quit key and TRAP the user with no way out (a hard no-dead-ends / learnability failure). The
      // check is stateless (single-chord match only), so it never disturbs the chord resolver below.
      // invariant: Reserved global chords fire from any mode (src/modules/keybindings/keybindings.invariants.md)
      const reservedGlobalAction = keybindings.resolveReservedGlobal({
        name: key.name,
        ctrl: key.ctrl,
        shift: key.shift,
        option: key.option || key.meta,
        super: key.super,
      });
      if (reservedGlobalAction) {
        dispatchAction(reservedGlobalAction, key);
        return;
      }
      if (quitConfirmation.open.value) {
        const dialogResolution = keybindings.resolve(
          {
            name: key.name,
            ctrl: key.ctrl,
            shift: key.shift,
            option: key.option || key.meta,
            super: key.super,
          },
          'dialog',
          Date.now(),
        );
        if (dialogResolution.action) {
          dispatchAction(dialogResolution.action, key);
          return;
        }
        if (key.name === 'escape') quitConfirmation.dismiss();
        else if (key.name === 'left') quitConfirmation.focusPrevious();
        else if (key.name === 'right' || key.name === 'tab')
          quitConfirmation.focusNext();
        else if (key.name === 'return')
          quitConfirmation.activateFocusedChoice();
        return;
      }
      // Same MODAL contract for closing a tab with unsaved edits.
      if (workspace.pendingCloseTabIndex.value >= 0) {
        if (key.name === 'y') workspace.confirmCloseTab();
        else workspace.cancelCloseTab();
        return;
      }

      // The exclusive overlay slot owns EVERY key before focused pane content. Pane focus is retained
      // beneath the overlay so closing returns naturally, but it cannot outrank the modal owner while
      // the overlay is open. The previous order routed Escape into a focused terminal/agent first:
      // Settings remained open even though OpenTUI had decoded and delivered the bare Escape correctly.
      // invariant: Input overlays share one modal slot (src/modules/ui/ui.invariants.md)
      const modalOverlayOwnsScreen = view.modalOverlayOwnsScreen();

      const dockOwnsKeyboard =
        (primaryDockHost.visible.value && primaryDockHost.focused.value) ||
        (rightDockHost.visible.value && rightDockHost.focused.value);
      const panelOwnsKeyboard =
        panelHost.visible.value && panelHost.focused.value;
      if (!modalOverlayOwnsScreen && (dockOwnsKeyboard || panelOwnsKeyboard)) {
        const applicationGlobalAction = keybindings.resolveApplicationGlobal({
          name: key.name,
          ctrl: key.ctrl,
          shift: key.shift,
          option: key.option || key.meta,
          super: key.super,
        });
        if (applicationGlobalAction) {
          dispatchAction(applicationGlobalAction, key);
          return;
        }
      }
      if (!modalOverlayOwnsScreen && dockOwnsKeyboard) {
        const activityResolution = keybindings.resolve(
          {
            name: key.name,
            ctrl: key.ctrl,
            shift: key.shift,
            option: key.option || key.meta,
            super: key.super,
          },
          'activity',
          Date.now(),
        );
        if (activityResolution.action?.startsWith('activity.')) {
          dispatchAction(activityResolution.action, key);
          return;
        }
      }

      if (
        !modalOverlayOwnsScreen &&
        primaryDockHost.visible.value &&
        primaryDockHost.focused.value
      ) {
        const content = primaryDockHost.focusedContent;
        const contentContext = content?.keybindingContext;
        if (contentContext) {
          const resolution = keybindings.resolve(
            {
              name: key.name,
              ctrl: key.ctrl,
              shift: key.shift,
              option: key.option || key.meta,
              super: key.super,
            },
            contentContext,
            Date.now(),
          );
          if (resolution.action) {
            dispatchAction(resolution.action, key);
            return;
          }
        }
        if (content?.handleKey(key)) return;
      }

      // A focused bottom panel owns the keyboard: every key not claimed by a reserved or
      // application-global binding is delivered to the active PaneContent's handleKey. An unencodable
      // key is swallowed so it never drives the hidden editor beneath.
      // invariant: A focused panel routes keystrokes to its active pane content (src/modules/ui/ui.invariants.md)
      if (!modalOverlayOwnsScreen && panelOwnsKeyboard) {
        const panelResolution = keybindings.resolve(
          {
            name: key.name,
            ctrl: key.ctrl,
            shift: key.shift,
            option: key.option || key.meta,
            super: key.super,
          },
          'panel',
          Date.now(),
        );
        if (panelResolution.action?.startsWith('panel.contents')) {
          dispatchAction(panelResolution.action, key);
          return;
        }
        // A focused pane that declares its own keybinding context resolves in it, and the PANE says
        // whether it claims the resolved action right now. A declined action falls through to raw
        // input — that is how a terminal without a selection still sends Ctrl+C as SIGINT. The host
        // reads no pane type and no action vocabulary.
        //
        // A binding scoped to the pane dispatches here. A global binding dispatches only when the
        // pane has no raw-input owner. Terminal and agent panes declare that owner, so Ctrl+P,
        // Ctrl+F, Ctrl+S, and Ctrl+, still reach their child or composer instead.
        // invariant: A focused pane consumes only its own scoped bindings (src/modules/ui/ui.invariants.md)
        const contextOwningPane: PaneContent | null = panelHost.focusedContent;
        const paneKeybindingContext = contextOwningPane?.keybindingContext;
        if (contextOwningPane) {
          const paneContextResolution = paneKeybindingContext
            ? keybindings.resolve(
                {
                  name: key.name,
                  ctrl: key.ctrl,
                  shift: key.shift,
                  option: key.option || key.meta,
                  super: key.super,
                },
                paneKeybindingContext,
                Date.now(),
              )
            : panelResolution;
          const paneContextAction = paneContextResolution.action;
          const paneContextActionBelongsToFocusedPane =
            paneContextAction !== null &&
            paneKeybindingContext !== undefined &&
            paneContextResolution.context === paneKeybindingContext;
          const globalActionBelongsToHost =
            paneContextAction !== null &&
            paneContextResolution.context === 'global' &&
            contextOwningPane.ownsRawKeyInput !== true;
          if (globalActionBelongsToHost && paneContextAction) {
            dispatchAction(paneContextAction, key);
            return;
          }
          const paneClaimsContextAction =
            paneContextAction !== null &&
            (contextOwningPane.claimsContextAction?.(paneContextAction) ??
              true);
          if (
            paneContextActionBelongsToFocusedPane &&
            paneContextAction &&
            paneClaimsContextAction
          ) {
            dispatchAction(paneContextAction, key);
            return;
          }
          if (
            paneContextActionBelongsToFocusedPane &&
            !paneClaimsContextAction
          ) {
            const backgroundSelection = panelHost
              .visibleContents()
              .filter((content) => content !== contextOwningPane)
              .map((content) => ({
                content,
                selection:
                  content.capability?.<PaneTextSelectionPort>(
                    'text-selection',
                  ) ?? null,
              }))
              .find(({ selection }) => selection?.hasSelection());
            const selectionTelemetry =
              backgroundSelection?.selection?.selectionTelemetry?.();
            if (backgroundSelection?.selection) {
              logCopyAttempt({
                focusedSurface: contextOwningPane.kind ?? contextOwningPane.id,
                selectionOwner:
                  selectionTelemetry?.owner ??
                  backgroundSelection.content.kind ??
                  backgroundSelection.content.id,
                selectionLength: selectionTelemetry?.characterLength ?? 0,
                routeTaken: 'forwarded-to-child-pty',
                osc52Emitted: false,
                osc52ByteLength: 0,
              });
            }
          }
        }
        panelHost.handleKey(key);
        return;
      }
      if (
        !modalOverlayOwnsScreen &&
        rightDockHost.visible.value &&
        rightDockHost.focused.value
      ) {
        // Same contract as the primary dock above: a focused dock content that declares its own
        // keybinding context resolves in it (structure's Up/Down/Enter), then raw keys fall
        // through to handleKey. The host reads no content type and no action vocabulary.
        const rightDockContent = rightDockHost.focusedContent;
        const rightDockContext = rightDockContent?.keybindingContext;
        if (rightDockContext) {
          const rightDockResolution = keybindings.resolve(
            {
              name: key.name,
              ctrl: key.ctrl,
              shift: key.shift,
              option: key.option || key.meta,
              super: key.super,
            },
            rightDockContext,
            Date.now(),
          );
          if (rightDockResolution.action) {
            dispatchAction(rightDockResolution.action, key);
            return;
          }
        }
        rightDockHost.handleKey(key);
        return;
      }

      // Context menu is MODAL: keys resolve ONLY in the 'menu' context (bindings are registry
      // data); anything that is not a menu action closes the menu and is CONSUMED — no keystroke
      // both dismisses the menu and acts on what is beneath it.
      // invariant: A context menu is modal and single-consumer (src/modules/ui/ui.invariants.md)
      if (contextMenu.open.value) {
        const menuResolution = keybindings.resolve(
          {
            name: key.name,
            ctrl: key.ctrl,
            shift: key.shift,
            option: key.option || key.meta,
            super: key.super,
          },
          'menu',
          Date.now(),
        );
        if (menuResolution.action?.startsWith('menu.'))
          dispatchAction(menuResolution.action, key);
        else if (
          menuResolution.action &&
          inputOverlayOpeningActionIdentifiers.has(menuResolution.action)
        ) {
          dispatchAction(menuResolution.action, key);
        } else contextMenu.close();
        return;
      }

      // Bounded lists are modal and single-consumer. Printable keys edit the optional query; all
      // other unbound keys are consumed without reaching the editor below.
      if (boundedListPopup.open.value) {
        const listPopupResolution = keybindings.resolve(
          {
            name: key.name,
            ctrl: key.ctrl,
            shift: key.shift,
            option: key.option || key.meta,
            super: key.super,
          },
          'listPopup',
          Date.now(),
        );
        // `listPopup.*` drives the list; `textInput.*` drives the search field — word movement, word
        // deletion, Home/End, and delete-line reach it through the same action table every other
        // one-line input uses.
        if (
          listPopupResolution.action?.startsWith('listPopup.') ||
          listPopupResolution.action?.startsWith('textInput.')
        ) {
          dispatchAction(listPopupResolution.action, key);
        } else if (
          listPopupResolution.action &&
          inputOverlayOpeningActionIdentifiers.has(listPopupResolution.action)
        ) {
          dispatchAction(listPopupResolution.action, key);
        } else if (isTypedCharacter(key)) {
          boundedListPopup.appendQuery(key.sequence);
        }
        return;
      }

      // Completion is deliberately non-modal: the editor retains focus and continues mutating the
      // document while this adapter consumes only its navigation/acceptance keys.
      if (completionPopup.open && workspace.focus.value === 'editor') {
        const completionKeyIsUnmodified =
          !key.ctrl && !key.shift && !key.option && !key.meta && !key.super;
        if (completionKeyIsUnmodified && key.name === 'escape') {
          dismissCompletion();
          return;
        }
        if (
          completionKeyIsUnmodified &&
          (key.name === 'up' || key.name === 'down')
        ) {
          completionPopup.moveSelection(key.name === 'up' ? -1 : 1);
          return;
        }
        if (
          completionKeyIsUnmodified &&
          (key.name === 'return' || key.name === 'tab')
        ) {
          completionPopup.acceptSelected();
          return;
        }
        if (completionKeyIsUnmodified && key.name === 'backspace') {
          workspace.editor.backspace();
          const prefix = completionPrefix();
          if (completionPopup.sourceIsIncomplete) requestCompletion('invoked');
          else completionPopup.narrow(prefix.text);
          return;
        }
        if (isTypedCharacter(key)) {
          workspace.editor.insertText(key.sequence);
          const prefix = completionPrefix();
          const triggerCharacters = workspace.completionTriggerCharacters();
          const isTriggerCharacter = triggerCharacters.includes(key.sequence);
          if (isTriggerCharacter) {
            requestCompletion('triggerCharacter', key.sequence);
          } else if (completionPopup.sourceIsIncomplete) {
            requestCompletion('invoked');
          } else {
            completionPopup.narrow(prefix.text);
          }
          return;
        }
        dismissCompletion();
      }

      // The cheat-sheet is an input-capturing overlay: while open, keys resolve in its 'help'
      // context (Esc closes, arrows scroll, global chords still work — opening another overlay
      // closes the sheet through the coordinator) and unbound keys are consumed.
      const context = shortcutHelp.open.value
        ? 'help'
        : settingsPanel.open.value
          ? 'settings'
          : commands.open.value
            ? 'palette'
            : goToLinePrompt.open.value
              ? 'goToLine'
              : quickOpen.open.value
                ? 'quickopen'
                : findBar.open.value
                  ? 'find'
                  : workspace.focus.value;

      // Ctrl+H is the ASCII Backspace control byte (0x08); OpenTUI correctly decodes that legacy byte
      // as {name:'backspace', ctrl:false}. A physical Backspace is DEL (0x7f), so the byte sequences are
      // distinguishable. Normalize raw 0x08 back to the intent-addressed Ctrl+H chord before registry
      // resolution; the action remains DATA (`find.replace`), and ordinary Backspace remains editing.
      const rawControlH = key.name === 'backspace' && key.sequence === '\u0008';
      const normalizedChordEvent = {
        name: rawControlH ? 'h' : key.name,
        ctrl: rawControlH ? true : key.ctrl,
        shift: key.shift,
        option: key.option || key.meta,
        super: key.super,
      };

      // Quick-open (Ctrl+P) modal: type filters the fuzzy file list live, ↑/↓ move, Enter opens the
      // selected file as a tab (add-or-focus), Esc closes. Inline like the palette's query editing.
      if (context === 'quickopen') {
        const quickOpenResolution = keybindings.resolve(
          normalizedChordEvent,
          'quickopen',
          Date.now(),
        );
        if (quickOpenResolution.action) {
          dispatchAction(quickOpenResolution.action, key);
          return;
        }
        if (key.name === 'escape') {
          quickOpen.close();
          return;
        }
        if (key.name === 'up') {
          quickOpen.moveSelection(-1);
          return;
        }
        if (key.name === 'down') {
          quickOpen.moveSelection(1);
          return;
        }
        if (key.name === 'return') {
          activateQuickOpenSelection(); // the SAME path a click on a result row runs
          return;
        }
        if (key.name === 'backspace') {
          quickOpen.applyQueryInputAction('backspace');
          return;
        }
        if (isTypedCharacter(key)) {
          quickOpen.insertQuery(key.sequence);
          return;
        }
        return;
      }

      if (context === 'goToLine') {
        const goToLineResolution = keybindings.resolve(
          normalizedChordEvent,
          'goToLine',
          Date.now(),
        );
        if (goToLineResolution.action) {
          dispatchAction(goToLineResolution.action, key);
          return;
        }
        if (isTypedCharacter(key)) goToLinePrompt.append(key.sequence);
        return;
      }

      // Find/replace bar has keyboard: type edits the focused field (live find), Enter/Shift+Enter cycle
      // matches, Ctrl+Enter replaces, Tab switches field, Esc closes. Handled inline (not via the registry)
      // because it composes typed input with the match-reveal, like the palette's query editing. The body
      // is the SHARED handler — the focused agent pane routes to the same one for its transcript target.
      if (context === 'find') {
        handleFindBarKey(key);
        return;
      }

      // iTerm2 "Natural Text Editing" remaps Cmd+Left → a RAW ^A byte (0x01), which collides with
      // Ctrl+A = Select All. Under the Kitty protocol a PHYSICALLY pressed Ctrl+A arrives as the kitty
      // form (`key.sequence === 'a'`, an escape-encoded event), so a raw 0x01 control byte here is the
      // Cmd remap → line start. We divert it BEFORE resolving (the registry can't tell them apart:
      // both are {name:'a', ctrl:true}), and ONLY when Kitty is active — on a legacy terminal a raw ^A
      // really is Ctrl+A and must stay Select All. (Cmd+Right = raw ^E is handled by the Ctrl+E binding,
      // which is harmless because Ctrl+E was unbound.) Driven-verified against the real byte streams.
      if (
        context === 'editor' &&
        workspace.editorSurfaces.activeDocumentIsKeyboardTarget &&
        renderer.useKittyKeyboard &&
        key.ctrl &&
        key.name === 'a' &&
        key.sequence === '\u0001'
      ) {
        workspace.editor.moveToLineStart(key.shift);
        return;
      }

      const resolution = keybindings.resolve(
        // Alt-family collapse: mac terminals surface Option as `option` OR `meta` (ESC-prefixed
        // forms); both mean the alt slot of a chord pattern.
        normalizedChordEvent,
        context,
        Date.now(),
      );

      // A contributed surface occupies the editor column, but it has no child byte sink. Global
      // bindings therefore keep their host meaning before the surface gets its own keys. A binding
      // scoped to the editor still reaches the surface first, so its comparison or preview movement
      // stays local instead of driving the hidden buffer.
      // invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
      if (
        context === 'editor' &&
        !workspace.editorSurfaces.activeDocumentIsKeyboardTarget &&
        resolution.action &&
        resolution.context === 'global'
      ) {
        dispatchAction(resolution.action, key);
        return;
      }

      // The surface consumes its own keys before editor-scoped actions drive the hidden buffer. The
      // host does not know which keys those are — the surface answers true when it handled one.
      if (
        context === 'editor' &&
        !workspace.editorSurfaces.activeDocumentIsKeyboardTarget &&
        view.contributedEditorSurface()?.handleKey(key)
      ) {
        return;
      }

      app.quitChordArmed.value = resolution.chordPending; // status-bar hint mirrors the pending chord
      if (resolution.action) {
        dispatchAction(resolution.action, key);
        return;
      }
      if (resolution.chordPending) return;
      // Residual defaults: unbound printable keys TYPE in type-accepting contexts.
      if (context === 'palette' && isTypedCharacter(key))
        commands.appendQuery(key.sequence);
      else if (
        context === 'editor' &&
        isTypedCharacter(key) &&
        workspace.editorSurfaces.activeDocumentIsKeyboardTarget
      ) {
        workspace.editor.insertText(key.sequence);
        const prefix = completionPrefix();
        const isTriggerCharacter = workspace
          .completionTriggerCharacters()
          .includes(key.sequence);
        if (isTriggerCharacter)
          requestCompletion('triggerCharacter', key.sequence);
        else if (prefix.text.length > 0) scheduleIdentifierCompletionRequest();
      }
      // No explicit render here — any model mutation above triggers the frame effect.
    };
    // A throw while handling a keystroke must not wedge the loop: isolate + repaint so the app stays
    // responsive. invariant: The render loop never wedges (project.invariants.md)
    const onKey = (key: KeyEvent): void => {
      HandlerGuard.Class.run(
        'keypress',
        () => keyTick(key),
        () => app.requestRender(),
      );
    };
    renderer.keyInput.on('keypress', onKey);
    app.onDispose(() => renderer.keyInput.off('keypress', onKey));

    // Bracketed paste (DECSET 2004) is part of the app-owned mode bundle TerminalSession enters at
    // startup and RE-enters on every recovery — never enabled inline here, or the tab-refocus recovery
    // forgets it and paste/dictation dies until restart (the mode-ownership-split bug).
    // A framed paste yields NO keypresses, so OpenTUI's paste event is the ONLY delivery path.
    // invariant: A focused panel routes keystrokes to its active pane content (src/modules/ui/ui.invariants.md)
    // invariant: Bracketed paste survives stream chunking (src/modules/ui/ui.invariants.md)
    // Route a paste to the same target the keyboard has: the focused panel pane,
    // else a focused single-line modal input (quick-open / find), else the editor. Mirrors
    // keyTick's dispatch order so paste lands exactly where typing would.
    const pasteTick = (text: string): void => {
      if (!text) return;
      const channelDropPaths = ChannelDropNotification.Class.decode(text);
      if (channelDropPaths) {
        pathDropController.handlePaths(channelDropPaths);
        return;
      }
      if (pathDropController.handlePaste(text)) return;
      if (panelHost.visible.value && panelHost.focused.value) {
        panelHost.handlePaste(text);
        return; // a focused panel owns paste even if its pane has no sink — never leak to the editor
      }
      if (rightDockHost.visible.value && rightDockHost.focused.value) {
        rightDockHost.handlePaste(text);
        return;
      }
      const singleLine = text.replace(/[\r\n]+/g, ' ');
      if (boundedListPopup.open.value) {
        if (boundedListPopup.searchEnabled)
          boundedListPopup.appendQuery(singleLine);
        return;
      }
      if (quickOpen.open.value) {
        quickOpen.insertQuery(singleLine);
        return;
      }
      if (goToLinePrompt.open.value) {
        goToLinePrompt.append(singleLine);
        return;
      }
      if (findBar.open.value) {
        findBar.append(singleLine);
        return;
      }
      // Other overlays (palette, settings, help, menu) have no free-text paste target — consume it so a
      // paste never drives the editor hidden beneath an open overlay.
      if (
        commands.open.value ||
        goToLinePrompt.open.value ||
        settingsPanel.open.value ||
        shortcutHelp.open.value ||
        contextMenu.open.value
      )
        return;
      const workspace = workspaceSet.active;
      if (workspace.editorSurfaces.activeDocumentIsKeyboardTarget)
        workspace.editor.pasteText(text);
    };
    const onPaste = (event: { bytes: Uint8Array }): void => {
      HandlerGuard.Class.run(
        'paste',
        () => pasteTick(new TextDecoder().decode(event.bytes)),
        () => app.requestRender(),
      );
    };
    renderer.keyInput.on('paste', onPaste);
    app.onDispose(() => renderer.keyInput.off('paste', onPaste));

    // Global mouse capture: events bubble to the root renderable. Records the last event to the
    // status channel (verification) and repaints. Per-region handlers (tree, sidebar, dividers) are
    // attached on their own renderables and run before this via propagation.
    const onMouse = (event: {
      type: string;
      x: number;
      y: number;
      button: number;
    }): void => {
      HandlerGuard.Class.run(
        'mouse',
        () => {
          lastMouse = {
            type: event.type,
            x: event.x,
            y: event.y,
            button: event.button,
          };
          if (pointerTrailEnabled && event.type !== 'up') {
            pointerTrailEvents.push({
              x: event.x,
              y: event.y,
              atMs: Date.now(),
              kind:
                event.type === 'down'
                  ? 'click'
                  : event.type === 'scroll'
                    ? 'scroll'
                    : 'move',
            });
            if (pointerTrailEvents.length > 64) pointerTrailEvents.shift();
            // A bare move may change nothing reactive; the wake still needs
            // frames to fade through.
            renderer.requestRender();
          }
          // Focus-follows-click for the bottom panel: a down OUTSIDE the visible panel blurs it (a down
          // inside is handled by the panel box, which focuses it). Keeps typing from going to a shell you
          // clicked away from.
          if (
            event.type === 'down' &&
            panelHost.focused.value &&
            !view.panelContainsPoint(event.x, event.y)
          ) {
            panelHost.blur();
          }
          if (
            event.type === 'down' &&
            rightDockHost.focused.value &&
            !view.rightDockContainsPoint(event.x, event.y) &&
            !view.activityBarContainsPoint(event.x, event.y)
          ) {
            rightDockHost.blur();
          }
          if (
            rightDockHost.visible.value &&
            !view.rightDockContainsPoint(event.x, event.y)
          ) {
            view.clearRightDockContentPointer();
          }
          if (event.type === 'down') tooltip.clear(); // any click hides the tooltip, wherever it lands
          if (event.type === 'down' && completionPopup.open) {
            const geometry = completionPopup.geometry;
            const insideCompletion =
              geometry !== null &&
              event.x >= geometry.boxLeft &&
              event.x < geometry.boxLeft + geometry.boxWidth &&
              event.y >= geometry.boxTop &&
              event.y < geometry.boxTop + geometry.boxHeight;
            if (!insideCompletion) dismissCompletion();
          }
          // A click hides the hover card UNLESS it lands ON the card (engaged): a down on the card begins a
          // drag-select and must not dismiss it; a down anywhere else closes it.
          if (event.type === 'down') view.dismissHoverSoft();
          if (event.type === 'scroll') requestFrameAfterWheelInput();
          else paint();
        },
        () => renderer.requestRender(),
      );
    };
    renderer.root.onMouse = onMouse;
    app.onDispose(() => {
      if (renderer.root.onMouse === onMouse) renderer.root.onMouse = undefined;
    });

    // --- terminal session-state recovery ----------------------------------------------------------
    // A VS Code terminal tab (and others) reset the terminal session state on tab-hide and neither
    // restore it nor redraw on return — leaving termios raw mode reverted (Ctrl+Q eaten by XON flow
    // control), mouse SGR + focus reporting dropped (dead wheel/click), and a stale frame (looks
    // frozen). On focus-in we re-enter the FULL terminal setup + force a repaint, restoring all three.
    // invariant: The render loop never wedges (project.invariants.md)
    const writeSequence = (sequence: string): void => {
      try {
        process.stdout.write(sequence);
      } catch {
        /* stdout gone (shutdown) — nothing to assert against */
      }
    };
    // Enter the app-owned mode bundle at startup: focus reporting (so \e[I arrives and recovery
    // triggers — OpenTUI's setup also enables it, this is idempotent insurance) AND bracketed paste
    // (paste/dictation delivery). Leave the bundle on exit so the shell is left clean.
    TerminalSession.Class.enterAppModes(writeSequence);
    app.onDispose(() => TerminalSession.Class.leaveAppModes(writeSequence));

    const onFocus = (): void => {
      HandlerGuard.Class.run(
        'focus',
        () => {
          // termios raw + mouse + focus + alt-screen (OpenTUI's routine) + the app modes (2004/1004)
          TerminalSession.Class.reenterTerminalModes(renderer, writeSequence);
          syncSize();
          paint(); // push current model→renderables; resume() already armed the full repaint
        },
        () => renderer.requestRender(),
      );
    };
    renderer.on('focus', onFocus);
    app.onDispose(() => renderer.off('focus', onFocus));

    const onResize = (): void => {
      HandlerGuard.Class.run(
        'resize',
        () => {
          // invariant: A controlling PTY resize reaches the renderer (src/modules/terminal/terminal.invariants.md)
          // Re-assert the app-owned modes (some terminals drop them on the geometry change that
          // accompanies a tab-return) then re-lay-out + full-repaint. render() → processResize forces a
          // full repaint on a genuine size change; a same-size return is handled by onFocus above.
          StatusChannel.Class.update({
            width: renderer.width,
            height: renderer.height,
          });
          TerminalSession.Class.enterAppModes(writeSequence);
          void render();
        },
        () => renderer.requestRender(),
      );
    };
    renderer.on('resize', onResize);
    app.onDispose(() => renderer.off('resize', onResize));

    // DEMAND-DRIVEN rendering: auto() renders only on requestRender()/live requests — no continuous
    // targetFps loop at rest (the idle-leak fix: at-rest frame delta must be 0). Animations hold a
    // live request below and drop it on quiescence.
    renderer.auto();
    await render();
    await new Promise<void>((resolve) => {
      RenderRequest.Class.afterCurrentTurn(() => {
        app.markStarted();
        void render().then(resolve);
      });
    });

    Logging.Class.info('Boot complete');
    return applicationComposition;
  }
}

export namespace Bootstrap {
  export const $Class = Static($Bootstrap);
  export let Class = $Class;
}

export interface BootOptions {
  root?: string;
  onQuit?: () => void;
  onRestart?: () => void;
  plugins?: readonly ApplicationContributor[];
  createSourceTextViews?: () => SourceTextViewProvider;
}

export interface BootedApp extends AppStatusProjectionPorts {
  app: App.Instance;
  workspace: Workspace.Instance;
  workspaceSet: WorkspaceSet.Instance;
  bufferTabStrip: TabStrip.Instance;
  workspaceTabStrip: TabStrip.Instance;
  settings: Settings.Instance;
  theme: Theme.Instance;
  commands: CommandRegistry.Instance;
  keybindings: KeybindingRegistry.Instance;
  findBar: FindBar.Instance;
  quickOpen: QuickOpen.Instance;
  fileOpenController: FileOpenController.Model;
  goToLinePrompt: GoToLinePrompt.Model;
  quitConfirmation: Dialog.Model;
  settingsPanel: SettingsPanel.Instance;
  contextMenu: ContextMenu.Instance;
  boundedListPopup: BoundedListPopup.Instance;
  completionPopup: CompletionPopup.Instance;
  shortcutHelp: ShortcutHelp.Instance;
  tooltip: Tooltip.Instance;
  panelHost: PanelHost.Instance;
  primaryDockHost: PanelHost.Instance;
  rightDockHost: PanelHost.Instance;
  overlayCoordinator: OverlayCoordinator.Instance;
  activitySurface: ActivitySurface.Model;
  statusBarSegments: StatusBarSegments.Model;
  statusProjectionContributions: StatusProjectionContributions.Model;
  systemNoteContributions: SystemNoteContributions.Model;
  panelContentLifecycle: PanelContentLifecycle.Model;
  editorSurfaceContents: EditorSurfaceContents.Model;
  editorColumnDefault: EditorColumnDefault.Model;
  paneRuntimes: PaneRuntimes.Model;
  panelContentFactories: PanelContentFactories.Model;
  applicationContributions: ApplicationContributions.Instance;
  contributors: Readonly<Record<string, ApplicationContributor>>;
  layoutSlotSizes: LayoutSlots.Instance;
  view: RootView;
  terminalPaneContent: PaneContent | null;
  renderer: CliRenderer;
  render(): Promise<void>;
  shutdown(): Promise<void>;
}

interface WorkspacePanelWorld {
  readonly contentSet: PanelContentSet;
  readonly identityScope: string;
}

interface CopyPathTelemetryContext {
  readonly focusedSurface: string;
  readonly selectionOwner: string;
  readonly selectionLength: number | null;
  readonly routeTaken: CopyPathTelemetryAttempt['routeTaken'];
}

interface CopyPathTelemetryAttempt {
  readonly focusedSurface: string;
  readonly selectionOwner: string;
  readonly selectionLength: number;
  readonly routeTaken: 'copy-handler' | 'forwarded-to-child-pty';
  readonly osc52Emitted: boolean;
  readonly osc52ByteLength: number;
}
