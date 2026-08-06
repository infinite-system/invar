// census-511-sync-call-sites.ts — the synchronous capability-call census for the
// inversion design (#511, M4 of the wave).
//
// What it finds out: every call SITE in non-test src/ code that invokes a
// synchronous-I/O method of the Files capability or the synchronous spawn surface
// of the Processes capability. These are the sites that would need an async (or
// cache-backed) conversion if the capability moved to a remote daemon over the
// channel protocol (docs/iv-channel-protocol.md). The count is the migration bill
// the inversion decision is priced on.
//
// How to run it (from the repo root):
//   bun .invar/tasks/in-progress/511-inversion-design-and-sync-census/census-511-sync-call-sites.ts
//
// How to read the output:
//   - "derived Files sync-I/O methods": the method set is DISCOVERED from Files.ts
//     (a static method is sync-I/O when its body references a node:fs *Sync import),
//     never hand-listed. Pure path-math methods (join, dirname, ...) touch no
//     filesystem and are excluded from the bill; their call count prints separately.
//   - one line per counted site: `file:line  receiver.method  [bucket]` where bucket
//     is the nearest enclosing function shape:
//       async        — enclosing function is already async: conversion is local
//       sync-function— enclosing function/method is sync: it and its callers ripple
//       getter       — enclosing is a get accessor: CANNOT become async; needs a
//                      cache-backed redesign (the expensive class)
//       constructor  — enclosing is a constructor: cannot await; needs pre-fetch
//       module-level — top-level statement
//   - per-module and per-bucket totals follow, then the total bill.
//   - a change in the totals means capability coupling moved: new sync sites raise
//     the inversion price, conversions to async/cache lower it.
//
// Both arms are proven inside the run:
//   POSITIVE control — Files.Class.read in src/modules/text/TextDocument.ts and
//     Processes.Class.spawn in src/modules/system/Clipboard.ts are known live sites;
//     the census must find both or it exits 1.
//   NEGATIVE control — src/modules/media/FfmpegVideoSource.ts calls a bare node:fs
//     `read(...)` (an identifier call, not a capability receiver). The census must
//     SEE at least one such sync-named non-capability call and count NONE of them,
//     or it exits 1. The capability seam files themselves (Files.ts, Processes.ts)
//     must contribute zero sites.
//   COMPLETENESS guard — every non-test file that value-imports the Files namespace
//     must show at least one counted sync site, pure-method call, or bare
//     Files.Class reference; an importer the receiver-matcher cannot explain is an
//     alias the census would silently miss, so any unexplained importer exits 1.
//     An importer with ZERO references to the Files identifier outside the import
//     line is a DEAD IMPORT: reported informationally (it is bycatch, not a census
//     hole — there is no access to miss).
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';

const repositoryRoot = process.cwd();
const modulesRoot = join(repositoryRoot, 'src/modules');
const filesCapabilityPath = join(modulesRoot, 'system/Files.ts');
const processesCapabilityPath = join(modulesRoot, 'system/Processes.ts');

function parse(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

// ---- 1. Derive the Files method sets from Files.ts itself (discovered, not listed).

const filesSource = parse(filesCapabilityPath);
const nodeFsSyncImports = new Set<string>();
const filesSyncIoMethods = new Set<string>();
const filesPureMethods = new Set<string>();

for (const statement of filesSource.statements) {
  if (
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === 'node:fs'
  ) {
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.name.text.endsWith('Sync')) {
          nodeFsSyncImports.add(element.name.text);
        }
      }
    }
  }
}

function bodyReferencesSyncImport(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(child) && nodeFsSyncImports.has(child.text)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

const filesClassDeclaration = filesSource.statements.find(
  (statement): statement is ts.ClassDeclaration =>
    ts.isClassDeclaration(statement) && statement.name?.text === '$Files',
);
if (!filesClassDeclaration) {
  console.error('CENSUS BROKEN: class $Files not found in Files.ts');
  process.exit(2);
}
for (const member of filesClassDeclaration.members) {
  const isStaticCallable =
    (ts.isMethodDeclaration(member) || ts.isGetAccessor(member)) &&
    (member.modifiers ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword,
    );
  if (!isStaticCallable || !member.name || !ts.isIdentifier(member.name))
    continue;
  const methodName = member.name.text;
  if (member.body && bodyReferencesSyncImport(member.body)) {
    filesSyncIoMethods.add(methodName);
  } else {
    filesPureMethods.add(methodName);
  }
}

// ---- 2. Derive the Processes sync surface: public static non-async methods.

const processesSource = parse(processesCapabilityPath);
const processesSyncMethods = new Set<string>();
const processesAsyncMethods = new Set<string>();
const processesClassDeclaration = processesSource.statements.find(
  (statement): statement is ts.ClassDeclaration =>
    ts.isClassDeclaration(statement) && statement.name?.text === '$Processes',
);
if (!processesClassDeclaration) {
  console.error('CENSUS BROKEN: class $Processes not found in Processes.ts');
  process.exit(2);
}
for (const member of processesClassDeclaration.members) {
  if (!ts.isMethodDeclaration(member) || !member.name) continue;
  if (!ts.isIdentifier(member.name)) continue;
  const modifiers = member.modifiers ?? [];
  const isStatic = modifiers.some(
    (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword,
  );
  const isProtected = modifiers.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  );
  if (!isStatic || isProtected) continue;
  const isAsync = modifiers.some(
    (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
  );
  (isAsync ? processesAsyncMethods : processesSyncMethods).add(
    member.name.text,
  );
}

// ---- 3. Walk every non-test source file and count receiver-matched call sites.

function walkTypescriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      found.push(...walkTypescriptFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      found.push(fullPath);
    }
  }
  return found;
}

