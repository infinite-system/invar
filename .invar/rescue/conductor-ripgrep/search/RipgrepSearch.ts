import { Static } from 'ivue/extras';
import { Processes, type RunResult } from '../system/Processes';

export interface RipgrepSearchOptions {
  /** Match letter case exactly. The VS Code-style default is case-insensitive. */
  readonly caseSensitive?: boolean;
  /** Require matches to span whole words. */
  readonly wholeWord?: boolean;
  /** Interpret the query as a regular expression. The default is fixed-string search. */
  readonly regularExpression?: boolean;
  readonly includeGlobs?: readonly string[];
  readonly excludeGlobs?: readonly string[];
}

export interface RipgrepSearchRow {
  readonly path: string;
  readonly line: number;
  /** One-based UTF-8 byte column, matching ripgrep's column convention. */
  readonly column: number;
  readonly text: string;
  /** Zero-based UTF-8 byte offset within the matched line. */
  readonly matchStart: number;
  /** Exclusive zero-based UTF-8 byte offset within the matched line. */
  readonly matchEnd: number;
}

interface RipgrepSearchCapability {
  parseOutput(output: string): RipgrepSearchRow[];
  runRipgrep(
    query: string,
    root: string,
    options?: RipgrepSearchOptions,
  ): Promise<RunResult>;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function textFromRipgrepField(value: unknown): string | null {
  const field = recordFromUnknown(value);
  return typeof field?.text === 'string' ? field.text : null;
}

function removeLineTerminator(text: string): string {
  return text.endsWith('\r\n')
    ? text.slice(0, -2)
    : text.endsWith('\n')
      ? text.slice(0, -1)
      : text;
}

function $buildArgumentVector(
  query: string,
  root: string,
  options: RipgrepSearchOptions = {},
): string[] {
  const argumentVector = ['rg', '--json', '--line-number', '--column'];

  if (options.caseSensitive !== true) argumentVector.push('-i');
  if (options.wholeWord === true) argumentVector.push('-w');
  if (options.regularExpression !== true) argumentVector.push('-F');

  for (const includeGlob of options.includeGlobs ?? []) {
    argumentVector.push('--glob', includeGlob);
  }
  for (const excludeGlob of options.excludeGlobs ?? []) {
    argumentVector.push('--glob', `!${excludeGlob}`);
  }

  argumentVector.push('--', query, root);
  return argumentVector;
}

function $parseOutput(output: string): RipgrepSearchRow[] {
  const rows: RipgrepSearchRow[] = [];

  for (const outputLine of output.split(/\r?\n/)) {
    if (outputLine.length === 0) continue;

    let event: unknown;
    try {
      event = JSON.parse(outputLine);
    } catch {
      continue;
    }

    const eventRecord = recordFromUnknown(event);
    if (eventRecord?.type !== 'match') continue;

    const data = recordFromUnknown(eventRecord.data);
    const path = textFromRipgrepField(data?.path);
    const lineText = textFromRipgrepField(data?.lines);
    const lineNumber = data?.line_number;
    const submatches = data?.submatches;
    if (
      path === null ||
      lineText === null ||
      !Number.isInteger(lineNumber) ||
      (lineNumber as number) < 1 ||
      !Array.isArray(submatches)
    ) {
      continue;
    }

    for (const submatchValue of submatches) {
      const submatch = recordFromUnknown(submatchValue);
      const matchStart = submatch?.start;
      const matchEnd = submatch?.end;
      if (
        !Number.isInteger(matchStart) ||
        !Number.isInteger(matchEnd) ||
        (matchStart as number) < 0 ||
        (matchEnd as number) < (matchStart as number)
      ) {
        continue;
      }

      rows.push({
        path,
        line: lineNumber as number,
        column: (matchStart as number) + 1,
        text: removeLineTerminator(lineText),
        matchStart: matchStart as number,
        matchEnd: matchEnd as number,
      });
    }
  }

  return rows;
}

async function $runRipgrep(
  query: string,
  root: string,
  options: RipgrepSearchOptions = {},
): Promise<RunResult> {
  // invariant: Language and git tools are separate failable processes (project.invariants.md)
  return Processes.Class.run($buildArgumentVector(query, root, options), root);
}

async function $search(
  this: RipgrepSearchCapability,
  query: string,
  root: string,
  options: RipgrepSearchOptions = {},
): Promise<RipgrepSearchRow[]> {
  const result = await this.runRipgrep(query, root, options);
  return this.parseOutput(result.stdout);
}

class $RipgrepSearch {
  static buildArgumentVector = $buildArgumentVector;
  static parseOutput = $parseOutput;
  static runRipgrep = $runRipgrep;
  static search = $search;
}

export namespace RipgrepSearch {
  export const $Class = $RipgrepSearch;
  export const Class = Static($RipgrepSearch);
}
