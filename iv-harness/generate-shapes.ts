#!/usr/bin/env bun
/**
 * Regenerates iv-harness/shapes.generated.json from the TypeScript
 * sources. Generated, never authored — edit types, rerun this.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HarnessShapes } from './src/modules/shapes/HarnessShapes.ts';

const rootDirectory = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const catalog = HarnessShapes.Class.generate(rootDirectory);
writeFileSync(
  join(rootDirectory, HarnessShapes.$Class.SHAPES_FILE_RELATIVE_PATH),
  JSON.stringify(catalog, null, 2) + '\n',
);
console.log(
  `shapes: ${Object.keys(catalog.interfaces).length} interface(s), ` +
    `${Object.keys(catalog.classes).length} class(es) -> ${HarnessShapes.$Class.SHAPES_FILE_RELATIVE_PATH}`,
);
