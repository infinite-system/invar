// census-488-vocabulary.ts — the VOCABULARY arm of the core-to-plugin coupling census (#488).
//
// What it finds out: every string literal in a CORE source file that names PLUGIN vocabulary —
// a command id a plugin registers, a plugin's contributor identifier, a pane kind, a label, or
// a category name. This catches the coupling the import census cannot see (ShortcutHelp.ts
// names 'git' with zero imports).
//
// How the terms are gathered (two channels, both from the plugins' OWN source, plus `agent`):
//   1. MECHANICAL harvest — parse every non-test file in each plugin folder and collect string
//      literals sitting in `identifier = '...'` declarations and in object properties named
//      id / kind / action / context. Of those, keep the plugin-shaped ones: dotted ids
//      ('git.togglePanel') and kebab ids ('file-tree'). Free-word kinds ('commit', 'file')
//      are dropped because they collide with ordinary core vocabulary.
//   2. CURATED terms — the single-word identifiers, pane kinds, and display labels that the
//      mechanical shape filter cannot keep without drowning in noise. Each is real plugin
//      vocabulary read from plugin source by hand (contributor identifiers, pane kinds,
//      display names). They are listed in `curatedTermsByPlugin` below with their provenance.
//
// The scan then walks every string literal in every CORE file (import specifiers excluded,
// test files excluded) and reports exact matches, plus PREFIX matches for command families
// ('git.', 'tree.', ...). Output: `file:line  'literal'  ->  plugin (channel)`. The count is
// the number of core literal SITES naming plugin vocabulary. Classification (which form, which
// seam removes it) is the report's job, not this script's.
//
// How to run it (from the repo root):
//   bun .invar/tasks/completed/488-core-to-plugin-coupling-census/census-488-vocabulary.ts
//
// Both arms are proven inside the run:
//   POSITIVE control — the out-of-scope 'Terminal' settings label must still be found in
//     SettingsPanel.ts, and the agent command family must be harvested from its plugin while
//     producing no core hit.
//   NEGATIVE control — 'media.showTorus' is registered by the media plugin and used by no core
//     file; it must be harvested yet produce zero core hits. A fabricated term
//     'no-such-plugin-term-488' must also produce zero hits. Either firing exits 1.
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = process.cwd();
const modulesRoot = join(repositoryRoot, 'src/modules');

const pluginModules = [
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
];
const pendingPluginModules = ['agent']; // #356 makes the agent pane a plugin
const pluginOwnedFilesInPluginsModule = [
  'ExtensionsPlugin.ts',
  'ExtensionsPaneContent.ts',
];

// Hand-read from plugin source: contributor identifiers, pane kinds, capability ids, and the
// display labels each plugin (or the agent module) owns. 'editor' has no single-word entry
// because 'editor' as a word is core vocabulary too; its kebab ids are harvested mechanically.
const curatedTermsByPlugin: Record<string, string[]> = {
  filetree: ['file-tree', 'Files'],
  git: ['git', 'Git', 'Source Control', 'Toggle Git Panel'],
  markdown: ['markdown', 'Markdown'],
  lsp: ['document-language-service'],
  vue: [],
  database: ['database', 'Database'],
  media: ['media', 'Media'],
  terminal: [
    'terminal',
    'Terminal',
    'terminal-commands',
    'terminal-observation',
  ],
  'inline-rewrite': ['inline-rewrite'],
  editor: ['source-text-editor'],
  structure: ['structure', 'Structure', 'structure-navigator'],
  'tasks-dashboard': ['tasks-dashboard', 'Tasks'],
  monitoring: ['monitoring', 'Monitoring'],
  extensions: ['extensions', 'Extensions'],
  agent: ['agent', 'Terminal (Agent)', 'terminal-agent', 'Agent'],
};

// Command-id family prefixes, each owned by the plugin (or pending plugin) that registers the
// family. 'view.show' is shared: each view.show* id is registered by its own plugin.
const commandFamilyPrefixes: Record<string, string> = {
  'git.': 'git',
  'tree.': 'filetree',
  'files.': 'filetree',
  'tasks.': 'tasks-dashboard',
  'structure.': 'structure',
  'database.': 'database',
  'media.': 'media',
  'markdown.': 'markdown',
  'inlineRewrite.': 'inline-rewrite',
  'monitoring.': 'monitoring',
  'agent.': 'agent',
  'terminal.': 'terminal',
};

const dottedIdShape = /^[a-zA-Z]+\.[a-zA-Z][a-zA-Z.]*$/;
const kebabIdShape = /^[a-z]+(-[a-z]+)+$/;
const harvestedPropertyNames = new Set(['id', 'kind', 'action', 'context']);

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

