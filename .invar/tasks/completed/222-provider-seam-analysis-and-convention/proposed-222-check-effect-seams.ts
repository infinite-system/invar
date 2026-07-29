// EFFECT-SEAM BOUNDARY: a consumer reaches an EFFECTFUL capability through an overridable seam
// getter, never through the bare `X.Class` slot. Pure generators stay direct — a getter around a
// pure function buys nothing and costs a lookup.
//
// The effectful population is DISCOVERED, never enumerated: a capability namespace under the
// capability roots is effectful when its own module imports a `node:*` builtin or reads one of the
// ambient capability globals (process, Bun, Date, performance, globalThis), or when it imports a
// sibling that already is. A hand-written list of effectful namespaces would rot the moment
// someone adds one, and a rotted list reports green over a shrinking fraction of its population.
//
// Existing coupling is held by a SHRINKING BASELINE (scripts/effect-seam-baseline.txt), the same
// mechanism the plugin-canvas boundary uses: a file/namespace pair with bare sites must be listed
// with a maximum. A pair with no row fails on its FIRST bare site, so new coupling blocks today
// while the known sites are converted task by task. A decrease prints tightenable slack.
import * as ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = new URL('..', import.meta.url).pathname;
const capabilityRoots = ['src/modules/system', 'src/modules/storage'];
const baselinePath = 'scripts/effect-seam-baseline.txt';
const ambientCapabilityGlobals = new Set([
  'process',
  'Bun',
  'Date',
  'performance',
  'globalThis',
]);

const printBaseline = process.argv.includes('--print-baseline');

