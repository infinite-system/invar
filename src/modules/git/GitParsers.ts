// Pure parsers for stable Git CLI formats. These produce compact plain records; callers may
// retain or virtualize the arrays without creating a reactive object per status/commit row.
import { Static } from 'ivue/extras';

class $GitParsers {
  static parseStatusPorcelainV2(output: string): GitStatusSnapshot {
    const statusSnapshot: GitStatusSnapshot = {
      branch: '',
      head: '',
      staged: [],
      unstaged: [],
      untracked: [],
    };

    for (const rawLine of output.split(/\r?\n/)) {
      if (!rawLine) {
        continue;
      }
      if (rawLine.startsWith('# branch.oid ')) {
        const headSha = rawLine.slice('# branch.oid '.length);
        statusSnapshot.head = headSha === '(initial)' ? '' : headSha;
        continue;
      }
      if (rawLine.startsWith('# branch.head ')) {
        statusSnapshot.branch = rawLine.slice('# branch.head '.length);
        continue;
      }
      if (rawLine.startsWith('? ')) {
        statusSnapshot.untracked.push(this.makeFileRecord(rawLine.slice(2), '??'));
        continue;
      }
      if (rawLine.startsWith('! ')) {
        continue;
      }
      if (rawLine.startsWith('1 ')) {
        const parsePrefix = this.splitPrefix(rawLine, 8);
        if (!parsePrefix) {
          continue;
        }
        this.addTrackedRecord(
          statusSnapshot,
          this.makeFileRecord(parsePrefix.rest, parsePrefix.fields[1] ?? '..'),
        );
        continue;
      }
      if (rawLine.startsWith('2 ')) {
        const parsePrefix = this.splitPrefix(rawLine, 9);
        if (!parsePrefix) {
          continue;
        }
        const tabIndex = parsePrefix.rest.indexOf('\t');
        const path = tabIndex < 0 ? parsePrefix.rest : parsePrefix.rest.slice(0, tabIndex);
        const originalPath =
          tabIndex < 0 ? undefined : parsePrefix.rest.slice(tabIndex + 1);
        this.addTrackedRecord(
          statusSnapshot,
          this.makeFileRecord(path, parsePrefix.fields[1] ?? '..', originalPath),
        );
        continue;
      }
      if (rawLine.startsWith('u ')) {
        const parsePrefix = this.splitPrefix(rawLine, 10);
        if (!parsePrefix) {
          continue;
        }
        this.addTrackedRecord(
          statusSnapshot,
          this.makeFileRecord(parsePrefix.rest, parsePrefix.fields[1] ?? 'UU'),
        );
      }
    }

    return statusSnapshot;
  }

  protected static splitPrefix(
    rawLine: string,
    fieldCount: number,
  ): SplitPrefixResult | null {
    const fields: string[] = [];
    let startIndex = 0;

    while (fields.length < fieldCount) {
      const separatorIndex = rawLine.indexOf(' ', startIndex);
      if (separatorIndex < 0) {
        return null;
      }
      fields.push(rawLine.slice(startIndex, separatorIndex));
      startIndex = separatorIndex + 1;
    }

    return { fields, rest: rawLine.slice(startIndex) };
  }

  protected static decodeGitPath(quotedPath: string): string {
    if (quotedPath.length < 2 || quotedPath[0] !== '"' || quotedPath[quotedPath.length - 1] !== '"') {
      return quotedPath;
    }

    const decodedBytes: number[] = [];
    let scanIndex = 1;
    while (scanIndex < quotedPath.length - 1) {
      const character = quotedPath[scanIndex];
      if (character !== '\\') {
        const codePoint = quotedPath.codePointAt(scanIndex);
        decodedBytes.push(...this.textEncoder.encode(String.fromCodePoint(codePoint ?? 0)));
        scanIndex += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
        continue;
      }

      const escapeSequence = quotedPath[scanIndex + 1];
      if (escapeSequence === undefined) {
        break;
      }
      const octalSequence = quotedPath.slice(scanIndex + 1, scanIndex + 4);
      if (/^[0-7]{3}$/.test(octalSequence)) {
        decodedBytes.push(Number.parseInt(octalSequence, 8));
        scanIndex += 4;
        continue;
      }

      decodedBytes.push(this.decodedCharacterCode(escapeSequence));
      scanIndex += 2;
    }

    return this.textDecoder.decode(Uint8Array.from(decodedBytes));
  }

  protected static decodedCharacterCode(escapedCharacter: string): number {
    const escapedCharacterCodes: Record<string, number> = {
      a: 7,
      b: 8,
      t: 9,
      n: 10,
      v: 11,
      f: 12,
      r: 13,
      '"': 34,
      '\\': 92,
    };
    return escapedCharacterCodes[escapedCharacter] ?? escapedCharacter.codePointAt(0) ?? 0;
  }

