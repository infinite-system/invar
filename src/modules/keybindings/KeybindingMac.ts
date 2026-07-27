import { Static } from 'ivue/extras';
import { KeybindingDefaults } from './KeybindingDefaults';
import { KeybindingPlatform } from './KeybindingPlatform';
import type { Keybinding } from './KeybindingRegistry';

// The macOS overlay — ALIASES for mac-native chords, layered over the canonical floor (every action
// here is also reachable canonically; removing this layer leaves a fully operable app). Registered
// unconditionally: these patterns only match when the terminal actually delivers the corresponding
// events, so on non-mac terminals they are inert — degradation is silence, never a misfire.
//
// MOST of this layer is now GENERATED, not written: `KeybindingPlatform.primaryModifierAliases`
// re-emits the canonical Ctrl bindings of the primary-modifier actions with `super`, so a mac alias
// can never disagree with the floor about what a chord MEANS. Only chords whose mac meaning genuinely
// differs from the Ctrl form are hand-written below, each with its reason inline.
// invariant: Modifier fidelity varies by protocol (keybindings.invariants.md)
// invariant: The canonical layer is the floor (keybindings.invariants.md)
// invariant: Focus owns the keystroke (keybindings.invariants.md)
class $KeybindingMac {
  /**
   * Chords whose macOS meaning is NOT the primary-modifier substitution — they use a different
   * modifier for a meaning the floor spells differently, so no generator can derive them.
   */
  protected static get MAC_NATIVE_BINDINGS(): Keybinding[] {
    return [
      // Option word-jumps. Terminals encode Option+arrow either as alt+arrow, or as the readline
      // forms ESC-b / ESC-f (Terminal.app default profile) — both patterns, one intent. The floor
      // spells this Ctrl+Left/Right, so this is a MODIFIER difference, not a substitution.
      {
        chord: { key: 'left', alt: true },
        action: 'editor.wordLeft',
        context: 'editor',
      },
      {
        chord: { key: 'right', alt: true },
        action: 'editor.wordRight',
        context: 'editor',
      },
      {
        chord: { key: 'b', alt: true },
        action: 'editor.wordLeft',
        context: 'editor',
      },
      {
        chord: { key: 'f', alt: true },
        action: 'editor.wordRight',
        context: 'editor',
      },
      // Option+Up/Down: paragraph-ish jumps map to the warp jumps.
      {
        chord: { key: 'up', alt: true },
        action: 'editor.jumpUp',
        context: 'editor',
      },
      {
        chord: { key: 'down', alt: true },
        action: 'editor.jumpDown',
        context: 'editor',
      },
      // Cmd navigation — arrives EITHER as terminal translations (iTerm2 sends Home/End for
      // Cmd+Left/Right, already canonical) OR as true `super` events under the kitty keyboard
      // protocol. NOT a substitution: Ctrl+Left is a WORD jump while Cmd+Left is the LINE start, so
      // the two modifiers carry different meanings and the generator must not derive one from the
      // other.
      {
        chord: { key: 'left', super: true },
        action: 'editor.lineStart',
        context: 'editor',
      },
      {
        chord: { key: 'right', super: true },
        action: 'editor.lineEnd',
        context: 'editor',
      },
      {
        chord: { key: 'up', super: true },
        action: 'editor.documentStart',
        context: 'editor',
      },
      {
        chord: { key: 'down', super: true },
        action: 'editor.documentEnd',
        context: 'editor',
      },
    ];
  }

  protected static get $overlayBindings(): Keybinding[] {
    const overlayBindings: Keybinding[] = [
      ...KeybindingPlatform.Class.primaryModifierAliases(
        KeybindingDefaults.Class.canonicalBindings,
      ),
      ...this.MAC_NATIVE_BINDINGS,
    ];
    return overlayBindings;
  }

  static get overlayBindings(): Keybinding[] {
    return this.$overlayBindings;
  }
}

export namespace KeybindingMac {
  export const $Class = Static($KeybindingMac);
  export const Class = $Class;
}
