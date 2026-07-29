// One-off structural census for #222 (provider-seam analysis). Parse, do not grep.
// Modes:
//   bun census-222.ts getters            — every accessor whose body is `return X.Class` (the seam pattern)
//   bun census-222.ts uses <Namespace>   — external files that touch `<Namespace>.` , direct vs via a local getter
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv[2];
const target = process.argv[3];
const includeTests = process.argv.includes('--tests');

function collect(root: string, out: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (
      full.endsWith('.ts') &&
      (includeTests || !full.endsWith('.test.ts'))
    )
      out.push(full);
  }
  return out;
}

const files = collect('src/modules').sort();

/** `return X.Class;` — the late-dependency getter body. Returns X, or null. */
function seamGetterNamespace(node: ts.Node): string | null {
  if (!ts.isGetAccessorDeclaration(node) || !node.body) return null;
  const statements = node.body.statements;
  if (statements.length !== 1) return null;
  const only = statements[0];
  if (!ts.isReturnStatement(only) || !only.expression) return null;
  const returned = only.expression;
  if (!ts.isPropertyAccessExpression(returned)) return null;
  if (returned.name.text !== 'Class' && returned.name.text !== '$Class')
    return null;
  if (!ts.isIdentifier(returned.expression)) return null;
  return returned.expression.text;
}

/** `X.<member>` where X is the queried namespace identifier. */
function namespaceAccess(node: ts.Node, namespaceName: string): string | null {
  if (!ts.isPropertyAccessExpression(node)) return null;
  if (!ts.isIdentifier(node.expression)) return null;
  if (node.expression.text !== namespaceName) return null;
  return `${namespaceName}.${node.name.text}`;
}

/** MODE `classify` — apply the effect criterion structurally to every namespace file in the
 *  given roots. EFFECTFUL iff the module imports a `node:*` builtin OR reads one of the ambient
 *  capability globals (process, Bun, Date, performance, globalThis) OR imports another namespace
 *  already classified effectful in the same roots. Otherwise PURE. */
function classifyRoots(roots: string[]): void {
  const ambientGlobals = new Set([
    'process',
    'Bun',
    'Date',
    'performance',
    'globalThis',
  ]);
  const subjects = roots
    .flatMap((root) => collect(root))
    .filter(
      (file) => !file.endsWith('.test.ts') && !file.endsWith('.interface.ts'),
    );
  type Fact = { builtins: string[]; globals: string[]; siblings: string[] };
  const factsByFile = new Map<string, Fact>();
  for (const file of subjects) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const builtins: string[] = [];
    const globals: string[] = [];
    const siblings: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith('node:')) builtins.push(specifier);
        else if (specifier.startsWith('./') || specifier.startsWith('../'))
          siblings.push(specifier.replace(/^.*\//, ''));
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ambientGlobals.has(node.expression.text)
      ) {
        globals.push(`${node.expression.text}.${node.name.text}`);
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ambientGlobals.has(node.expression.text)
      ) {
        globals.push(`new ${node.expression.text}()`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    factsByFile.set(file, {
      builtins: [...new Set(builtins)],
      globals: [...new Set(globals)],
      siblings: [...new Set(siblings)],
    });
  }
  const nameOf = (file: string) =>
    file.replace(/^.*\//, '').replace(/\.ts$/, '');
  const direct = new Map<string, boolean>();
  for (const [file, fact] of factsByFile)
    direct.set(
      nameOf(file),
      fact.builtins.length > 0 || fact.globals.length > 0,
    );
  // one transitive pass: a sibling that is effectful makes its importer effectful
  const effectful = new Map(direct);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [file, fact] of factsByFile) {
      const name = nameOf(file);
      if (effectful.get(name)) continue;
      if (fact.siblings.some((sibling) => effectful.get(sibling))) {
        effectful.set(name, true);
        changed = true;
      }
    }
  }
  for (const [file, fact] of [...factsByFile].sort()) {
    const name = nameOf(file);
    const verdict = effectful.get(name) ? 'EFFECTFUL' : 'PURE     ';
    const why = [
      ...fact.builtins.map((builtin) => `import ${builtin}`),
      ...fact.globals,
      ...fact.siblings
        .filter((sibling) => direct.get(sibling) || effectful.get(sibling))
        .map((s) => `via ${s}`),
    ];
    console.log(
      `${verdict}  ${file}  ${why.length ? why.join(', ') : '(no ambient capability)'}`,
    );
  }
}

