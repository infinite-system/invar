import { Static } from 'ivue/extras';

class $TerminalOutputAudit {
  static clipboardEmissions(output: string): ClipboardEmission[] {
    const clipboardEmissions: ClipboardEmission[] = [];
    let parserState: TerminalOutputParserState = 'ground';
    let controlSequenceStartOffset = -1;
    let controlSequenceStartedWithinAnother = false;
    let synchronizedFrameDepth = 0;

    for (let characterOffset = 0; characterOffset < output.length; characterOffset += 1) {
      const character = output[characterOffset] ?? '';

      if (parserState === 'ground') {
        if (character === '\x1b') {
          parserState = 'escape';
          controlSequenceStartOffset = characterOffset;
          controlSequenceStartedWithinAnother = false;
        }
        continue;
      }

      if (parserState === 'escape') {
        if (character === '[') {
          parserState = 'csi';
          continue;
        }
        if (character === ']') {
          parserState = 'osc';
          continue;
        }
        if (['P', '_', '^', 'X'].includes(character)) {
          parserState = 'control-string';
          continue;
        }
        parserState = 'ground';
        continue;
      }

      if (parserState === 'csi') {
        if (character === '\x1b') {
          parserState = 'escape';
          controlSequenceStartOffset = characterOffset;
          controlSequenceStartedWithinAnother = true;
          continue;
        }
        const characterCode = character.charCodeAt(0);
        if (characterCode < 0x40 || characterCode > 0x7e) continue;
        const controlSequence = output.slice(controlSequenceStartOffset, characterOffset + 1);
        if (controlSequence === '\x1b[?2026h') synchronizedFrameDepth += 1;
        if (controlSequence === '\x1b[?2026l') {
          synchronizedFrameDepth = Math.max(0, synchronizedFrameDepth - 1);
        }
        parserState = 'ground';
        continue;
      }

      if (parserState === 'control-string') {
        if (character === '\x07') {
          parserState = 'ground';
          continue;
        }
        if (character === '\x1b') {
          const followingCharacter = output[characterOffset + 1];
          if (followingCharacter === '\\') {
            parserState = 'ground';
            characterOffset += 1;
          } else {
            parserState = 'escape';
            controlSequenceStartOffset = characterOffset;
            controlSequenceStartedWithinAnother = true;
          }
        }
        continue;
      }

      if (character === '\x07') {
        this.appendClipboardEmission(
          clipboardEmissions,
          output,
          controlSequenceStartOffset,
          characterOffset + 1,
          synchronizedFrameDepth,
          controlSequenceStartedWithinAnother,
        );
        parserState = 'ground';
        continue;
      }
      if (character !== '\x1b') continue;
      const followingCharacter = output[characterOffset + 1];
      if (followingCharacter === '\\') {
        this.appendClipboardEmission(
          clipboardEmissions,
          output,
          controlSequenceStartOffset,
          characterOffset + 2,
          synchronizedFrameDepth,
          controlSequenceStartedWithinAnother,
        );
        parserState = 'ground';
        characterOffset += 1;
      } else {
        parserState = 'escape';
        controlSequenceStartOffset = characterOffset;
        controlSequenceStartedWithinAnother = true;
      }
    }

    return clipboardEmissions;
  }

  protected static appendClipboardEmission(
    clipboardEmissions: ClipboardEmission[],
    output: string,
    startOffset: number,
    endOffset: number,
    synchronizedFrameDepth: number,
    startedWithinControlSequence: boolean,
  ): void {
    const sequence = output.slice(startOffset, endOffset);
    const terminatorLength = sequence.endsWith('\x07') ? 1 : 2;
    const content = sequence.slice(2, sequence.length - terminatorLength);
    if (!content.startsWith('52;c;')) return;
    const base64Payload = content.slice('52;c;'.length);
    const decodedText = Buffer.from(base64Payload, 'base64').toString('utf8');
    const normalizedBase64Payload = Buffer.from(decodedText, 'utf8').toString('base64');
    clipboardEmissions.push({
      startOffset,
      endOffset,
      sequence,
      base64Payload,
      decodedText,
      hasValidBase64Payload: normalizedBase64Payload === base64Payload,
      synchronizedFrameDepth,
      startedWithinControlSequence,
    });
  }
}

export namespace TerminalOutputAudit {
  export const $Class = $TerminalOutputAudit;
  export const Class = Static($Class);
}

export interface ClipboardEmission {
  startOffset: number;
  endOffset: number;
  sequence: string;
  base64Payload: string;
  decodedText: string;
  hasValidBase64Payload: boolean;
  synchronizedFrameDepth: number;
  startedWithinControlSequence: boolean;
}

export type TerminalOutputParserState =
  | 'ground'
  | 'escape'
  | 'csi'
  | 'osc'
  | 'control-string';
