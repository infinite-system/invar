import type { KeyEvent } from '@opentui/core';
import { Static } from 'ivue/extras';
import { TextSegmentation } from '../system/TextSegmentation';

// The one classifier for a terminal key that can insert text into an editable field. A printable
// grapheme may span more than one UTF-16 code unit, but modified keys and control characters never
// insert through the residual typing path.
// invariant: Editable text fields share one input model (project.invariants.md)
class $TextInputKey {
  static isTypedCharacter(key: KeyEvent): boolean {
    if (key.ctrl || key.meta || key.option) return false;
    const sequence = key.sequence;
    if (!sequence || TextSegmentation.Class.graphemes(sequence).length !== 1) {
      return false;
    }
    const codePoint = sequence.codePointAt(0);
    return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
  }
}

export namespace TextInputKey {
  export const $Class = Static($TextInputKey);
  export let Class = $Class;
}
