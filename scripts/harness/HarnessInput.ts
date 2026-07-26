// Terminal input encoding for byte-level drives. Names describe user intent; the output is the exact
// VT byte sequence delivered through the PTY master.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
import { Static } from 'ivue/extras';

export type HarnessMouseButton = 'left' | 'middle' | 'right' | 'none';
export type HarnessMouseEvent =
  | {
      kind: 'press' | 'release' | 'move';
      column: number;
      row: number;
      button?: HarnessMouseButton;
      shift?: boolean;
      alt?: boolean;
      control?: boolean;
    }
  | {
      kind: 'wheel';
      column: number;
      row: number;
      direction: 'up' | 'down' | 'left' | 'right';
      shift?: boolean;
      alt?: boolean;
      control?: boolean;
    };

class $HarnessInput {
  static key = $key;
  static mouse = $mouse;
  static paste = $paste;
}

export namespace HarnessInput {
  export const $Class = $HarnessInput;
  export const Class = Static($Class);
}

const namedKeySequences: Readonly<Record<string, string>> = {
  Enter: '\r',
  Tab: '\t',
  Escape: '\x1b',
  Backspace: '\x7f',
  Up: '\x1b[A',
  Down: '\x1b[B',
  Right: '\x1b[C',
  Left: '\x1b[D',
  Home: '\x1b[H',
  End: '\x1b[F',
  Insert: '\x1b[2~',
  Delete: '\x1b[3~',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~',
};

const modifiedFinalKeys: Readonly<Record<string, string>> = {
  Up: 'A',
  Down: 'B',
  Right: 'C',
  Left: 'D',
  Home: 'H',
  End: 'F',
  F1: 'P',
  F2: 'Q',
  F3: 'R',
  F4: 'S',
};

const modifiedTildeKeys: Readonly<Record<string, number>> = {
  Insert: 2,
  Delete: 3,
  PageUp: 5,
  PageDown: 6,
  F5: 15,
  F6: 17,
  F7: 18,
  F8: 19,
  F9: 20,
  F10: 21,
  F11: 23,
  F12: 24,
};

function $key(keyName: string): string {
  const keyParts = keyName.split('+');
  const baseKey = keyParts.at(-1) ?? '';
  const modifierNames = new Set(keyParts.slice(0, -1));
  const hasShift = modifierNames.has('Shift');
  const hasAlt = modifierNames.has('Alt');
  const hasControl = modifierNames.has('Control');
  for (const modifierName of modifierNames) {
    if (!['Shift', 'Alt', 'Control'].includes(modifierName)) {
      throw new Error(`Unknown key modifier: ${modifierName}`);
    }
  }

  if (baseKey.length === 1) {
    if (
      hasAlt &&
      !hasShift &&
      !hasControl &&
      (baseKey === '[' || baseKey === ']')
    ) {
      return `\x1b[27;3;${baseKey.charCodeAt(0)}~`;
    }
    if (hasShift && hasControl && !hasAlt) {
      // xterm modifyOtherKeys form (CSI 27 ; <mods> ; <codepoint> ~) rather than the kitty CSI-u
      // form: BOTH of OpenTUI's parsers decode this one, so a Ctrl+Shift+<key> drive proves the chord
      // arrives on a LEGACY terminal too — the deliverability claim the F-key retirement rests on.
      // The codepoint must be the UNSHIFTED key (lowercase): CSI 27;6;72~ decodes as name 'H', which
      // no chord pattern matches. invariant: Advertised bindings are deliverable bindings
      return `\x1b[27;6;${baseKey.toLowerCase().charCodeAt(0)}~`;
    }
    let sequence = hasShift ? baseKey.toUpperCase() : baseKey;
    if (hasControl && !canEncodeAsControlCharacter(sequence)) {
      const modifierParameter =
        1 + Number(hasShift) + Number(hasAlt) * 2 + Number(hasControl) * 4;
      return `\x1b[${sequence.codePointAt(0)};${modifierParameter}u`;
    }
    if (hasControl) sequence = controlCharacter(sequence);
    return hasAlt ? `\x1b${sequence}` : sequence;
  }

  if (baseKey === 'Space') {
    const sequence = hasControl ? '\x00' : ' ';
    return hasAlt ? `\x1b${sequence}` : sequence;
  }
  if (baseKey === 'Tab' && hasShift && !hasAlt && !hasControl) return '\x1b[Z';
  // A MODIFIED Tab (Ctrl+Tab = buffer.next, Ctrl+Shift+Tab = buffer.previous) has no legacy CSI form
  // at all — xterm reports it through modifyOtherKeys, and both OpenTUI parsers decode that. Without
  // this branch the harness simply THROWS on the chord, so those bindings could never be driven.
  if (baseKey === 'Tab' && (hasControl || hasAlt)) {
    const tabModifierParameter =
      1 + Number(hasShift) + Number(hasAlt) * 2 + Number(hasControl) * 4;
    return `\x1b[27;${tabModifierParameter};9~`;
  }
  if (!hasShift && !hasAlt && !hasControl) {
    const sequence = namedKeySequences[baseKey];
    if (sequence !== undefined) return sequence;
  }

  const modifierParameter =
    1 + Number(hasShift) + Number(hasAlt) * 2 + Number(hasControl) * 4;
  const finalByte = modifiedFinalKeys[baseKey];
  if (finalByte) return `\x1b[1;${modifierParameter}${finalByte}`;
  const tildeParameter = modifiedTildeKeys[baseKey];
  if (tildeParameter) return `\x1b[${tildeParameter};${modifierParameter}~`;
  throw new Error(`Unknown harness key name: ${keyName}`);
}

function $mouse(event: HarnessMouseEvent): string {
  const modifierBits =
    (event.shift ? 4 : 0) + (event.alt ? 8 : 0) + (event.control ? 16 : 0);
  let buttonCode: number;
  let finalByte = 'M';
  if (event.kind === 'wheel') {
    buttonCode =
      { up: 64, down: 65, left: 66, right: 67 }[event.direction] + modifierBits;
  } else {
    const button = event.button ?? (event.kind === 'move' ? 'none' : 'left');
    buttonCode =
      { left: 0, middle: 1, right: 2, none: 3 }[button] + modifierBits;
    if (event.kind === 'move') buttonCode += 32;
    if (event.kind === 'release') finalByte = 'm';
  }
  return (
    `\x1b[<${buttonCode};${Math.max(0, event.column) + 1};` +
    `${Math.max(0, event.row) + 1}${finalByte}`
  );
}

function $paste(text: string): string {
  return `\x1b[200~${text}\x1b[201~`;
}

function canEncodeAsControlCharacter(character: string): boolean {
  const upperCharacter = character.toUpperCase();
  const characterCode = upperCharacter.charCodeAt(0);
  return upperCharacter === '?' || (characterCode >= 64 && characterCode <= 95);
}

function controlCharacter(character: string): string {
  const upperCharacter = character.toUpperCase();
  if (upperCharacter === '?') return '\x7f';
  const characterCode = upperCharacter.charCodeAt(0);
  if (characterCode < 64 || characterCode > 95) {
    throw new Error(`Control modifier cannot encode character: ${character}`);
  }
  return String.fromCharCode(characterCode & 31);
}
