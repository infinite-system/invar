// census-488-imports.ts — the IMPORT arm of the core-to-plugin coupling census (#488).
//
// What it finds out: every import in a CORE source file that resolves into a PLUGIN-tier
// module folder. Plugin tier = the modules whose contributors DefaultPlugins.ts registers,
// plus `agent` (a pending plugin, #356). Core = every other module folder, plus src/main.ts.
// Inside src/modules/plugins/, the Extensions* files are plugin-owned; DefaultPlugins.ts is
// the sanctioned composition root and is reported under its own SANCTIONED heading.
//
// How to run it (from the repo root):
//   bun .invar/tasks/in-progress/488-core-to-plugin-coupling-census/census-488-imports.ts
//
// How to read the output: one line per offending import — `file:line  ->  <module>  (<kind>)`
// where kind is `type-only` (erased at runtime) or `value` (a runtime dependency). The final
// count is the number of core-to-plugin import LINES outside the sanctioned composition root.
// A rise in that count means new coupling; zero means the import arm is clean.
//
// Both arms are proven inside the run:
//   POSITIVE control — the sanctioned composition root imports AgentPlugin. The scanner must find
//     it even after the original Bootstrap coupling is removed.
//   NEGATIVE control — core files import the `vue` PACKAGE; the scanner must see those lines
//     and stay silent about them (the package is not src/modules/vue). If it cannot tell the
//     two apart, it exits 1.
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const repositoryRoot = process.cwd();
const modulesRoot = join(repositoryRoot, 'src/modules');

const pluginModules = new Set([
  'filetree',
  'git',
  'markdown',
  'lsp',
  'vue',
  'database',
  'media',
  'terminal',
  'inline-rewrite',
  'editor',
  'structure',
  'tasks-dashboard',
  'monitoring',
]);
const pendingPluginModules = new Set(['agent']); // #356 makes the agent pane a plugin
const pluginOwnedFilesInPluginsModule = new Set([
  'ExtensionsPlugin.ts',
  'ExtensionsPaneContent.ts',
]);
const sanctionedCompositionFiles = new Set([
  'src/modules/plugins/DefaultPlugins.ts',
]);

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

function moduleFolderOf(absolutePath: string): string | null {
  if (!absolutePath.startsWith(modulesRoot + '/')) return null;
  return absolutePath.slice(modulesRoot.length + 1).split('/')[0] ?? null;
}

function isCoreFile(absolutePath: string): boolean {
  const moduleFolder = moduleFolderOf(absolutePath);
  if (moduleFolder === null)
    return absolutePath === join(repositoryRoot, 'src/main.ts');
  if (pluginModules.has(moduleFolder) || pendingPluginModules.has(moduleFolder))
    return false;
  if (moduleFolder === 'plugins') {
    const baseName = absolutePath.split('/').pop()!;
    if (pluginOwnedFilesInPluginsModule.has(baseName)) return false;
  }
  return true;
}

interface ImportFinding {
  file: string;
  line: number;
  specifier: string;
  targetModule: string;
  typeOnly: boolean;
  sanctioned: boolean;
}

const findings: ImportFinding[] = [];
let vuePackageImportLinesSeen = 0;

const allFiles = [
  ...walkTypescriptFiles(modulesRoot),
  join(repositoryRoot, 'src/main.ts'),
];
for (const filePath of allFiles) {
  if (!isCoreFile(filePath)) continue;
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const relativeFile = filePath.slice(repositoryRoot.length + 1);
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (specifier === 'vue') vuePackageImportLinesSeen += 1;
      if (specifier.startsWith('.')) {
        const resolvedTarget = resolve(dirname(filePath), specifier);
        const targetModule = moduleFolderOf(resolvedTarget);
        if (
          targetModule !== null &&
          (pluginModules.has(targetModule) ||
            pendingPluginModules.has(targetModule))
        ) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          findings.push({
            file: relativeFile,
            line: line + 1,
            specifier,
            targetModule,
            typeOnly: node.importClause?.isTypeOnly ?? false,
            sanctioned: sanctionedCompositionFiles.has(relativeFile),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const sanctioned = findings.filter((finding) => finding.sanctioned);
const offending = findings.filter((finding) => !finding.sanctioned);

console.log('== SANCTIONED (composition root, by design) ==');
for (const finding of sanctioned) {
  console.log(
    `${finding.file}:${finding.line}  ->  ${finding.targetModule}  (${finding.typeOnly ? 'type-only' : 'value'})`,
  );
}
console.log(`sanctioned count: ${sanctioned.length}`);
console.log('');
console.log('== CORE-TO-PLUGIN IMPORTS (the findings) ==');
for (const finding of offending.sort(
  (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
)) {
  console.log(
    `${finding.file}:${finding.line}  ->  ${finding.targetModule}  via '${finding.specifier}'  (${finding.typeOnly ? 'type-only' : 'value'})`,
  );
}
console.log(`offending count: ${offending.length}`);

// POSITIVE control: the composition root must remain visible to the scanner.
const seedFound = sanctioned.some(
  (finding) =>
    finding.file === 'src/modules/plugins/DefaultPlugins.ts' &&
    finding.specifier === '../agent/AgentPlugin',
);
if (!seedFound) {
  console.error(
    'POSITIVE CONTROL FAILED: DefaultPlugins.ts -> ../agent/AgentPlugin was not found.',
  );
  process.exit(1);
}
// NEGATIVE control: `vue` package imports were seen but never reported as module hits.
const vuePackageMisfire = findings.some(
  (finding) => finding.specifier === 'vue',
);
if (vuePackageImportLinesSeen === 0 || vuePackageMisfire) {
  console.error(
    `NEGATIVE CONTROL FAILED: vue package imports seen=${vuePackageImportLinesSeen}, misfired=${vuePackageMisfire}.`,
  );
  process.exit(1);
}
console.log('');
console.log(
  `controls: positive OK (composition import found), negative OK (${vuePackageImportLinesSeen} vue-package import lines seen, zero reported)`,
);