/** MODE `sites` — every bare `X.member` access outside the defining file, with the enclosing
 *  container: a class member (instance or static) can hold a seam getter; anything else cannot
 *  without restructuring, so it is the real migration hazard. */
function reportSites(namespaceName: string): void {
  let insideInstanceMember = 0;
  let insideStaticMember = 0;
  let outsideAnyClass = 0;
  for (const file of files) {
    if (file.endsWith(`/${namespaceName}.ts`)) continue;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (namespaceAccess(node, namespaceName) !== null) {
        let ancestor: ts.Node | undefined = node.parent;
        let container = 'module level';
        while (ancestor !== undefined) {
          if (seamGetterNamespace(ancestor) === namespaceName) {
            container = 'own seam getter';
            break;
          }
          if (
            ts.isMethodDeclaration(ancestor) ||
            ts.isGetAccessorDeclaration(ancestor) ||
            ts.isSetAccessorDeclaration(ancestor) ||
            ts.isPropertyDeclaration(ancestor) ||
            ts.isConstructorDeclaration(ancestor)
          ) {
            const isStatic =
              (ts.getCombinedModifierFlags(ancestor as ts.Declaration) &
                ts.ModifierFlags.Static) !==
              0;
            container = isStatic ? 'static member' : 'instance member';
            break;
          }
          ancestor = ancestor.parent;
        }
        if (container === 'own seam getter') {
          /* already wrapped */
        } else if (container === 'instance member') insideInstanceMember += 1;
        else if (container === 'static member') insideStaticMember += 1;
        else {
          outsideAnyClass += 1;
          const line =
            source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          console.log(`  MODULE-LEVEL  ${file}:${line}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  console.log(
    `${namespaceName}: instance-member sites=${insideInstanceMember}  static-member sites=${insideStaticMember}  module-level sites=${outsideAnyClass}`,
  );
}

if (mode === 'sites') {
  reportSites(target);
} else if (mode === 'classify') {
  classifyRoots(process.argv.slice(3).filter((a) => !a.startsWith('--')));
} else if (mode === 'getters') {
  const rows: string[] = [];
  const perNamespace = new Map<string, number>();
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      const namespaceName = seamGetterNamespace(node);
      if (namespaceName !== null) {
        const line =
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const accessorName = ts.isIdentifier(
          (node as ts.GetAccessorDeclaration).name,
        )
          ? ((node as ts.GetAccessorDeclaration).name as ts.Identifier).text
          : '<computed>';
        rows.push(`${file}:${line}  get ${accessorName} -> ${namespaceName}`);
        perNamespace.set(
          namespaceName,
          (perNamespace.get(namespaceName) ?? 0) + 1,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const row of rows) console.log(row);
  console.log(`\ntotal seam getters: ${rows.length}`);
  console.log('per namespace:');
  for (const [namespaceName, count] of [...perNamespace].sort(
    (a, b) => b[1] - a[1],
  ))
    console.log(`  ${namespaceName}\t${count}`);
} else if (mode === 'uses') {
  const namespaceName = target;
  let directFiles = 0;
  let getterFiles = 0;
  const rows: string[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    let accesses = 0;
    let declaresGetter = false;
    let accessesInsideOwnGetter = 0;
    const visit = (node: ts.Node): void => {
      if (seamGetterNamespace(node) === namespaceName) {
        declaresGetter = true;
        accessesInsideOwnGetter += 1;
      }
      if (namespaceAccess(node, namespaceName) !== null) accesses += 1;
      ts.forEachChild(node, visit);
    };
    visit(source);
    // the defining file publishes the namespace; skip it
    if (file.endsWith(`/${namespaceName}.ts`)) continue;
    if (accesses === 0) continue;
    const bare = accesses - accessesInsideOwnGetter;
    rows.push(
      `${file}\ttotal=${accesses}\tviaOwnGetter=${accessesInsideOwnGetter}\tbare=${bare}`,
    );
    if (declaresGetter) getterFiles += 1;
    if (bare > 0) directFiles += 1;
  }
  for (const row of rows) console.log(row);
  console.log(
    `\n${namespaceName}: ${rows.length} external file(s); ${getterFiles} declare a seam getter; ${directFiles} touch it bare`,
  );
} else {
  console.error(
    'usage: bun census-222.ts <getters|uses> [Namespace] [--tests]',
  );
  process.exit(2);
}