function receiverTargetsCapability(
  receiverText: string,
  capabilityName: string,
): boolean {
  return (
    receiverText === `${capabilityName}.Class` ||
    receiverText === `${capabilityName}.$Class` ||
    receiverText.endsWith(`.${capabilityName}`)
  );
}

type EnclosingBucket =
  | 'async'
  | 'sync-function'
  | 'getter'
  | 'setter'
  | 'constructor'
  | 'module-level';

function classifyEnclosing(node: ts.Node): EnclosingBucket {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isGetAccessor(current)) return 'getter';
    if (ts.isSetAccessor(current)) return 'setter';
    if (ts.isConstructorDeclaration(current)) return 'constructor';
    if (
      ts.isMethodDeclaration(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ) {
      const isAsync = (current.modifiers ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
      );
      return isAsync ? 'async' : 'sync-function';
    }
    current = current.parent;
  }
  return 'module-level';
}

interface CensusSite {
  file: string;
  line: number;
  receiver: string;
  method: string;
  capability: 'Files' | 'Processes';
  bucket: EnclosingBucket;
}

const syncSites: CensusSite[] = [];
let filesPureCallCount = 0;
let bareSyncNamedCallsSeen = 0;
const filesCoveredFiles = new Set<string>();
const filesImporterFiles = new Set<string>();
const filesIdentifierReferenceFiles = new Set<string>();
const capabilitySeamFiles = new Set([
  filesCapabilityPath,
  processesCapabilityPath,
]);

const allSyncMethodNames = new Set([
  ...filesSyncIoMethods,
  ...processesSyncMethods,
]);

for (const filePath of walkTypescriptFiles(join(repositoryRoot, 'src'))) {
  if (capabilitySeamFiles.has(filePath)) continue;
  const sourceFile = parse(filePath);
  const relativeFile = filePath.slice(repositoryRoot.length + 1);
  const visit = (node: ts.Node): void => {
    // Track value-importers of the Files namespace for the completeness guard.
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith('.')
    ) {
      const resolvedTarget =
        resolve(dirname(filePath), node.moduleSpecifier.text) + '.ts';
      if (resolvedTarget === filesCapabilityPath) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        if (
          clause &&
          !clause.isTypeOnly &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.some(
            (element) => !element.isTypeOnly && element.name.text === 'Files',
          )
        ) {
          filesImporterFiles.add(relativeFile);
        }
      }
    }
    // Any Files identifier reference outside an import line separates a dead
    // import (no reference at all) from an alias the matcher failed to explain.
    if (
      ts.isIdentifier(node) &&
      node.text === 'Files' &&
      !ts.findAncestor(node, ts.isImportDeclaration)
    ) {
      filesIdentifierReferenceFiles.add(relativeFile);
    }
    // A bare Files.Class / Files.$Class reference explains an importer even
    // when the file only forwards the capability (late getters, injection).
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Files' &&
      (node.name.text === 'Class' || node.name.text === '$Class')
    ) {
      filesCoveredFiles.add(relativeFile);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const methodName = callee.name.text;
        const receiverText = callee.expression.getText(sourceFile);
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        if (receiverTargetsCapability(receiverText, 'Files')) {
          if (filesSyncIoMethods.has(methodName)) {
            syncSites.push({
              file: relativeFile,
              line: line + 1,
              receiver: receiverText,
              method: methodName,
              capability: 'Files',
              bucket: classifyEnclosing(node),
            });
            filesCoveredFiles.add(relativeFile);
          } else if (filesPureMethods.has(methodName)) {
            filesPureCallCount += 1;
            filesCoveredFiles.add(relativeFile);
          }
        } else if (receiverTargetsCapability(receiverText, 'Processes')) {
          if (processesSyncMethods.has(methodName)) {
            syncSites.push({
              file: relativeFile,
              line: line + 1,
              receiver: receiverText,
              method: methodName,
              capability: 'Processes',
              bucket: classifyEnclosing(node),
            });
          }
        } else if (allSyncMethodNames.has(methodName)) {
          bareSyncNamedCallsSeen += 1;
        }
      } else if (
        ts.isIdentifier(callee) &&
        allSyncMethodNames.has(callee.text)
      ) {
        bareSyncNamedCallsSeen += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

// ---- 4. Report.

const gitHead = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
});
const commit = gitHead.stdout.toString().trim();

