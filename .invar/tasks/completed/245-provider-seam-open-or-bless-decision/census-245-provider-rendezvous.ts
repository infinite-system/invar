// This script counts structural provider rendezvous mechanisms in production modules.
// Run `bun .invar/tasks/active/245-provider-seam-open-or-bless-decision/census-245-provider-rendezvous.ts --require-one`.
// A total of one means every migrated provider meets through the one host registry. A larger
// total names a duplicate registry, a host contribution scan, or cross-module construction.
// The built-in positive control must find all four known shapes before the repository is scanned.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';

type FindingKind =
  | 'host-registry'
  | 'legacy-registry'
  | 'host-contribution-scan'
  | 'cross-module-construction';

type Finding = {
  kind: FindingKind;
  file: string;
  line: number;
  detail: string;
};

const productionRoot = 'src/modules';

function collectTypeScriptFiles(root: string, files: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      collectTypeScriptFiles(path, files);
    } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
      files.push(path);
    }
  }
  return files;
}

function declarationName(
  declaration: ts.ClassDeclaration | ts.ClassExpression,
): string {
  return declaration.name?.text ?? '<anonymous class>';
}

function methodNames(
  declaration: ts.ClassDeclaration | ts.ClassExpression,
): Set<string> {
  return new Set(
    declaration.members
      .filter(ts.isMethodDeclaration)
      .map((member) =>
        ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
          ? member.name.text
          : '',
      )
      .filter(Boolean),
  );
}

function topModuleName(file: string): string | null {
  const pathParts = relative(productionRoot, file).split(sep);
  return pathParts.length > 1 ? pathParts[0] : null;
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function scanSource(file: string, sourceText: string): Finding[] {
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const findings: Finding[] = [];
  const importedModules = new Map<string, string>();
  let importsLocalInterface = false;

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const moduleSpecifier = statement.moduleSpecifier.text;
    if (
      moduleSpecifier.startsWith('.') &&
      moduleSpecifier.endsWith('.interface')
    ) {
      importsLocalInterface = true;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        importedModules.set(element.name.text, moduleSpecifier);
      }
    }
  }

  const currentTopModule = topModuleName(file);
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const names = methodNames(node);
      if (names.has('register') && names.has('resolve')) {
        findings.push({
          kind: 'host-registry',
          file,
          line: lineOf(source, node),
          detail: declarationName(node),
        });
      } else if (
        names.has('register') &&
        (names.has('sourceFor') || names.has('providerFor'))
      ) {
        findings.push({
          kind: 'legacy-registry',
          file,
          line: lineOf(source, node),
          detail: declarationName(node),
        });
      }
    }

    if (
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'provider' &&
      node.body
    ) {
      let scansContributionProviders = false;
      const inspectBody = (bodyNode: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(bodyNode) &&
          bodyNode.name.text === 'find' &&
          ts.isPropertyAccessExpression(bodyNode.expression) &&
          bodyNode.expression.name.text === 'providers'
        ) {
          scansContributionProviders = true;
        }
        ts.forEachChild(bodyNode, inspectBody);
      };
      inspectBody(node.body);
      if (scansContributionProviders) {
        findings.push({
          kind: 'host-contribution-scan',
          file,
          line: lineOf(source, node),
          detail: 'provider() scans contribution.providers',
        });
      }
    }

    if (
      importsLocalInterface &&
      currentTopModule &&
      ts.isNewExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'Class' &&
      ts.isIdentifier(node.expression.expression)
    ) {
      const providerName = node.expression.expression.text;
      const providerModule = importedModules.get(providerName);
      if (
        providerName.endsWith('Provider') &&
        providerModule?.startsWith('../') &&
        !providerModule.startsWith(`../${currentTopModule}/`)
      ) {
        findings.push({
          kind: 'cross-module-construction',
          file,
          line: lineOf(source, node),
          detail: `new ${providerName}.Class from ${providerModule}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function provePositiveControl(): void {
  const fixtures = [
    scanSource(
      'src/modules/plugins/ProviderRegistry.ts',
      'class ProviderRegistry { register() {} resolve() {} }',
    ),
    scanSource(
      'src/modules/structure/StructureSources.ts',
      'class StructureSources { register() {} sourceFor() {} }',
    ),
    scanSource(
      'src/modules/workspace/Workspace.ts',
      'class Workspace { provider() { return this.contribution.providers.find(() => true); } }',
    ),
    scanSource(
      'src/modules/inline-rewrite/InlineRewriteContributor.ts',
      "import type { RewriteProvider } from './RewriteProvider.interface';\nimport { CodexRewriteProvider } from '../lsp/CodexRewriteProvider';\nnew CodexRewriteProvider.Class();",
    ),
  ].flat();
  const foundKinds = new Set(fixtures.map((finding) => finding.kind));
  const expectedKinds: FindingKind[] = [
    'host-registry',
    'legacy-registry',
    'host-contribution-scan',
    'cross-module-construction',
  ];
  const missingKinds = expectedKinds.filter((kind) => !foundKinds.has(kind));
  if (missingKinds.length > 0) {
    throw new Error(
      `Positive control failed to detect: ${missingKinds.join(', ')}`,
    );
  }
  console.log('positive control: 4 provider rendezvous shapes detected');
}

provePositiveControl();
const findings = collectTypeScriptFiles(productionRoot)
  .sort()
  .flatMap((file) => scanSource(file, readFileSync(file, 'utf8')));
for (const finding of findings) {
  console.log(
    `${finding.kind}  ${finding.file}:${finding.line}  ${finding.detail}`,
  );
}
console.log(`provider rendezvous total: ${findings.length}`);

if (process.argv.includes('--require-one') && findings.length !== 1) {
  console.error(
    `expected exactly one provider rendezvous, found ${findings.length}`,
  );
  process.exit(1);
}
