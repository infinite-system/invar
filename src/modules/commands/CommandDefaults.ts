import { Static } from 'ivue/extras';
import type { CommandRegistry } from './CommandRegistry';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { Theme } from '../theme/Theme';

// Default command set — the core is complete without plugins, so every essential action is
// registered here. Plugins (M7) contribute additional commands to the same registry.
// invariant: The host canvas is complete without plugins (project.invariants.md)
class $CommandDefaults {
  static registerDefaultCommands(
    registry: CommandRegistry.Instance,
    context: CommandContext,
  ): void {
    const getEditor = () => context.workspaceSet.activeEditor;
    const hasDocument = () => getEditor().hasDocument.value;

    registry.registerAll([
      {
        id: 'workspace.openFolder',
        title: 'Workspace: Open Folder',
        category: 'Workspace',
        run: context.openWorkspaceFolder,
      },
      {
        id: 'workspace.close',
        title: 'Workspace: Close Project',
        category: 'Workspace',
        when: () => context.workspaceSet.count > 1,
        run: () => context.workspaceSet.closeActive(),
      },
      {
        id: 'workspace.next',
        title: 'Workspace: Next Project',
        category: 'Workspace',
        when: () => context.workspaceSet.count > 1,
        run: () => context.workspaceSet.cycle(1),
      },
      {
        id: 'workspace.previous',
        title: 'Workspace: Previous Project',
        category: 'Workspace',
        when: () => context.workspaceSet.count > 1,
        run: () => context.workspaceSet.cycle(-1),
      },
      {
        id: 'file.save',
        title: 'File: Save',
        category: 'File',
        when: hasDocument,
        run: () => {
          context.workspaceSet.active.saveActiveFile();
        },
      },
      {
        id: 'edit.undo',
        title: 'Edit: Undo',
        category: 'Edit',
        when: hasDocument,
        run: () => getEditor().performUndo(),
      },
      {
        id: 'edit.redo',
        title: 'Edit: Redo',
        category: 'Edit',
        when: hasDocument,
        run: () => getEditor().performRedo(),
      },
      {
        id: 'edit.deletePreviousWord',
        title: 'Edit: Delete Previous Word',
        category: 'Edit',
        when: hasDocument,
        run: () => getEditor().deletePreviousWord(),
      },
      {
        id: 'edit.moveLineUp',
        title: 'Edit: Move Line Up',
        category: 'Edit',
        when: hasDocument,
        run: () => getEditor().moveLineUp(),
      },
      {
        id: 'edit.moveLineDown',
        title: 'Edit: Move Line Down',
        category: 'Edit',
        when: hasDocument,
        run: () => getEditor().moveLineDown(),
      },
      {
        id: 'edit.duplicateLine',
        title: 'Edit: Duplicate Line',
        category: 'Edit',
        when: hasDocument,
        run: () => getEditor().duplicateLine(),
      },
      {
        id: 'view.focusEditor',
        title: 'View: Focus Editor',
        category: 'View',
        when: hasDocument,
        run: () => context.workspaceSet.active.focusEditor(),
      },
      {
        id: 'view.toggleTheme',
        title: 'View: Toggle Light/Dark Theme',
        category: 'View',
        run: () => context.theme.toggleDark(),
      },
      {
        id: 'view.toggleWordWrap',
        title: 'View: Toggle Word Wrap',
        category: 'View',
        actionIcons: { editorFrame: 'wordWrap' },
        when: hasDocument,
        toggled: context.wordWrapEnabled,
        run: context.toggleWordWrap,
      },
      {
        id: 'editor.fold',
        title: 'Editor: Fold Region',
        category: 'Editor',
        when: hasDocument,
        run: () => getEditor().foldAtCursor(),
      },
      {
        id: 'editor.unfold',
        title: 'Editor: Unfold Region',
        category: 'Editor',
        when: hasDocument,
        run: () => getEditor().unfoldAtCursor(),
      },
      {
        id: 'view.toggleActivityBar',
        title: 'View: Toggle Activity Bar',
        category: 'View',
        run: context.toggleActivityBar,
      },
      {
        id: 'view.toggleRightDock',
        title: 'View: Toggle Right Dock',
        category: 'View',
        run: context.toggleRightDock,
      },
      {
        id: 'focus.toggle',
        title: 'Toggle Sidebar/Editor Focus',
        category: 'View',
        run: context.toggleFocus,
      },
      {
        id: 'panel.toggleTerminal',
        title: 'Panel: Toggle Terminal',
        category: 'Panel',
        run: context.toggleTerminal,
      },
      {
        id: 'panel.toggleSplit',
        title: 'Panel: Toggle Split',
        category: 'Panel',
        run: context.togglePanelSplit,
      },
      {
        id: 'panel.contentsPrevious',
        title: 'Panel: Focus Previous Content',
        category: 'Panel',
        run: context.focusPreviousPanelContent,
      },
      {
        id: 'panel.contentsNext',
        title: 'Panel: Focus Next Content',
        category: 'Panel',
        run: context.focusNextPanelContent,
      },
      {
        id: 'panel.contentsMoveUp',
        title: 'Panel: Move Content Up',
        category: 'Panel',
        run: context.movePanelContentUp,
      },
      {
        id: 'panel.contentsMoveDown',
        title: 'Panel: Move Content Down',
        category: 'Panel',
        run: context.movePanelContentDown,
      },
      {
        id: 'activity.moveItemUp',
        title: 'View: Move Activity Item Up',
        category: 'View',
        run: context.moveActivityItemUp,
      },
      {
        id: 'activity.moveItemDown',
        title: 'View: Move Activity Item Down',
        category: 'View',
        run: context.moveActivityItemDown,
      },
      {
        id: 'panel.contentsClose',
        title: 'Panel: Close Active Content',
        category: 'Panel',
        run: context.closeActivePanelContent,
      },
      {
        id: 'go.definition',
        title: 'Go: Definition',
        category: 'Go',
        when: hasDocument,
        run: () => void context.workspaceSet.active.goToDefinition(),
      },
      {
        id: 'navigation.back',
        title: 'Go: Back',
        category: 'Go',
        run: () => context.workspaceSet.active.navigateBack(),
      },
      {
        id: 'navigation.forward',
        title: 'Go: Forward',
        category: 'Go',
        run: () => context.workspaceSet.active.navigateForward(),
      },
      {
        id: 'editor.goToLine',
        title: 'Editor: Go to Line',
        category: 'Editor',
        actionIcons: { editorFrame: 'goToLine' },
        when: hasDocument,
        run: context.openGoToLine,
      },
      {
        id: 'go.top',
        title: 'Go: Top of File',
        category: 'Go',
        when: hasDocument,
        run: () => getEditor().gotoTop(),
      },
      {
        id: 'go.bottom',
        title: 'Go: Bottom of File',
        category: 'Go',
        actionIcons: { editorFrame: 'goToBottom' },
        when: hasDocument,
        run: context.goToBottom,
      },
      {
        id: 'help.shortcuts',
        title: 'Help: Keyboard Shortcuts',
        category: 'Help',
        run: context.openShortcutHelp,
      },
      {
        id: 'app.quit',
        title: 'Application: Quit',
        category: 'Application',
        run: () => context.quit(),
      },
    ]);
  }
}

export namespace CommandDefaults {
  export const $Class = Static($CommandDefaults);
  export let Class = $Class;
}

export interface CommandContext {
  workspaceSet: WorkspaceSet.Instance;
  theme: Theme.Instance;
  openWorkspaceFolder: () => void;
  openGoToLine: () => void;
  toggleWordWrap: () => void;
  wordWrapEnabled: () => boolean;
  goToBottom: () => void;
  quit: () => void;
  requestRender: () => void;
  toggleActivityBar: () => void;
  toggleRightDock: () => void;
  toggleFocus: () => void;
  toggleTerminal: () => void;
  togglePanelSplit: () => void;
  focusPreviousPanelContent: () => void;
  focusNextPanelContent: () => void;
  movePanelContentUp: () => void;
  movePanelContentDown: () => void;
  moveActivityItemUp: () => void;
  moveActivityItemDown: () => void;
  closeActivePanelContent: () => void;
  openShortcutHelp: () => void;
  /** Speak a fixed sample line through the REAL TTS backend in the currently-selected voice — the
   *  audition affordance for the voice picker (legit user-triggered audio, never in the gate). */
}