  protected static makeFileRecord(
    path: string,
    status: string,
    originalPath?: string,
  ): GitFileRecord {
    return {
      path: this.decodeGitPath(path),
      xy: status,
      x: status[0] ?? '.',
      y: status[1] ?? '.',
      ...(originalPath === undefined
        ? {}
        : { originalPath: this.decodeGitPath(originalPath) }),
    };
  }

  protected static addTrackedRecord(
    statusSnapshot: GitStatusSnapshot,
    fileRecord: GitFileRecord,
  ): void {
    if (fileRecord.x !== '.') {
      statusSnapshot.staged.push(fileRecord);
    }
    if (fileRecord.y !== '.') {
      statusSnapshot.unstaged.push(fileRecord);
    }
  }

  static parseLog(output: string): CommitRecord[] {
    const commits: CommitRecord[] = [];

    for (const rawRecord of output.split(this.logRecordSeparator)) {
      const parsedRecord = rawRecord.replace(/^\r?\n+|\r?\n+$/g, '');
      if (!parsedRecord) {
        continue;
      }
      const fields = parsedRecord.split(this.logFieldSeparator);
      if (fields.length < 5) {
        continue;
      }
      const refsField = fields.slice(5).join(this.logFieldSeparator);
      commits.push({
        sha: fields[0] ?? '',
        shortSha: fields[1] ?? '',
        author: fields[2] ?? '',
        dateIso: fields[3] ?? '',
        subject: fields[4] ?? '',
        refs: refsField
          .split(',')
          .map((refName) => refName.trim())
          .filter(Boolean),
      });
    }

    return commits;
  }

  /** One branch name per line (`for-each-ref --format=%(refname:short)` output). */
  static parseNameStatus(output: string): CommitFileChange[] {
    const changes: CommitFileChange[] = [];

    for (const rawLine of output.split(/\r?\n/)) {
      if (!rawLine) {
        continue;
      }
      const fields = rawLine.split('\t');
      const statusField = fields[0];
      const status = statusField?.[0];
      if (!status || !/[A-Z]/.test(status) || fields.length < 2) {
        continue;
      }
      if ((status === 'R' || status === 'C') && fields.length >= 3) {
        changes.push({
          status,
          path: this.decodeGitPath(fields[2] ?? ''),
          originalPath: this.decodeGitPath(fields[1] ?? ''),
        });
      } else {
        changes.push({
          status,
          path: this.decodeGitPath(fields[1] ?? ''),
        });
      }
    }

    return changes;
  }

  static parseLocalBranches(output: string): string[] {
    return output
      .split('\n')
      .map((branchName) => branchName.trim())
      .filter((branchName) => branchName.length > 0);
  }

  protected static get logFieldSeparator(): string {
    return '\x1f';
  }

  protected static get logRecordSeparator(): string {
    return '\x1e';
  }

  static get logFormat(): string {
    return [
      '%H',
      '%h',
      '%an',
      '%ad',
      '%s',
      '%D',
    ].join('%x1f') + '%x1e';
  }

  protected static get textEncoder(): TextEncoder {
    const cache = this.$textEncoderCache;
    if (cache.textEncoder === null) {
      cache.textEncoder = new TextEncoder();
    }
    return cache.textEncoder;
  }

  protected static get textDecoder(): TextDecoder {
    const cache = this.$textDecoderCache;
    if (cache.textDecoder === null) {
      cache.textDecoder = new TextDecoder();
    }
    return cache.textDecoder;
  }

  protected static $textEncoderCache: { textEncoder: TextEncoder | null } = {
    textEncoder: null,
  };

  protected static $textDecoderCache: { textDecoder: TextDecoder | null } = {
    textDecoder: null,
  };
}

export namespace GitParsers {
  export const $Class = $GitParsers;
  export const Class = Static($GitParsers);
}

export interface GitFileRecord {
  path: string;
  xy: string;
  x: string;
  y: string;
  originalPath?: string;
}

export interface GitStatusSnapshot {
  branch: string;
  head: string;
  staged: GitFileRecord[];
  unstaged: GitFileRecord[];
  untracked: GitFileRecord[];
}

export interface CommitRecord {
  sha: string;
  shortSha: string;
  author: string;
  dateIso: string;
  subject: string;
  refs: string[];
}

interface SplitPrefixResult {
  fields: string[];
  rest: string;
}

export interface CommitFileChange {
  /** One status letter: M/A/D/R/C/T/U — a rename/copy similarity score suffix (R100) is dropped. */
  status: string;
  /** The file's path in the commit (for a rename, the NEW path). */
  path: string;
  /** A rename/copy's source path. */
  originalPath?: string;
}