function parse(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    readFileSync(join(repositoryRoot, relativePath), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function scanFiles(root: string): string[] {
  return [...new Bun.Glob(`${root}/**/*.ts`).scanSync({ cwd: repositoryRoot })]
    .filter((path) => !path.endsWith('.test.ts'))
    .sort();
}

/** `get X() { return X.Class; }` — the seam getter body. Returns the namespace it wraps. */
function seamGetterNamespace(node: ts.Node): string | null {
  if (!ts.isGetAccessorDeclaration(node) || !node.body) return null;
  if (node.body.statements.length !== 1) return null;
  const only = node.body.statements[0];
  if (!ts.isReturnStatement(only) || !only.expression) return null;
  const returned = only.expression;
  if (!ts.isPropertyAccessExpression(returned)) return null;
  if (returned.name.text !== 'Class' && returned.name.text !== '$Class') {
    return null;
  }
  return ts.isIdentifier(returned.expression) ? returned.expression.text : null;
}

/** THE CRITERION, applied uniformly: does this module touch an ambient capability? */
function discoverEffectfulNamespaces(): Map<string, string> {
  const reasonByNamespace = new Map<string, string>();
  const siblingsByNamespace = new Map<string, string[]>();
  for (const root of capabilityRoots) {
    for (const relativePath of scanFiles(root)) {
      if (relativePath.endsWith('.interface.ts')) continue;
      const namespaceName = relativePath
        .replace(/^.*\//, '')
        .replace(/\.ts$/, '');
      const sourceFile = parse(relativePath);
      const reasons: string[] = [];
      const siblings: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const specifier = node.moduleSpecifier.text;
          if (specifier.startsWith('node:'))
            reasons.push(`imports ${specifier}`);
          else if (specifier.startsWith('.')) {
            siblings.push(specifier.replace(/^.*\//, ''));
          }
        }
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ambientCapabilityGlobals.has(node.expression.text)
        ) {
          reasons.push(`reads ${node.expression.text}.${node.name.text}`);
        }
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ambientCapabilityGlobals.has(node.expression.text)
        ) {
          reasons.push(`constructs ${node.expression.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      siblingsByNamespace.set(namespaceName, siblings);
      if (reasons.length > 0) {
        reasonByNamespace.set(namespaceName, [...new Set(reasons)].join(', '));
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [namespaceName, siblings] of siblingsByNamespace) {
      if (reasonByNamespace.has(namespaceName)) continue;
      const effectfulSibling = siblings.find((sibling) =>
        reasonByNamespace.has(sibling),
      );
      if (effectfulSibling) {
        reasonByNamespace.set(namespaceName, `via ${effectfulSibling}`);
        changed = true;
      }
    }
  }
  return reasonByNamespace;
}

const effectfulNamespaces = discoverEffectfulNamespaces();

// COMPLETENESS GUARD, from an independent source: the capability roots publish one namespace per
// eponymous file, so the discovered population plus the pure remainder must equal that file count.
const capabilityFileCount = capabilityRoots
  .flatMap((root) => scanFiles(root))
  .filter((path) => !path.endsWith('.interface.ts')).length;
if (capabilityFileCount === 0) {
  console.error(
    'CONVENTIONS FAIL: effect-seam check inspected zero capability files',
  );
  process.exit(1);
}
if (effectfulNamespaces.size === 0) {
  console.error(
    `CONVENTIONS FAIL: effect-seam check found no effectful capability among ${capabilityFileCount} files — the criterion cannot be right`,
  );
  process.exit(1);
}

type Site = {
  file: string;
  line: number;
  namespaceName: string;
  member: string;
};
const sites: Site[] = [];
for (const relativePath of scanFiles('src/modules')) {
  if (capabilityRoots.some((root) => relativePath.startsWith(`${root}/`)))
    continue;
  const sourceFile = parse(relativePath);
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      effectfulNamespaces.has(node.expression.text)
    ) {
      const namespaceName = node.expression.text;
      let ancestor: ts.Node | undefined = node.parent;
      let insideOwnSeamGetter = false;
      while (ancestor !== undefined) {
        if (seamGetterNamespace(ancestor) === namespaceName) {
          insideOwnSeamGetter = true;
          break;
        }
        ancestor = ancestor.parent;
      }
      if (!insideOwnSeamGetter) {
        sites.push({
          file: relativePath,
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          namespaceName,
          member: node.name.text,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const observed = new Map<string, Site[]>();
for (const site of sites) {
  const key = `${site.file}\t${site.namespaceName}`;
  observed.set(key, [...(observed.get(key) ?? []), site]);
}

if (printBaseline) {
  console.log(
    '# file<TAB>namespace<TAB>maximum bare sites — SHRINKING; never add a row to pass.',
  );
  for (const [key, keySites] of [...observed].sort())
    console.log(`${key}\t${keySites.length}`);
  process.exit(0);
}

const baseline = new Map<string, number>();
if (existsSync(join(repositoryRoot, baselinePath))) {
  for (const line of readFileSync(
    join(repositoryRoot, baselinePath),
    'utf8',
  ).split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [file, namespaceName, maximum] = line.split('\t');
    baseline.set(`${file}\t${namespaceName}`, Number(maximum));
  }
}

let failed = false;
for (const [key, keySites] of [...observed].sort()) {
  const maximum = baseline.get(key);
  if (maximum === undefined) {
    console.error(
      `CONVENTIONS FAIL: effect seam — ${key.split('\t')[1]} is EFFECTFUL (${effectfulNamespaces.get(key.split('\t')[1])}) and is reached bare, with no baseline row:`,
    );
    for (const site of keySites)
      console.error(
        `  ${site.file}:${site.line}  ${site.namespaceName}.${site.member}`,
      );
    console.error(
      `  Add a seam getter — protected get ${key.split('\t')[1]}() { return ${key.split('\t')[1]}.Class; } — and read it through this.`,
    );
    failed = true;
  } else if (keySites.length > maximum) {
    console.error(
      `CONVENTIONS FAIL: effect seam — ${key} rose to ${keySites.length} bare site(s), above its baseline of ${maximum}`,
    );
    failed = true;
  }
}
for (const [key, maximum] of [...baseline].sort()) {
  const count = observed.get(key)?.length ?? 0;
  if (count < maximum) {
    console.log(
      `effect seam: ${key} is tightenable — ${count} bare site(s), baseline ${maximum}`,
    );
  }
}
console.log(
  `effect seam: ${effectfulNamespaces.size} effectful of ${capabilityFileCount} capability namespaces; ${sites.length} bare site(s) across ${observed.size} file/namespace pair(s)`,
);
if (failed) process.exit(1);