console.log(`census-511 sync capability call sites @ commit ${commit}`);
console.log('');
console.log(
  `derived Files sync-I/O methods (${filesSyncIoMethods.size}): ${[...filesSyncIoMethods].sort().join(', ')}`,
);
console.log(
  `derived Files pure path methods (${filesPureMethods.size}, excluded from the bill): ${[...filesPureMethods].sort().join(', ')}`,
);
console.log(
  `derived Processes sync surface (${processesSyncMethods.size}): ${[...processesSyncMethods].sort().join(', ')}  (async already: ${[...processesAsyncMethods].sort().join(', ')})`,
);
console.log('');

console.log('== COUNTED SITES ==');
for (const site of syncSites.sort(
  (first, second) =>
    first.file.localeCompare(second.file) || first.line - second.line,
)) {
  console.log(
    `${site.file}:${site.line}  ${site.receiver}.${site.method}  [${site.bucket}]`,
  );
}
console.log('');

const byModule = new Map<string, number>();
const byBucket = new Map<EnclosingBucket, number>();
const byCapability = new Map<string, number>();
for (const site of syncSites) {
  const moduleName = site.file.startsWith('src/modules/')
    ? site.file.split('/')[2]!
    : basename(site.file);
  byModule.set(moduleName, (byModule.get(moduleName) ?? 0) + 1);
  byBucket.set(site.bucket, (byBucket.get(site.bucket) ?? 0) + 1);
  byCapability.set(
    site.capability,
    (byCapability.get(site.capability) ?? 0) + 1,
  );
}
console.log('== BY MODULE ==');
for (const [moduleName, count] of [...byModule].sort(
  (first, second) => second[1] - first[1],
)) {
  console.log(`${moduleName}: ${count}`);
}
console.log('');
console.log('== BY ENCLOSING SHAPE (the conversion bill) ==');
for (const [bucket, count] of [...byBucket].sort(
  (first, second) => second[1] - first[1],
)) {
  console.log(`${bucket}: ${count}`);
}
console.log('');
console.log('== TOTALS ==');
for (const [capability, count] of byCapability) {
  console.log(`${capability} sync sites: ${count}`);
}
console.log(`total sync capability call sites: ${syncSites.length}`);
console.log(
  `Files pure path-math calls (no I/O, no conversion needed): ${filesPureCallCount}`,
);
console.log(
  `files counted / files value-importing Files: ${filesCoveredFiles.size} / ${filesImporterFiles.size}`,
);
console.log('');

// ---- 5. Controls.

let controlFailures = 0;

const positiveFilesSite = syncSites.some(
  (site) =>
    site.file === 'src/modules/text/TextDocument.ts' &&
    site.capability === 'Files' &&
    site.method === 'read',
);
const positiveProcessesSite = syncSites.some(
  (site) =>
    site.file === 'src/modules/system/Clipboard.ts' &&
    site.capability === 'Processes' &&
    site.method === 'spawn',
);
if (!positiveFilesSite || !positiveProcessesSite) {
  console.error(
    `POSITIVE CONTROL FAILED: TextDocument Files.read found=${positiveFilesSite}, Clipboard Processes.spawn found=${positiveProcessesSite}`,
  );
  controlFailures += 1;
}

const seamFileCounted = syncSites.some(
  (site) =>
    site.file === 'src/modules/system/Files.ts' ||
    site.file === 'src/modules/system/Processes.ts',
);
if (bareSyncNamedCallsSeen === 0 || seamFileCounted) {
  console.error(
    `NEGATIVE CONTROL FAILED: bare sync-named non-capability calls seen=${bareSyncNamedCallsSeen} (must be > 0), seam files counted=${seamFileCounted} (must be false)`,
  );
  controlFailures += 1;
}

const uncoveredImporters = [...filesImporterFiles].filter(
  (file) => !filesCoveredFiles.has(file),
);
const deadImporters = uncoveredImporters.filter(
  (file) => !filesIdentifierReferenceFiles.has(file),
);
const unexplainedImporters = uncoveredImporters.filter((file) =>
  filesIdentifierReferenceFiles.has(file),
);
if (deadImporters.length > 0) {
  console.log(
    `dead Files imports (bycatch, nothing to miss): ${deadImporters.join(', ')}`,
  );
}
if (unexplainedImporters.length > 0) {
  console.error(
    `COMPLETENESS GUARD FAILED: ${unexplainedImporters.length} file(s) value-import and reference Files but show no recognized access (possible alias the census misses):`,
  );
  for (const file of unexplainedImporters) console.error(`  ${file}`);
  controlFailures += 1;
}

if (controlFailures > 0) process.exit(1);
console.log(
  `controls: positive OK (known Files.read + Processes.spawn sites found), negative OK (${bareSyncNamedCallsSeen} bare sync-named calls seen, zero counted; seam files contributed zero), completeness OK (every Files value-importer explained)`,
);
