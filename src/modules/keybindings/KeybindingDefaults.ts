import { Static } from 'ivue/extras';
import type { Keybinding } from './KeybindingRegistry';

// The CANONICAL binding layer — the floor: only universally-deliverable chords (Ctrl, plain keys,
// function keys, arrows). Overlays (mac) ALIAS actions bound here; they never replace the floor.
// Bindings are pure data: chord (or step list) -> action id (+ context / guard).
// invariant: The canonical layer is the floor (src/modules/keybindings/keybindings.invariants.md)
// invariant: Bindings are intent addressed (src/modules/keybindings/keybindings.invariants.md)
// invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
class $KeybindingDefaults {
  /**
   * The ONE chord table for every editable one-line field, instantiated per context. A host that
   * already owns an UNMODIFIED key (the bounded popup's Left/Right drill and Backspace erase) lists
   * it in `hostOwnedPlainKeys`, so the field never advertises a chord it cannot receive; the
   * modified chords — word movement, word deletion, Home/End, delete-line — always reach the field.
   */
  static textInputBindings(
    context: TextInputBindingContext,
    options: TextInputBindingOptions = {},
  ): Keybinding[] {
    const hostOwnedPlainKeys = new Set(options.hostOwnedPlainKeys ?? []);
    const bindings: Keybinding[] = [
      {
        chord: { key: 'left' },
        action: 'textInput.moveLeft',
        context,
      },
      {
        chord: { key: 'right' },
        action: 'textInput.moveRight',
        context,
      },
      {
        chord: { key: 'left', alt: true },
        action: 'textInput.moveWordLeft',
        context,
      },
      {
        chord: { key: 'b', alt: true },
        action: 'textInput.moveWordLeft',
        context,
      },
      {
        chord: { key: 'right', alt: true },
        action: 'textInput.moveWordRight',
        context,
      },
      {
        chord: { key: 'f', alt: true },
        action: 'textInput.moveWordRight',
        context,
      },
      {
        chord: { key: 'left', ctrl: true },
        action: 'textInput.moveWordLeft',
        context,
      },
      {
        chord: { key: 'right', ctrl: true },
        action: 'textInput.moveWordRight',
        context,
      },
      {
        chord: { key: 'left', super: true },
        action: 'textInput.moveHome',
        context,
      },
      {
        chord: { key: 'right', super: true },
        action: 'textInput.moveEnd',
        context,
      },
      {
        chord: { key: 'home' },
        action: 'textInput.moveHome',
        context,
      },
      {
        chord: { key: 'end' },
        action: 'textInput.moveEnd',
        context,
      },
      {
        chord: { key: 'backspace' },
        action: 'textInput.backspace',
        context,
      },
      {
        chord: { key: 'delete' },
        action: 'textInput.deleteForward',
        context,
      },
      {
        chord: { key: 'backspace', alt: true },
        action: 'textInput.deletePreviousWord',
        context,
      },
      {
        chord: { key: 'delete', alt: true },
        action: 'textInput.deleteNextWord',
        context,
      },
      {
        chord: { key: 'backspace', ctrl: true },
        action: 'textInput.deleteLine',
        context,
      },
      {
        chord: { key: 'backspace', super: true },
        action: 'textInput.deleteLine',
        context,
      },
    ];
    if (hostOwnedPlainKeys.size === 0) return bindings;
    return bindings.filter((binding) => {
      const chord = binding.chord;
      if (!chord) return true;
      const unmodified = !chord.ctrl && !chord.alt && !chord.super;
      return !(unmodified && hostOwnedPlainKeys.has(chord.key));
    });
  }

