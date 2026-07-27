// Keystroke → terminal byte encoding. A focused terminal must turn an OpenTUI KeyEvent back into the
// raw bytes a real terminal would send to the child — canonical VT sequences derived from the PARSED
// key fields, NOT the incoming `sequence` (under the Kitty keyboard protocol `sequence`/`raw` carry
// Kitty-encoded escapes the shell cannot read). Pure, allocation-light, and unit-tested against the
// control-byte and arrow cases.
//
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/terminal/terminal.invariants.md)
// invariant: Terminal word operations reach readline (src/modules/terminal/terminal.invariants.md)
import { Static } from 'ivue/extras';
import type { KeyEvent } from '@opentui/core';

class $TerminalKeys {
  // CSI = ESC [ — the introducer for cursor/navigation sequences.
  protected static get CONTROL_SEQUENCE_INTRODUCER(): string {
    return '\x1b[';
  }

  /** Named keys → their canonical terminal bytes (unmodified). */
  protected static get $namedKeyBytes(): Readonly<Record<string, string>> {
    const controlSequenceIntroducer = this.CONTROL_SEQUENCE_INTRODUCER;
    const namedKeyBytes: Readonly<Record<string, string>> = {
      return: '\r',
      enter: '\r',
      tab: '\t',
      backspace: '\x7f', // DEL — what a terminal sends for Backspace
      escape: '\x1b',
      space: ' ',
      up: `${controlSequenceIntroducer}A`,
      down: `${controlSequenceIntroducer}B`,
      right: `${controlSequenceIntroducer}C`,
      left: `${controlSequenceIntroducer}D`,
      home: `${controlSequenceIntroducer}H`,
      end: `${controlSequenceIntroducer}F`,
      pageup: `${controlSequenceIntroducer}5~`,
      pagedown: `${controlSequenceIntroducer}6~`,
      delete: `${controlSequenceIntroducer}3~`,
      insert: `${controlSequenceIntroducer}2~`,
    };
    return namedKeyBytes;
  }

  static encode(key: KeyEvent): string {
    const name = key.name;
    // Ctrl+<letter> → the C0 control byte (Ctrl+A = 0x01 … Ctrl+Z = 0x1a). Ctrl+C, Ctrl+D, Ctrl+Z etc.
    // reach the child so job control and interrupts work.
    if (key.ctrl && !key.meta && !key.option && name && name.length === 1) {
      const code = name.toLowerCase().charCodeAt(0);
      if (code >= 97 && code <= 122) return String.fromCharCode(code - 96);
    }
    // Readline word operations use Meta sequences. OpenTUI may decode a legacy ESC prefix as `meta`
    // or a modifier-aware protocol as `option`; both must return the same bytes to the child shell.
    if ((key.meta || key.option) && !key.ctrl) {
      if (name === 'left' || name === 'b') return '\x1bb';
      if (name === 'right' || name === 'f') return '\x1bf';
      if (name === 'backspace' || name === 'delete') return '\x1b\x7f';
    }
    // Shift+Tab is the back-tab sequence.
    if (name === 'tab' && key.shift) {
      return `${this.CONTROL_SEQUENCE_INTRODUCER}Z`;
    }
    const namedKeyBytes = this.$namedKeyBytes[name];
    if (namedKeyBytes) return namedKeyBytes;
    // A plain printable character rides its own sequence (a single byte, no modifiers).
    const sequence = key.sequence;
    if (
      sequence &&
      sequence.length >= 1 &&
      !key.ctrl &&
      !key.meta &&
      !key.option
    ) {
      const firstCode = sequence.charCodeAt(0);
      if (firstCode >= 0x20 && firstCode !== 0x7f) return sequence;
    }
    return '';
  }
}

export namespace TerminalKeys {
  export const $Class = $TerminalKeys;
  export const Class = Static($TerminalKeys);
}
