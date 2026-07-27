import { Static } from 'ivue/extras';
import type { Keybinding } from './KeybindingRegistry';

// The ONE platform substitution. Exactly ONE thing about a chord is platform-variant — the PRIMARY
// MODIFIER: Ctrl on Linux/Windows, Cmd (`super`) on macOS. Everything else about a binding — its
// MEANING, the action id it resolves to, and its membership in the reserved set — must be identical
// on every platform. This generator READS the canonical floor and re-emits the listed actions with
// `ctrl` replaced by `super`, so a mac alias cannot disagree with the floor about meaning: there is
// no second table to edit, and a drift like `Ctrl+P = go-to-file` vs `Cmd+P = command palette`
// becomes unrepresentable.
// invariant: The canonical layer is the floor (keybindings.invariants.md)
// invariant: Modifier fidelity varies by protocol (keybindings.invariants.md)
// invariant: Focus owns the keystroke (keybindings.invariants.md)
class $KeybindingPlatform {
  /**
   * The actions whose PRIMARY MODIFIER is platform-variant: on macOS the user reaches them with Cmd.
   * Deliberately an explicit list, not "every ctrl binding" — most Ctrl chords must stay Ctrl on
   * macOS too, because they are readline/job-control bytes the user expects to send unchanged
   * (Ctrl+C as SIGINT, Ctrl+E to line end, Ctrl+A) or host chords with no mac-native Cmd form.
   */
  protected static get $primaryModifierActions(): ReadonlySet<string> {
    const primaryModifierActions = new Set<string>([
      'app.quit',
      'agent.copy',
      'editor.copy',
      'editor.cut',
      'editor.paste',
      'editor.redo',
      'editor.save',
      'editor.selectAll',
      'editor.undo',
      'palette.open',
      'quickopen.open',
      'terminal.copy',
      'workspace.next',
      'workspace.previous',
    ]);
    return primaryModifierActions;
  }

  static get primaryModifierActions(): ReadonlySet<string> {
    return this.$primaryModifierActions;
  }

  /**
   * Every canonical `ctrl` binding for a primary-modifier action, re-emitted with `super` in place of
   * `ctrl`. Multi-step chords are skipped: a step list is a sequence of control bytes, not a
   * primary-modifier gesture. A RESERVED binding keeps its reservation and its warrant — reserved-set
   * membership is part of a chord's meaning and must not vary by platform.
   */
  static primaryModifierAliases(
    canonicalBindings: readonly Keybinding[],
  ): Keybinding[] {
    const primaryModifierActions = this.primaryModifierActions;
    const aliases: Keybinding[] = [];
    for (const binding of canonicalBindings) {
      const chord = binding.chord;
      if (!chord || !chord.ctrl) continue;
      if (!primaryModifierActions.has(binding.action)) continue;
      const { ctrl: _replacedPrimaryModifier, ...chordWithoutControl } = chord;
      aliases.push({
        ...binding,
        chord: { ...chordWithoutControl, super: true },
      });
    }
    return aliases;
  }
}

export namespace KeybindingPlatform {
  export const $Class = Static($KeybindingPlatform);
  export let Class = $Class;
}
