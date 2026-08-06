import { statSync } from 'node:fs';
import { Static } from 'ivue/extras';

class $BracketedPathPaste {
  protected static get startMarker(): Uint8Array {
    return new TextEncoder().encode('\u001b[200~');
  }

  protected static get endMarker(): Uint8Array {
    return new TextEncoder().encode('\u001b[201~');
  }

  static localRegularFilePaths(payload: string): string[] | null {
    const paths = this.shellWords(payload);
    if (paths.length === 0) return null;
    for (const path of paths) {
      try {
        if (!statSync(path).isFile()) return null;
      } catch {
        return null;
      }
    }
    return paths;
  }

  static shellQuote(path: string): string {
    return `'${path.replaceAll("'", "'\"'\"'")}'`;
  }

  protected static shellWords(text: string): string[] {
    const words: string[] = [];
    let word = '';
    let quote: 'single' | 'double' | null = null;
    let escaping = false;
    let wordStarted = false;
    for (const character of text.trim()) {
      if (escaping) {
        word += character;
        wordStarted = true;
        escaping = false;
        continue;
      }
      if (character === '\\' && quote !== 'single') {
        escaping = true;
        wordStarted = true;
        continue;
      }
      if (character === "'" && quote !== 'double') {
        quote = quote === 'single' ? null : 'single';
        wordStarted = true;
        continue;
      }
      if (character === '"' && quote !== 'single') {
        quote = quote === 'double' ? null : 'double';
        wordStarted = true;
        continue;
      }
      if (/\s/u.test(character) && quote === null) {
        if (wordStarted) words.push(word);
        word = '';
        wordStarted = false;
        continue;
      }
      word += character;
      wordStarted = true;
    }
    if (escaping || quote !== null) return [];
    if (wordStarted) words.push(word);
    return words;
  }

  constructor(
    protected readonly forward: (bytes: Uint8Array) => void,
    protected readonly upload: (path: string) => Promise<string>,
  ) {}

  protected bufferedBytes = new Uint8Array();
  protected readingPaste = false;
  protected ambiguousPrefixImmediate: ReturnType<typeof setImmediate> | null =
    null;

  async push(bytes: Uint8Array): Promise<void> {
    const bracketedPathPasteClass = this
      .constructor as typeof $BracketedPathPaste;
    if (this.ambiguousPrefixImmediate) {
      clearImmediate(this.ambiguousPrefixImmediate);
      this.ambiguousPrefixImmediate = null;
    }
    this.append(bytes);
    while (this.bufferedBytes.length > 0) {
      if (this.readingPaste) {
        const endOffset = this.indexOf(
          this.bufferedBytes,
          bracketedPathPasteClass.endMarker,
        );
        if (endOffset < 0) return;
        const payload = this.bufferedBytes.slice(0, endOffset);
        this.bufferedBytes = this.bufferedBytes.slice(
          endOffset + bracketedPathPasteClass.endMarker.length,
        );
        this.readingPaste = false;
        await this.forwardPaste(payload);
        continue;
      }
      const startOffset = this.indexOf(
        this.bufferedBytes,
        bracketedPathPasteClass.startMarker,
      );
      if (startOffset >= 0) {
        this.forward(this.bufferedBytes.slice(0, startOffset));
        this.bufferedBytes = this.bufferedBytes.slice(
          startOffset + bracketedPathPasteClass.startMarker.length,
        );
        this.readingPaste = true;
        continue;
      }
      const retainedByteCount = this.markerPrefixLength(
        this.bufferedBytes,
        bracketedPathPasteClass.startMarker,
      );
      const forwardedByteCount = this.bufferedBytes.length - retainedByteCount;
      if (forwardedByteCount > 0) {
        this.forward(this.bufferedBytes.slice(0, forwardedByteCount));
        this.bufferedBytes = this.bufferedBytes.slice(forwardedByteCount);
      }
      if (this.bufferedBytes.length > 0) {
        this.ambiguousPrefixImmediate = setImmediate(() => {
          this.ambiguousPrefixImmediate = null;
          this.forward(this.bufferedBytes);
          this.bufferedBytes = new Uint8Array();
        });
      }
      return;
    }
  }

  flush(): void {
    const bracketedPathPasteClass = this
      .constructor as typeof $BracketedPathPaste;
    if (this.ambiguousPrefixImmediate) {
      clearImmediate(this.ambiguousPrefixImmediate);
      this.ambiguousPrefixImmediate = null;
    }
    if (this.readingPaste) this.forward(bracketedPathPasteClass.startMarker);
    this.forward(this.bufferedBytes);
    this.bufferedBytes = new Uint8Array();
    this.readingPaste = false;
  }

  protected async forwardPaste(payload: Uint8Array): Promise<void> {
    const bracketedPathPasteClass = this
      .constructor as typeof $BracketedPathPaste;
    const localPaths = bracketedPathPasteClass.localRegularFilePaths(
      new TextDecoder().decode(payload),
    );
    this.forward(bracketedPathPasteClass.startMarker);
    if (localPaths === null) {
      this.forward(payload);
    } else {
      const remotePaths: string[] = [];
      for (const localPath of localPaths)
        remotePaths.push(await this.upload(localPath));
      this.forward(
        new TextEncoder().encode(
          remotePaths.map(bracketedPathPasteClass.shellQuote).join(' '),
        ),
      );
    }
    this.forward(bracketedPathPasteClass.endMarker);
  }

  protected append(bytes: Uint8Array): void {
    const combined = new Uint8Array(this.bufferedBytes.length + bytes.length);
    combined.set(this.bufferedBytes);
    combined.set(bytes, this.bufferedBytes.length);
    this.bufferedBytes = combined;
  }

  protected indexOf(haystack: Uint8Array, needle: Uint8Array): number {
    for (
      let offset = 0;
      offset <= haystack.length - needle.length;
      offset += 1
    ) {
      let matches = true;
      for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
        if (haystack[offset + needleIndex] !== needle[needleIndex]) {
          matches = false;
          break;
        }
      }
      if (matches) return offset;
    }
    return -1;
  }

  protected markerPrefixLength(bytes: Uint8Array, marker: Uint8Array): number {
    const maximumLength = Math.min(bytes.length, marker.length - 1);
    for (let length = maximumLength; length > 0; length -= 1) {
      let matches = true;
      for (let index = 0; index < length; index += 1) {
        if (bytes[bytes.length - length + index] !== marker[index]) {
          matches = false;
          break;
        }
      }
      if (matches) return length;
    }
    return 0;
  }
}

export namespace BracketedPathPaste {
  export const $Class = Static($BracketedPathPaste);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
