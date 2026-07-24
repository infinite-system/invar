// Pure file-reference DETECTION for the agent transcript — the syntax half of "a file reference is a
// click". Finds path-like tokens (workspace-relative or absolute, optional :line / :line:column suffix)
// in a projected row's text, and locates a tool summary's basename span from the tool input's REAL
// file_path. Pure and filesystem-free: whether a detected candidate actually RESOLVES inside the
// workspace root is the caller's affair (the projection filters through an injected resolver), so this
// seam stays deterministic and unit-testable. Spans are DISPLAY CELLS (the same unit the renderer and
// pointer hit-map speak — grapheme-safe through the shared WrapText geometry seam).
//
// invariant: File references in the transcript are clickable projections (src/modules/agent/agent.invariants.md)
import { Static } from 'ivue/extras';
import { WrapText } from '../ui/WrapText';

/** A syntactic file-reference candidate found in a row's text. Cells are [startCell, endCell). */
export interface DetectedFileReference {
  /** First display cell of the reference (including any :line suffix — the whole token is the link). */
  readonly startCell: number;
  /** One past the last display cell of the reference. */
  readonly endCell: number;
  /** The path as written, WITHOUT the :line/:line:column suffix. */
  readonly reference: string;
  /** 1-based line from a `:line` suffix, or null when the token carries none. */
  readonly line: number | null;
  /** 1-based column from a `:line:column` suffix, or null. */
  readonly column: number | null;
}

/** A path-like token: path-safe characters around at least one `/`, optionally suffixed `:line[:col]`.
 *  The character class deliberately excludes quotes/brackets/spaces so tokens inside `"…"` or `(...)`
 *  match cleanly, and excludes `:` outside the numeric suffix so URLs never swallow into the path. */
const PATH_CANDIDATE = /[A-Za-z0-9_.~$@+-]*\/[A-Za-z0-9_.~$@+/-]*(?::(\d+)(?::(\d+))?)?/g;

/** Trailing sentence punctuation that is prose, not path: "see src/foo.ts." must not include the dot. */
const TRAILING_PUNCTUATION = /[.,;!?]+$/;

/** Find every syntactic file-reference candidate in `text` (one visual row). Pure syntax — no
 *  filesystem. URLs are rejected (a `//` start or a `scheme:` immediately before the match). */
function $detectInText(text: string): DetectedFileReference[] {
  const detected: DetectedFileReference[] = [];
  PATH_CANDIDATE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_CANDIDATE.exec(text)) !== null) {
    let token = match[0];
    const matchStart = match.index;
    // Reject URL bodies: "https://host/path" matches from "//host/path"; the giveaway is the token
    // starting with "//" or the character immediately before it being ":".
    if (token.startsWith('//') || (matchStart > 0 && text[matchStart - 1] === ':')) continue;
    // Split off the :line[:column] suffix before trimming prose punctuation.
    let line: number | null = null;
    let column: number | null = null;
    const suffixMatch = /:(\d+)(?::(\d+))?$/.exec(token);
    let path = token;
    if (suffixMatch) {
      path = token.slice(0, suffixMatch.index);
      line = Number(suffixMatch[1]);
      column = suffixMatch[2] !== undefined ? Number(suffixMatch[2]) : null;
    }
    // Trailing sentence punctuation belongs to the prose. Trim it off the PATH (and, when there was no
    // numeric suffix, off the token span too).
    const trimmedPath = path.replace(TRAILING_PUNCTUATION, '');
    const trimmedCharacters = path.length - trimmedPath.length;
    if (suffixMatch === null && trimmedCharacters > 0) token = token.slice(0, token.length - trimmedCharacters);
    path = trimmedPath;
    // A bare "/" or an empty remainder is not a reference; nor is a lone word ending in "/" ("and/").
    if (path.length === 0 || path === '/' || !/[A-Za-z0-9_]/.test(path.replace(/\//g, ''))) continue;
    const startCell = WrapText.Class.displayWidth(text.slice(0, matchStart));
    const endCell = startCell + WrapText.Class.displayWidth(token);
    detected.push({ startCell, endCell, reference: path, line, column });
  }
  return detected;
}

/** Locate the span of `filePath`'s basename inside a collapsed tool-summary row (`rowText`), carrying
 *  the REAL path from the tool input — never re-parsed from the summary. Null when the basename does
 *  not appear (e.g. clipped away by the row's ellipsis). */
function $summarySpan(rowText: string, filePath: string): DetectedFileReference | null {
  const segments = filePath.split(/[/\\]+/).filter((segment) => segment.length > 0);
  const baseName = segments.length > 0 ? segments[segments.length - 1]! : filePath;
  if (baseName.length === 0) return null;
  const foundAt = rowText.lastIndexOf(baseName);
  if (foundAt < 0) return null;
  const startCell = WrapText.Class.displayWidth(rowText.slice(0, foundAt));
  return {
    startCell,
    endCell: startCell + WrapText.Class.displayWidth(baseName),
    reference: filePath,
    line: null,
    column: null,
  };
}

class $AgentFileReferences {
  static detectInText = $detectInText;
  static summarySpan = $summarySpan;
}

export namespace AgentFileReferences {
  export const $Class = $AgentFileReferences;
  export const Class = Static($AgentFileReferences);
}
