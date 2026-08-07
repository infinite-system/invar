#!/usr/bin/env bun
// CENSUS for task #530 (blind press suite census).
//
// What it finds out: every mouse PRESS gesture in scripts/harness/smoke-*.ts.
// A press gesture is any of:
//   1. a direct `sendMouse(...)` / `sendMouseWithoutFrameExpectation(...)`
//      whose object literal carries `kind: 'press'`;
//   2. a `sendMouseClick(...)` call (press + release pair);
//   3. a call to a SHARED press-emitting helper: HarnessSmoke.clickText,
//      HarnessSmoke.clickTextInRectangle, HarnessSmoke.closePanelContentsListRow,
//      HarnessSmoke.requestPanelContainerClose, clickMarker, dragBetweenCells
//      (HarnessSmokeSupport), and the ScrollbarThumbDrag drag helper;
//   4. a call to a LOCAL helper defined in the same smoke file whose own body
//      contains a press by rules 1-3 (found by a per-file closure pass, so a
//      helper wrapping a helper is still counted at its call site).
//
// How to run:
//   bun .invar/tasks/in-progress/530-blind-press-suite-census/census-530-press-sites.ts
//
// How to read the output: one line per press gesture, `file:line kind detail`.
// The final line prints the total row count. Each row is one census unit for
// the #530 STATIC-TARGET / MOVED-TARGET classification table; a change in the
// total means a press was added or removed in the suite and the table is stale.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const harnessDirectory = join(import.meta.dir, '../../../../scripts/harness');
const smokeFiles = readdirSync(harnessDirectory)
  .filter((name) => name.startsWith('smoke-') && name.endsWith('.ts'))
  .sort();

const sharedHelperNames = [
  'clickText',
  'clickTextInRectangle',
  'closePanelContentsListRow',
  'requestPanelContainerClose',
  'clickMarker',
  'dragBetweenCells',
  'dragScrollbarThumb',
  'ScrollbarThumbDrag',
];

interface CensusRow {
  file: string;
  line: number;
  kind: string;
  detail: string;
}

const rows: CensusRow[] = [];

for (const fileName of smokeFiles) {
  const filePath = join(harnessDirectory, fileName);
  const source = await Bun.file(filePath).text();
  const lines = source.split('\n');

  // Pass 1: find local press-wrapping helper definitions (closure to fixpoint).
  const pressEmittingLocals = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    let currentFunction: string | null = null;
    let functionStartDepth = 0;
    let depth = 0;
    for (const line of lines) {
      const definition = line.match(
        /(?:function\s+|(?:const|let)\s+)([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?\(|\()/,
      );
      if (definition && /function|=>|\)\s*(?::[^{]*)?\{/.test(line)) {
        currentFunction = definition[1];
        functionStartDepth = depth;
      }
      const bodyEmits =
        /kind:\s*'press'/.test(line) ||
        /sendMouseClick\s*\(/.test(line) ||
        sharedHelperNames.some((helper) =>
          new RegExp(`[.\\s(]${helper}\\s*\\(`).test(line),
        ) ||
        [...pressEmittingLocals].some((helper) =>
          new RegExp(`(?<![\\w$.])${helper}\\s*\\(`).test(line),
        );
      if (
        currentFunction &&
        bodyEmits &&
        !pressEmittingLocals.has(currentFunction)
      ) {
        pressEmittingLocals.add(currentFunction);
        grew = true;
      }
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      if (currentFunction && depth <= functionStartDepth && /\}/.test(line)) {
        currentFunction = null;
      }
    }
  }

  // Pass 2: emit census rows at every press site.
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (/kind:\s*'press'/.test(line)) {
      rows.push({
        file: fileName,
        line: lineNumber,
        kind: 'direct-press',
        detail: trimmed,
      });
      return;
    }
    if (/sendMouseClick\s*\(/.test(line)) {
      rows.push({
        file: fileName,
        line: lineNumber,
        kind: 'sendMouseClick',
        detail: trimmed,
      });
      return;
    }
    for (const helper of sharedHelperNames) {
      if (new RegExp(`[.\\s(]${helper}\\s*\\(`).test(line)) {
        rows.push({
          file: fileName,
          line: lineNumber,
          kind: `shared:${helper}`,
          detail: trimmed,
        });
        return;
      }
    }
    for (const helper of pressEmittingLocals) {
      const callPattern = new RegExp(`(?<![\\w$.])${helper}\\s*\\(`);
      const definitionPattern = new RegExp(
        `(?:function\\s+|(?:const|let)\\s+)${helper}\\b`,
      );
      if (callPattern.test(line) && !definitionPattern.test(line)) {
        rows.push({
          file: fileName,
          line: lineNumber,
          kind: `local:${helper}`,
          detail: trimmed,
        });
        return;
      }
    }
  });
}

for (const row of rows) {
  console.log(`${row.file}:${row.line}\t${row.kind}\t${row.detail}`);
}
console.log(
  `TOTAL press gestures: ${rows.length} across ${smokeFiles.length} smoke files`,
);