  protected static get $canonicalBindings(): Keybinding[] {
    const canonicalBindings: Keybinding[] = [
      // --- global ---
      // RESERVED escape hatches: quit fires from ANY mode (even a focused search/modal input) so the
      // user is never trapped. `reserved` routes these ahead of modal input consumption (single chords
      // only — the pass-through check is stateless; the Ctrl+X Ctrl+C chord below is editor-context).
      // ALIASES COME FIRST, PRIMARY LAST: `effectiveBindings` keeps the LAST binding for an action, so
      // ordering is what makes the cheat-sheet and status-bar hints advertise the primary chord.
      // F10 is a RETAINED function-key alias, deliberately: Ctrl+Q is flow-control (XOFF) on some
      // terminals and VS Code's integrated terminal intercepts it, and the Ctrl+X Ctrl+C form is
      // multi-step so it can never be reserved — without a second single-chord reserved quit a user
      // inside a key-hungry focused terminal is TRAPPED. See project.keyboard.md §5.
      {
        chord: { key: 'f10' },
        action: 'app.quit',
        reserved: true,
        reservedBecause:
          'trap avoidance (fallback): the only quit chord a terminal that speaks neither kitty nor modifyOtherKeys can deliver',
      },
      // Emacs-style quit chord (VS Code's terminal intercepts Ctrl+Q). In the editor WITH a selection,
      // the guarded single below wins and Ctrl+X stays cut.
      {
        steps: [
          { key: 'x', ctrl: true },
          { key: 'c', ctrl: true },
        ],
        action: 'app.quit',
      },
      {
        chord: { key: 'q', ctrl: true },
        action: 'app.quit',
        reserved: true,
        reservedBecause:
          'trap avoidance: the guaranteed exit from a full-screen focused child that consumes every key',
      },
      // VS Code: Ctrl+P = go-to-file. shift is EXPLICITLY false, and that is load-bearing: an
      // unspecified shift is DON'T-CARE, so this binding used to match Ctrl+SHIFT+P too and — being
      // earlier in the array — SHADOWED the command palette. Ctrl+Shift+P never opened the palette,
      // which is a large part of why F1 had to exist. invariant: Focus owns the keystroke
      {
        chord: { key: 'p', ctrl: true, shift: false },
        action: 'quickopen.open',
      },
      // F1 ALSO opens the palette (VS Code parity: F1 = Show All Commands) and is the SECOND retained
      // function key — an alias, never the primary. The palette is the universal discovery surface, so
      // its unreachability is a total loss; F1 is the one chord that survives a terminal speaking
      // neither the kitty protocol nor xterm modifyOtherKeys. Listed BEFORE the primary so hints show
      // Ctrl+Shift+P. invariant: Advertised bindings are deliverable bindings
      { chord: { key: 'f1' }, action: 'palette.open' },
      // Ctrl+Shift+P = command palette (VS Code parity), the PRIMARY. Deliverable on legacy terminals
      // in the modifyOtherKeys form (ESC [ 27;6;112 ~) as well as under kitty — measured, not assumed.
      { chord: { key: 'p', ctrl: true, shift: true }, action: 'palette.open' },
      // Ctrl+Shift+B shows/hides the whole activity bar (Ctrl+B is VS Code's SIDEBAR toggle and is free
      // here too, but the bar is the activity-bar feature so B-for-bar with shift keeps chord space open).
      {
        chord: { key: 'b', ctrl: true, shift: true },
        action: 'view.toggleActivityBar',
      },
      {
        chord: { key: 'b', ctrl: true, alt: true },
        action: 'view.toggleRightDock',
        reserved: true,
        reservedBecause:
          'toggle symmetry: the chord that showed the right dock must hide it while the dock holds focus',
      },
      // Find and Replace are global overlay-switch actions: from any current input overlay, one chord
      // replaces the shared modal slot. They still no-op in Bootstrap when no document is open.
      { chord: { key: 'f', ctrl: true }, action: 'find.open' },
      // shift EXPLICITLY false so it cannot shadow Ctrl+Shift+H (the cheat-sheet) below.
      { chord: { key: 'h', ctrl: true, shift: false }, action: 'find.replace' },
      // Ctrl+Shift+H opens the keyboard cheat-sheet (H for Help). Replaces Shift+F1: deliverable in the
      // modifyOtherKeys form on legacy terminals and under kitty, and owned by no terminal emulator.
      // The sheet lists itself.
      {
        chord: { key: 'h', ctrl: true, shift: true },
        action: 'help.shortcuts',
      },
      // Toggle the bottom panel (integrated terminal). TWO deliverable chords for the one action:
      //   • Ctrl+` — the VS Code terminal-specific chord; unencodable on some legacy terminals (they send
      //     NUL, which decodes as Ctrl+Space), which is why it silently no-ops for some users. Listed
      //     first so the hint advertises the primary.
      //   • Ctrl+J — VS Code's own "toggle panel" chord and the PRIMARY: a plain Ctrl+key that needs no
      //     Fn modifier and encodes on every terminal (the C0 byte 0x0A, which the registry normalizes
      //     from OpenTUI's `linefeed` name back to the j+ctrl CHORD).
      // Both RESERVED so they fire from any mode — including from inside the focused terminal, to hide it
      // (VS Code parity: Ctrl+J toggles the panel even while the terminal owns the keyboard).
      {
        chord: { key: '`', ctrl: true },
        action: 'panel.toggleTerminal',
        reserved: true,
        reservedBecause:
          'toggle symmetry: the chord that opened the panel must close it while the panel holds focus',
      },
      // shift EXPLICITLY false: a DON'T-CARE shift here would make the RESERVED panel toggle swallow
      // Ctrl+Shift+J (focus.toggle) before the focused surface ever saw it.
      {
        chord: { key: 'j', ctrl: true, shift: false },
        action: 'panel.toggleTerminal',
        reserved: true,
        reservedBecause:
          'toggle symmetry: the chord that opened the panel must close it while the panel holds focus',
      },
      // The native agent (Claude) pane — a second PaneContent in the same bottom slot. Reserved so it
      // toggles from any mode, including from inside a focused pane, exactly like the terminal toggle.
      {
        chord: { key: 'a', ctrl: true, shift: true },
        action: 'panel.toggleAgent',
        reserved: true,
        reservedBecause:
          'toggle symmetry: the chord that opened the agent pane must close it while the pane holds focus',
      },
      // Split the bottom panel into two side-by-side cells (agent | terminal) and back. S for Split.
      // Replaces F9. Reserved so it fires even while the terminal owns the keyboard.
      {
        chord: { key: 's', ctrl: true, shift: true },
        action: 'panel.toggleSplit',
        reserved: true,
        reservedBecause:
          'toggle symmetry: splitting and un-splitting the panel the user is focused inside',
      },
      // Keyboard parity for the docked contents rows. Panel context keeps these gestures from stealing
      // editor or terminal input anywhere outside the focused bottom panel.
      {
        chord: { key: 'pageup', alt: true },
        action: 'panel.contentsPrevious',
        context: 'panel',
      },
      {
        chord: { key: 'pagedown', alt: true },
        action: 'panel.contentsNext',
        context: 'panel',
      },
      {
        chord: { key: 'up', alt: true },
        action: 'panel.contentsMoveUp',
        context: 'panel',
      },
      {
        chord: { key: 'down', alt: true },
        action: 'panel.contentsMoveDown',
        context: 'panel',
      },
      // The primary dock mirrors the panel list's Alt+Up/Down reorder while any activity content owns
      // focus. ActivityBar and PanelContentsList both delegate the mutation to PanelHost.
      {
        chord: { key: 'up', alt: true },
        action: 'activity.moveItemUp',
        context: 'activity',
      },
      {
        chord: { key: 'down', alt: true },
        action: 'activity.moveItemDown',
        context: 'activity',
      },
      {
        chord: { key: 'delete', alt: true },
        action: 'panel.contentsClose',
        context: 'panel',
      },
      // Toggle focus between the sidebar and the editor. Ctrl+J moves focus in and out of the BOTTOM
      // dock; Ctrl+Shift+J is the same gesture for the SIDE dock. NOT reserved: the panel toggles
      // already release a user trapped inside a key-hungry pane, so this fails the trap-avoidance
      // clause and must not be taken from a focused surface.
      // It replaces the plain `Tab` this action used to claim GLOBALLY — a host claiming an unmodified
      // whitespace key that the editor needs for content, which is the violation #91 reported.
      // invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
      { chord: { key: 'j', ctrl: true, shift: true }, action: 'focus.toggle' },
      // Editor buffer tabs (item 10a) — global (work in any focus). Ctrl+Tab needs the kitty keyboard
      // protocol; Ctrl+PageUp/PageDown are the widely-supported equivalents.
      { chord: { key: ',', ctrl: true }, action: 'settings.toggle' },
      // Project/workspace tabs are the outer navigation layer. Shift distinguishes them from the
      // buffer-tab layer below; every action is also visible on the workspace strip and in the palette.
      {
        chord: { key: 'o', ctrl: true, shift: true },
        action: 'workspace.openFolder',
      },
      {
        chord: { key: 'w', ctrl: true, shift: true },
        action: 'workspace.close',
      },
      {
        chord: { key: 'pagedown', ctrl: true, shift: true },
        action: 'workspace.next',
      },
      {
        chord: { key: 'pageup', ctrl: true, shift: true },
        action: 'workspace.previous',
      },
      // Ctrl+Shift+] / Ctrl+Shift+[ also cycle projects (VS Code-style bracket cycling) — the two-line
      // workspace tabs are the thing being cycled. The macOS overlay adds the Cmd (super) form.
      {
        chord: { key: ']', ctrl: true, shift: true },
        action: 'workspace.next',
      },
      {
        chord: { key: '[', ctrl: true, shift: true },
        action: 'workspace.previous',
      },
      { chord: { key: 'w', ctrl: true }, action: 'buffer.close' },
      {
        chord: { key: 'tab', ctrl: true, shift: false },
        action: 'buffer.next',
      },
      {
        chord: { key: 'tab', ctrl: true, shift: true },
        action: 'buffer.previous',
      },
      { chord: { key: 'pagedown', ctrl: true }, action: 'buffer.next' },
      { chord: { key: 'pageup', ctrl: true }, action: 'buffer.previous' },
      // Go Back / Go Forward through the navigation history (VS Code's Alt+Left/Right; here Alt+[ / Alt+]
      // since the arrows move the cursor). Alt+[ / Alt+] are free — only Ctrl+Shift+[/] are bound above.
      {
        chord: { key: '[', alt: true },
        action: 'navigation.back',
        context: 'editor',
      },
      {
        chord: { key: ']', alt: true },
        action: 'navigation.forward',
        context: 'editor',
      },

      // --- palette (captures input while open) ---
      { chord: { key: 'escape' }, action: 'palette.close', context: 'palette' },
      { chord: { key: 'return' }, action: 'palette.run', context: 'palette' },
      { chord: { key: 'up' }, action: 'palette.previous', context: 'palette' },
      { chord: { key: 'down' }, action: 'palette.next', context: 'palette' },
      ...this.textInputBindings('palette'),

      // --- text inputs (query editing stays intent-addressed even though typed characters are residuals) ---
      ...this.textInputBindings('quickopen'),
      ...this.textInputBindings('find'),
      // Case-sensitivity toggle (VS Code's Alt+C in the find widget) — flips the engine + re-runs the query.
      {
        chord: { key: 'c', alt: true },
        action: 'find.toggleCaseSensitive',
        context: 'find',
      },

      // --- context menu (modal while open: Bootstrap resolves ONLY in this context and consumes
      //     everything unbound by closing the menu — see the modal block in Bootstrap.onKey) ---
      { chord: { key: 'up' }, action: 'menu.previous', context: 'menu' },
      { chord: { key: 'down' }, action: 'menu.next', context: 'menu' },
      { chord: { key: 'return' }, action: 'menu.run', context: 'menu' },
      { chord: { key: 'escape' }, action: 'menu.close', context: 'menu' },

      // --- bounded list popup (modal; printable input is the search-query residual) ---
      {
        chord: { key: 'up' },
        action: 'listPopup.previous',
        context: 'listPopup',
      },
      {
        chord: { key: 'down' },
        action: 'listPopup.next',
        context: 'listPopup',
      },
      {
        chord: { key: 'return' },
        action: 'listPopup.run',
        context: 'listPopup',
      },
      {
        chord: { key: 'right' },
        action: 'listPopup.drill',
        context: 'listPopup',
      },
      {
        chord: { key: 'left' },
        action: 'listPopup.navigateBackward',
        context: 'listPopup',
      },
      {
        chord: { key: 'escape' },
        action: 'listPopup.close',
        context: 'listPopup',
      },
      {
        chord: { key: 'backspace' },
        action: 'listPopup.erase',
        context: 'listPopup',
      },
      // The popup's search row is an editable one-line field, so it gets the SAME text-input table
      // as the palette, Quick Open, find, and the agent composer. Left/Right stay the popup's drill
      // and step-out, and Backspace stays its erase — those three unmodified keys are host-owned.
      ...this.textInputBindings('listPopup', {
        hostOwnedPlainKeys: ['left', 'right', 'backspace'],
      }),

      // --- shortcut cheat-sheet (captures input while open; Ctrl+Shift+H above toggles it globally) ---
      { chord: { key: 'escape' }, action: 'help.close', context: 'help' },
      { chord: { key: 'up' }, action: 'help.up', context: 'help' },
      { chord: { key: 'down' }, action: 'help.down', context: 'help' },
      { chord: { key: 'pageup' }, action: 'help.pageUp', context: 'help' },
      { chord: { key: 'pagedown' }, action: 'help.pageDown', context: 'help' },

      // --- settings panel (Ctrl+,) ---
      { chord: { key: 'up' }, action: 'settings.up', context: 'settings' },
      { chord: { key: 'down' }, action: 'settings.down', context: 'settings' },
      {
        chord: { key: 'left' },
        action: 'settings.decrease',
        context: 'settings',
      },
      {
        chord: { key: 'right' },
        action: 'settings.increase',
        context: 'settings',
      },
      {
        chord: { key: 'c', ctrl: true },
        action: 'settings.copy',
        context: 'settings',
      },
      {
        chord: { key: 'escape' },
        action: 'settings.close',
        context: 'settings',
      },

      // --- editor: movement (shift left unspecified = extend composes as a parameter) ---
      { chord: { key: 'up' }, action: 'editor.moveUp', context: 'editor' },
      { chord: { key: 'down' }, action: 'editor.moveDown', context: 'editor' },
      { chord: { key: 'left' }, action: 'editor.moveLeft', context: 'editor' },
      {
        chord: { key: 'right' },
        action: 'editor.moveRight',
        context: 'editor',
      },
      { chord: { key: 'pageup' }, action: 'editor.pageUp', context: 'editor' },
      {
        chord: { key: 'pagedown' },
        action: 'editor.pageDown',
        context: 'editor',
      },
      { chord: { key: 'home' }, action: 'editor.lineStart', context: 'editor' },
      { chord: { key: 'end' }, action: 'editor.lineEnd', context: 'editor' },
      // --- editor: structural line edits (move / duplicate) ---
      // Alt+Shift+↑/↓ move the line (VS Code uses Alt+↑/↓, but those are editor.jumpUp/Down here — mac
      // overlay too — so shift disambiguates); Ctrl+Shift+D duplicates (VS Code's Shift+Alt+↓ collides with
      // move-down, so the mnemonic D is used instead).
      {
        chord: { key: 'up', alt: true, shift: true },
        action: 'editor.moveLineUp',
        context: 'editor',
      },
      {
        chord: { key: 'down', alt: true, shift: true },
        action: 'editor.moveLineDown',
        context: 'editor',
      },
      {
        chord: { key: 'd', ctrl: true, shift: true },
        action: 'editor.duplicateLine',
        context: 'editor',
      },
      // --- editor: warp movement ---
      {
        chord: { key: 'up', ctrl: true },
        action: 'editor.jumpUp',
        context: 'editor',
      },
      {
        chord: { key: 'down', ctrl: true },
        action: 'editor.jumpDown',
        context: 'editor',
      },
      {
        chord: { key: 'left', ctrl: true },
        action: 'editor.wordLeft',
        context: 'editor',
      },
      {
        chord: { key: 'right', ctrl: true },
        action: 'editor.wordRight',
        context: 'editor',
      },
      {
        chord: { key: 'home', ctrl: true },
        action: 'editor.documentStart',
        context: 'editor',
      },
      {
        chord: { key: 'end', ctrl: true },
        action: 'editor.documentEnd',
        context: 'editor',
      },
      // Ctrl+E → line end. Ctrl+E was unbound, so this is a free win that ALSO makes iTerm2 "Natural Text
      // Editing" Cmd+Right (which sends a raw ^E / 0x05) jump to the line end. (Cmd+Left = raw ^A is
      // disambiguated from Ctrl+A = Select All in the onKey handler, since both resolve the same here.)
      {
        chord: { key: 'e', ctrl: true },
        action: 'editor.lineEnd',
        context: 'editor',
      },
      // --- editor: find / replace input is owned by the 'find' context — typing, Enter/Shift+Enter
      //     cycle, Ctrl+Enter replace, Tab switches field, and Esc closes. The opening chords are global. ---
      // --- editor: editing ---
      { chord: { key: 'return' }, action: 'editor.newline', context: 'editor' },
      {
        chord: { key: 'backspace' },
        action: 'editor.backspace',
        context: 'editor',
      },
      // TAB INDENTS. The editor surface owns Tab because it holds focus and Tab is CONTENT here — the
      // previous global `Tab → focus.toggle` was the host claiming an unmodified key it had no warrant
      // for (#91). With a selection: indent/outdent every selected line; without: one indent unit at
      // the caret / one unit removed from the line's leading whitespace.
      // invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
      {
        chord: { key: 'tab', shift: false },
        action: 'editor.indent',
        context: 'editor',
      },
      {
        chord: { key: 'tab', shift: true },
        action: 'editor.outdent',
        context: 'editor',
      },
      { chord: { key: 'return' }, action: 'editor.newline', context: 'editor' },
      {
        chord: { key: 'backspace' },
        action: 'editor.backspace',
        context: 'editor',
      },
      { chord: { key: 'delete' }, action: 'editor.delete', context: 'editor' },
      // OpenTUI decodes macOS Option+Backspace ESC DEL as backspace+meta and modified Delete as
      // delete+option; Bootstrap normalizes either modifier to this `alt` slot. Both delete a word.
      {
        chord: { key: 'backspace', alt: true },
        action: 'edit.deletePreviousWord',
        context: 'editor',
      },
      {
        chord: { key: 'delete', alt: true },
        action: 'edit.deletePreviousWord',
        context: 'editor',
      },
      // Cmd/Ctrl+Backspace deletes from the cursor to the LINE START (text right of the cursor stays).
      {
        chord: { key: 'backspace', ctrl: true },
        action: 'editor.deleteToLineStart',
        context: 'editor',
      },
      {
        chord: { key: 'backspace', super: true },
        action: 'editor.deleteToLineStart',
        context: 'editor',
      },
      { chord: { key: 'escape' }, action: 'editor.escape', context: 'editor' },
      // --- editor: chords ---
      // shift EXPLICITLY false so the table cannot claim Ctrl+Shift+S, which is the panel split.
      {
        chord: { key: 's', ctrl: true, shift: false },
        action: 'editor.save',
        context: 'editor',
      },
      {
        chord: { key: 'a', ctrl: true },
        action: 'editor.selectAll',
        context: 'editor',
      },
      {
        chord: { key: 'c', ctrl: true },
        action: 'editor.copy',
        context: 'editor',
      },
      // Copy the agent pane's transcript/composer selection (the focused agent pane owns Ctrl+C).
      {
        chord: { key: 'c', ctrl: true },
        action: 'agent.copy',
        context: 'agent',
      },
      {
        chord: { key: 'escape' },
        action: 'agent.cancelTurn',
        context: 'agent',
      },
      // Cycle the agent's terminal-follow MODE (M for Mode). Replaces F6.
      {
        chord: { key: 'm', ctrl: true, shift: true },
        action: 'agent.cycleTerminalFollowMode',
        context: 'agent',
      },
      ...this.textInputBindings('agent'),
      // The `terminal` context's bindings are contributed by the terminal RUNTIME plugin, not by
      // this canonical layer — the host declares no pane-runtime vocabulary.
      // Guarded: with a selection Ctrl+X cuts (outranks starting the quit chord); without, the
      // global quit chord starts.
      {
        chord: { key: 'x', ctrl: true },
        action: 'editor.cut',
        context: 'editor',
        when: 'editorHasSelection',
      },
      {
        chord: { key: 'v', ctrl: true },
        action: 'editor.paste',
        context: 'editor',
      },
      // Alt+Z toggles word wrap (VS Code parity; `alt` matches the event's option/meta slot).
      {
        chord: { key: 'z', alt: true },
        action: 'editor.toggleWordWrap',
        context: 'editor',
      },
      // Ctrl+Shift+[/] are deliverable through both input parsers, but already cycle WORKSPACES.
      // Folding keeps the bracket mnemonic without colliding: Ctrl+K then [ folds; Ctrl+L then ]
      // unfolds. Both are editor-context step-list data, so a focused child keeps every byte.
      {
        steps: [{ key: 'k', ctrl: true }, { key: '[' }],
        action: 'editor.fold',
        context: 'editor',
      },
      {
        steps: [{ key: 'l', ctrl: true }, { key: ']' }],
        action: 'editor.unfold',
        context: 'editor',
      },
      {
        chord: { key: 'z', ctrl: true, shift: false },
        action: 'editor.undo',
        context: 'editor',
      },
      {
        chord: { key: 'z', ctrl: true, shift: true },
        action: 'editor.redo',
        context: 'editor',
      },
      {
        chord: { key: 'y', ctrl: true },
        action: 'editor.redo',
        context: 'editor',
      },
    ];
    return canonicalBindings;
  }

  static get canonicalBindings(): Keybinding[] {
    return this.$canonicalBindings;
  }
}

export namespace KeybindingDefaults {
  export const $Class = Static($KeybindingDefaults);
  export let Class = $Class;
}

export type TextInputBindingContext =
  'palette' | 'quickopen' | 'find' | 'agent' | 'listPopup' | 'structure';

export interface TextInputBindingOptions {
  /** Unmodified keys the surrounding surface already owns; their text-field chords are omitted. */
  hostOwnedPlainKeys?: readonly string[];
}
