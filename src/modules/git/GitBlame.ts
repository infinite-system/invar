// PURE parsing for `git blame --porcelain` output. Stateless by design: the cache, the in-flight
// guard, the reactive load signal, and their lifecycle live in the workspace-owned
// `GitBlameCache` (a bounded, disposable Reactive instance) — a Static capability must never hide
// mutable module-level state behind its facade.
//
// invariant: An unblamable file degrades to no blame, never an error (src/modules/git/git.invariants.md)
import { Static } from 'ivue/extras';

/** Authorship of ONE line: who last touched it, when, the commit summary, and its sha. `uncommitted` is
 *  true for a working-tree line git has not committed yet (the all-zero sha). */
class $GitBlame {
  protected static get UNCOMMITTED_SHA(): string {
    return '0000000000000000000000000000000000000000';
  }

  protected static get PORCELAIN_HEADER_PATTERN(): RegExp {
    return /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/;
  }

  protected static parsePorcelainMetadataLine(headerLine: string): {
    sha: string;
    lineNumber: number;
  } {
    const match = this.PORCELAIN_HEADER_PATTERN.exec(headerLine);
    if (!match) {
      return { sha: '', lineNumber: 0 };
    }
    return {
      sha: match[1] ?? '',
      lineNumber: Number.parseInt(match[2] ?? '0', 10),
    };
  }

  static parsePorcelain(output: string): Map<number, BlameLine> {
    const shaMetadata = new Map<
      string,
      { author: string; authorTimeMs: number; summary: string }
    >();
    const result = new Map<number, BlameLine>();
    const rawLines = output.split('\n');
    let rawLineIndex = 0;

    while (rawLineIndex < rawLines.length) {
      const header = this.parsePorcelainMetadataLine(
        rawLines[rawLineIndex] ?? '',
      );
      if (!header.sha) {
        rawLineIndex += 1;
        continue;
      }

      const metadata = shaMetadata.get(header.sha) ?? {
        author: '',
        authorTimeMs: 0,
        summary: '',
      };
      rawLineIndex += 1;

      // Consume this hunk's metadata lines up to the tab-prefixed content line. On a repeated sha there
      // are none (git omits already-sent metadata), so the cached metadata is reused unchanged.
      while (
        rawLineIndex < rawLines.length &&
        !(rawLines[rawLineIndex] ?? '').startsWith('\t')
      ) {
        const currentLine = rawLines[rawLineIndex] ?? '';
        if (currentLine.startsWith('author ')) {
          metadata.author = currentLine.slice('author '.length);
        } else if (currentLine.startsWith('author-time ')) {
          metadata.authorTimeMs =
            Number.parseInt(currentLine.slice('author-time '.length), 10) *
            1000;
        } else if (currentLine.startsWith('summary ')) {
          metadata.summary = currentLine.slice('summary '.length);
        }
        rawLineIndex += 1;
      }
      shaMetadata.set(header.sha, metadata);

      if (
        rawLineIndex < rawLines.length &&
        (rawLines[rawLineIndex] ?? '').startsWith('\t')
      ) {
        rawLineIndex += 1;
      }

      const isUncommittedLine = header.sha === this.UNCOMMITTED_SHA;
      result.set(header.lineNumber, {
        sha: header.sha,
        author: isUncommittedLine ? 'You (uncommitted)' : metadata.author,
        authorTimeMs: metadata.authorTimeMs,
        summary: isUncommittedLine ? 'Uncommitted changes' : metadata.summary,
        uncommitted: isUncommittedLine,
      });
    }

    return result;
  }
}

export namespace GitBlame {
  export const $Class = Static($GitBlame);
  export let Class = $Class;
}

export interface BlameLine {
  readonly sha: string;
  readonly author: string;
  readonly authorTimeMs: number;
  readonly summary: string;
  readonly uncommitted: boolean;
}