function parse(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

// ---- harvest phase --------------------------------------------------------
const termOwners = new Map<string, Set<string>>();
function addTerm(term: string, plugin: string, channel: string): void {
  const owners = termOwners.get(term) ?? new Set<string>();
  owners.add(`${plugin} (${channel})`);
  termOwners.set(term, owners);
}

function pluginFilesOf(plugin: string): string[] {
  if (plugin === 'extensions') {
    return pluginOwnedFilesInPluginsModule.map((name) =>
      join(modulesRoot, 'plugins', name),
    );
  }
  return walkTypescriptFiles(join(modulesRoot, plugin));
}

for (const plugin of [
  ...pluginModules,
  ...pendingPluginModules,
  'extensions',
]) {
  for (const filePath of pluginFilesOf(plugin)) {
    const sourceFile = parse(filePath);
    const visit = (node: ts.Node): void => {
      let harvested: string | null = null;
      if (
        ts.isPropertyDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'identifier' &&
        node.initializer !== undefined &&
        ts.isStringLiteral(node.initializer)
      ) {
        harvested = node.initializer.text;
      }
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        harvestedPropertyNames.has(node.name.text) &&
        ts.isStringLiteral(node.initializer)
      ) {
        harvested = node.initializer.text;
      }
      if (
        harvested !== null &&
        (dottedIdShape.test(harvested) || kebabIdShape.test(harvested))
      ) {
        addTerm(harvested, plugin, 'harvested');
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  for (const term of curatedTermsByPlugin[plugin] ?? [])
    addTerm(term, plugin, 'curated');
}

// ---- scan phase -----------------------------------------------------------
function isCoreFile(absolutePath: string): boolean {
  const relative = absolutePath.slice(modulesRoot.length + 1);
  const moduleFolder = relative.split('/')[0] ?? '';
  if (
    pluginModules.includes(moduleFolder) ||
    pendingPluginModules.includes(moduleFolder)
  )
    return false;
  if (
    moduleFolder === 'plugins' &&
    pluginOwnedFilesInPluginsModule.includes(relative.split('/').pop()!)
  )
    return false;
  return true;
}

interface VocabularyHit {
  file: string;
  line: number;
  literal: string;
  owners: string[];
}
const hits: VocabularyHit[] = [];

const coreFiles = [
  ...walkTypescriptFiles(modulesRoot).filter(isCoreFile),
  join(repositoryRoot, 'src/main.ts'),
];
for (const filePath of coreFiles) {
  const sourceFile = parse(filePath);
  const relativeFile = filePath.slice(repositoryRoot.length + 1);
  const visit = (node: ts.Node): void => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !(
        ts.isImportDeclaration(node.parent) ||
        ts.isExportDeclaration(node.parent)
      )
    ) {
      const literal = node.text;
      const owners = new Set<string>();
      for (const owner of termOwners.get(literal) ?? []) owners.add(owner);
      for (const [prefix, plugin] of Object.entries(commandFamilyPrefixes)) {
        if (literal.startsWith(prefix) && dottedIdShape.test(literal)) {
          owners.add(`${plugin} (family '${prefix}*')`);
        }
      }
      if (owners.size > 0) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        hits.push({
          file: relativeFile,
          line: line + 1,
          literal,
          owners: [...owners],
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
let currentFile = '';
for (const hit of hits) {
  if (hit.file !== currentFile) {
    currentFile = hit.file;
    console.log(`\n== ${hit.file} ==`);
  }
  console.log(`  ${hit.line}: '${hit.literal}'  ->  ${hit.owners.join('; ')}`);
}
console.log(
  `\ntotal core vocabulary sites: ${hits.length} across ${new Set(hits.map((hit) => hit.file)).size} files`,
);
console.log(`terms in the dictionary: ${termOwners.size}`);

// ---- controls -------------------------------------------------------------
const positiveOne = hits.some(
  (hit) =>
    hit.file.endsWith('settings/SettingsPanel.ts') &&
    hit.literal === 'Terminal',
);
const positiveTwo =
  termOwners.has('panel.toggleAgent') &&
  !hits.some((hit) => hit.literal === 'panel.toggleAgent');
if (!positiveOne || !positiveTwo) {
  console.error(
    `POSITIVE CONTROL FAILED: SettingsPanel Terminal label=${positiveOne}, agent command harvested and core-quiet=${positiveTwo}.`,
  );
  process.exit(1);
}
const negativeHarvested = termOwners.has('media.showTorus');
const negativeQuietOne = !hits.some((hit) => hit.literal === 'media.showTorus');
const negativeQuietTwo = !hits.some(
  (hit) => hit.literal === 'no-such-plugin-term-488',
);
if (!negativeHarvested || !negativeQuietOne || !negativeQuietTwo) {
  console.error(
    `NEGATIVE CONTROL FAILED: harvested=${negativeHarvested}, quietOne=${negativeQuietOne}, quietTwo=${negativeQuietTwo}.`,
  );
  process.exit(1);
}
console.log(
  "controls: positive OK (core hit and plugin-owned quiet term found), negative OK ('media.showTorus' harvested, zero core hits)",
);
