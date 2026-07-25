class $TerminalOutputAudit {
  private readonly clipboardEmissionRecords: ClipboardEmission[] = [];
  private parserState: TerminalOutputParserState = 'ground';
  private controlSequence = '';
  private controlSequenceStartOffset = -1;
  private controlSequenceStartedWithinAnother = false;
  private synchronizedFrameDepth = 0;
  private consumedOutputLength = 0;
  private controlStringEscapePending = false;
  private controlStringEscapeOffset = -1;

  static clipboardEmissions(output: string): ClipboardEmission[] {
    const terminalOutputAudit = new this();
    terminalOutputAudit.consume(output);
    return [...terminalOutputAudit.emissions];
  }

  get emissions(): readonly ClipboardEmission[] {
    return this.clipboardEmissionRecords;
  }

  consume(chunk: string): void {
    for (
      let characterOffset = 0;
      characterOffset < chunk.length;
      characterOffset += 1
    ) {
      this.consumeCharacter(
        chunk[characterOffset] ?? '',
        this.consumedOutputLength + characterOffset,
      );
    }
    this.consumedOutputLength += chunk.length;
  }

  protected consumeCharacter(character: string, absoluteOffset: number): void {
    if (this.parserState === 'ground') {
      if (character === '\x1b')
        this.beginControlSequence(absoluteOffset, false);
      return;
    }

    if (this.parserState === 'escape') {
      this.consumeEscapeFollower(character);
      return;
    }

    if (this.parserState === 'csi') {
      if (character === '\x1b') {
        this.beginControlSequence(absoluteOffset, true);
        return;
      }
      this.controlSequence += character;
      const characterCode = character.charCodeAt(0);
      if (characterCode < 0x40 || characterCode > 0x7e) return;
      if (this.controlSequence === '\x1b[?2026h')
        this.synchronizedFrameDepth += 1;
      if (this.controlSequence === '\x1b[?2026l') {
        this.synchronizedFrameDepth = Math.max(
          0,
          this.synchronizedFrameDepth - 1,
        );
      }
      this.finishControlSequence();
      return;
    }

    if (this.controlStringEscapePending) {
      this.consumeControlStringEscapeFollower(character, absoluteOffset);
      return;
    }

    if (character === '\x07') {
      if (this.parserState === 'osc') {
        this.controlSequence += character;
        this.appendClipboardEmission(absoluteOffset + 1);
      }
      this.finishControlSequence();
      return;
    }

    if (character === '\x1b') {
      if (this.parserState === 'osc') this.controlSequence += character;
      this.controlStringEscapePending = true;
      this.controlStringEscapeOffset = absoluteOffset;
      return;
    }

    if (this.parserState === 'osc') this.controlSequence += character;
  }

  protected beginControlSequence(
    startOffset: number,
    startedWithinControlSequence: boolean,
  ): void {
    this.parserState = 'escape';
    this.controlSequence = '\x1b';
    this.controlSequenceStartOffset = startOffset;
    this.controlSequenceStartedWithinAnother = startedWithinControlSequence;
    this.controlStringEscapePending = false;
    this.controlStringEscapeOffset = -1;
  }

  protected consumeEscapeFollower(character: string): void {
    this.controlSequence += character;
    if (character === '[') {
      this.parserState = 'csi';
      return;
    }
    if (character === ']') {
      this.parserState = 'osc';
      return;
    }
    if (['P', '_', '^', 'X'].includes(character)) {
      this.parserState = 'control-string';
      return;
    }
    this.finishControlSequence();
  }

  protected consumeControlStringEscapeFollower(
    character: string,
    absoluteOffset: number,
  ): void {
    this.controlStringEscapePending = false;
    if (character === '\\') {
      if (this.parserState === 'osc') {
        this.controlSequence += character;
        this.appendClipboardEmission(absoluteOffset + 1);
      }
      this.finishControlSequence();
      return;
    }

    this.controlSequence = '\x1b';
    this.controlSequenceStartOffset = this.controlStringEscapeOffset;
    this.controlSequenceStartedWithinAnother = true;
    this.controlStringEscapeOffset = -1;
    this.parserState = 'escape';
    this.consumeEscapeFollower(character);
  }

  protected appendClipboardEmission(endOffset: number): void {
    const terminatorLength = this.controlSequence.endsWith('\x07') ? 1 : 2;
    const content = this.controlSequence.slice(
      2,
      this.controlSequence.length - terminatorLength,
    );
    if (!content.startsWith('52;c;')) return;
    const base64Payload = content.slice('52;c;'.length);
    const decodedText = Buffer.from(base64Payload, 'base64').toString('utf8');
    const normalizedBase64Payload = Buffer.from(decodedText, 'utf8').toString(
      'base64',
    );
    this.clipboardEmissionRecords.push({
      startOffset: this.controlSequenceStartOffset,
      endOffset,
      sequence: this.controlSequence,
      base64Payload,
      decodedText,
      hasValidBase64Payload: normalizedBase64Payload === base64Payload,
      synchronizedFrameDepth: this.synchronizedFrameDepth,
      startedWithinControlSequence: this.controlSequenceStartedWithinAnother,
    });
  }

  protected finishControlSequence(): void {
    this.parserState = 'ground';
    this.controlSequence = '';
    this.controlSequenceStartOffset = -1;
    this.controlSequenceStartedWithinAnother = false;
    this.controlStringEscapePending = false;
    this.controlStringEscapeOffset = -1;
  }
}

export namespace TerminalOutputAudit {
  export const $Class = $TerminalOutputAudit;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
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
  'ground' | 'escape' | 'csi' | 'osc' | 'control-string';
