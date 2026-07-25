#!/usr/bin/env bun

// The file grammar makes behavior structurally reachable through the eponymous class seam:
// imports → class/interface seam → exported types → end of file. This checker deliberately uses
// TypeScript's source-ordered statement list rather than text patterns. CONVERTED_MODULES is the
// phase-2 ratchet: each conversion wave appends its modules in the same commit that converts them.
// Listed modules fail on every violation and can never regress; unlisted modules remain report-only
// until their wave, with their per-module violation counts printed on every run. Contract-interface
// files are structurally declared by their *.interface.ts names and enforced in every module.
// invariant: Public classes use the namespace pattern (project.invariants.md)
// invariant: Construction goes through overridable seams (project.invariants.md)

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, relative, resolve } from 'node:path';
import * as typescript from 'typescript';

export type FileGrammarRule =
  | 'arrow-function-class-field'
  | 'class-file-order'
  | 'construction-bypass'
  | 'contract-interface-content'
  | 'contract-interface-file-name'
  | 'contract-interface-order'
  | 'eponymous-class'
  | 'eponymous-interface'
  | 'hash-private-field'
  | 'missing-colocated-test'
  | 'module-function'
  | 'module-variable'
  | 'namespace-manifest'
  | 'private-modifier'
  | 'test-colocation'
  | 'type-before-eponymous';

export interface FileGrammarViolation {
  fileName: string;
  line: number;
  column: number;
  rule: FileGrammarRule;
  message: string;
}

export interface FileGrammarInput {
  fileName: string;
  sourceText: string;
}

export interface FileGrammarInspectionOptions {
  testFileExists?: (projectRelativeFileName: string) => boolean;
}

export const CONVERTED_MODULES = new Set<string>([
  'diff',
  'editor',
  'git',
  'image',
  'lsp',
  'markdown',
  'syntax',
  'workspace',
]);

function normalizeFileName(fileName: string): string {
  return fileName.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isContractInterfaceFile(fileName: string): boolean {
  return normalizeFileName(fileName).endsWith('.interface.ts');
}

function eponymousNameFor(fileName: string): string {
  const fileBaseName = basename(fileName, extname(fileName));
  return fileBaseName.endsWith('.interface')
    ? fileBaseName.slice(0, -'.interface'.length)
    : fileBaseName;
}

function moduleNameFor(fileName: string): string {
  const pathParts = normalizeFileName(fileName).split('/');
  return pathParts[0] === 'src' && pathParts[1] === 'modules'
    ? (pathParts[2] ?? '(modules-root)')
    : '(outside-modules)';
}

function isTestFile(fileName: string): boolean {
  return (
    /\.test\.[cm]?tsx?$/.test(fileName) ||
    normalizeFileName(fileName).split('/').includes('__tests__')
  );
}

function isImportStatement(statement: typescript.Statement): boolean {
  return (
    typescript.isImportDeclaration(statement) ||
    typescript.isImportEqualsDeclaration(statement)
  );
}

function isTypeStatement(statement: typescript.Statement): boolean {
  return (
    typescript.isTypeAliasDeclaration(statement) ||
    typescript.isInterfaceDeclaration(statement)
  );
}

function hasModifier(
  node: typescript.Node,
  modifierKind: typescript.SyntaxKind,
): boolean {
  return (
    typescript.canHaveModifiers(node) &&
    (typescript
      .getModifiers(node)
      ?.some((modifier) => modifier.kind === modifierKind) ??
      false)
  );
}

function unwrapExpression(
  expression: typescript.Expression,
): typescript.Expression {
  let currentExpression = expression;
  while (
    typescript.isParenthesizedExpression(currentExpression) ||
    typescript.isAsExpression(currentExpression) ||
    typescript.isTypeAssertionExpression(currentExpression) ||
    typescript.isSatisfiesExpression(currentExpression) ||
    typescript.isNonNullExpression(currentExpression)
  ) {
    currentExpression = currentExpression.expression;
  }
  return currentExpression;
}

function isEponymousClass(
  statement: typescript.Statement,
  eponymousName: string,
): statement is typescript.ClassDeclaration {
  return (
    typescript.isClassDeclaration(statement) &&
    statement.name?.text === `$${eponymousName}` &&
    !hasModifier(statement, typescript.SyntaxKind.ExportKeyword)
  );
}

function isEponymousInterface(
  statement: typescript.Statement,
  eponymousName: string,
): statement is typescript.InterfaceDeclaration {
  return (
    typescript.isInterfaceDeclaration(statement) &&
    statement.name.text === eponymousName &&
    hasModifier(statement, typescript.SyntaxKind.ExportKeyword)
  );
}

function lineAndColumn(
  sourceFile: typescript.SourceFile,
  node: typescript.Node,
): { line: number; column: number } {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return { line: position.line + 1, column: position.character + 1 };
}

function createViolation(
  sourceFile: typescript.SourceFile,
  node: typescript.Node,
  rule: FileGrammarRule,
  message: string,
): FileGrammarViolation {
  return {
    fileName: normalizeFileName(sourceFile.fileName),
    ...lineAndColumn(sourceFile, node),
    rule,
    message,
  };
}

function createFileViolation(
  sourceFile: typescript.SourceFile,
  rule: FileGrammarRule,
  message: string,
): FileGrammarViolation {
  return {
    fileName: normalizeFileName(sourceFile.fileName),
    line: 1,
    column: 1,
    rule,
    message,
  };
}

function inspectClassMembers(
  sourceFile: typescript.SourceFile,
): FileGrammarViolation[] {
  const violations: FileGrammarViolation[] = [];

  function inspectNode(node: typescript.Node): void {
    if (hasModifier(node, typescript.SyntaxKind.PrivateKeyword)) {
      violations.push(
        createViolation(
          sourceFile,
          node,
          'private-modifier',
          'class members use protected as the overrideable floor; private is forbidden',
        ),
      );
    }

    if (
      (typescript.isPropertyDeclaration(node) ||
        typescript.isMethodDeclaration(node) ||
        typescript.isGetAccessorDeclaration(node) ||
        typescript.isSetAccessorDeclaration(node)) &&
      node.name !== undefined &&
      typescript.isPrivateIdentifier(node.name)
    ) {
      violations.push(
        createViolation(
          sourceFile,
          node,
          'hash-private-field',
          '#private members prevent subclass extension and are forbidden',
        ),
      );
    }

    if (
      typescript.isPropertyDeclaration(node) &&
      node.initializer !== undefined &&
      typescript.isArrowFunction(unwrapExpression(node.initializer))
    ) {
      violations.push(
        createViolation(
          sourceFile,
          node,
          'arrow-function-class-field',
          'class behavior must be a prototype method, not a per-instance arrow field',
        ),
      );
    }

    if (
      typescript.isNewExpression(node) &&
      ((typescript.isIdentifier(node.expression) &&
        node.expression.text.startsWith('$')) ||
        (typescript.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === '$Class'))
    ) {
      violations.push(
        createViolation(
          sourceFile,
          node,
          'construction-bypass',
          'construct through the live namespace Class seam, never the raw $Class form',
        ),
      );
    }

    typescript.forEachChild(node, inspectNode);
  }

  inspectNode(sourceFile);
  return violations;
}

interface ManifestVariable {
  declaration: typescript.VariableDeclaration;
  statement: typescript.VariableStatement;
}

function manifestVariable(
  namespaceBlock: typescript.ModuleBlock,
  variableName: string,
): ManifestVariable | undefined {
  for (const statement of namespaceBlock.statements) {
    if (!typescript.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        typescript.isIdentifier(declaration.name) &&
        declaration.name.text === variableName
      ) {
        return { declaration, statement };
      }
    }
  }
  return undefined;
}

function selectedClassTargetsRawClass(
  initializer: typescript.Expression,
  rawClassName: string,
): boolean {
  const allowedRawNames = new Set([rawClassName, '$Class']);
  const selectedExpression = unwrapExpression(initializer);
  if (typescript.isIdentifier(selectedExpression)) {
    return allowedRawNames.has(selectedExpression.text);
  }
  if (
    !typescript.isCallExpression(selectedExpression) ||
    !typescript.isIdentifier(selectedExpression.expression) ||
    !['Reactive', 'Static'].includes(selectedExpression.expression.text) ||
    selectedExpression.arguments.length !== 1
  ) {
    return false;
  }
  const rawArgument = unwrapExpression(selectedExpression.arguments[0]!);
  return (
    typescript.isIdentifier(rawArgument) &&
    allowedRawNames.has(rawArgument.text)
  );
}

function inspectNamespaceManifest(
  sourceFile: typescript.SourceFile,
  statement: typescript.Statement | undefined,
  eponymousName: string,
): FileGrammarViolation[] {
  const rawClassName = `$${eponymousName}`;
  if (
    statement === undefined ||
    !typescript.isModuleDeclaration(statement) ||
    !typescript.isIdentifier(statement.name) ||
    statement.name.text !== eponymousName ||
    !hasModifier(statement, typescript.SyntaxKind.ExportKeyword) ||
    statement.body === undefined ||
    !typescript.isModuleBlock(statement.body)
  ) {
    return [
      createViolation(
        sourceFile,
        statement ?? sourceFile,
        'namespace-manifest',
        `the eponymous class must be followed by export namespace ${eponymousName}`,
      ),
    ];
  }

  const violations: FileGrammarViolation[] = [];
  const rawClassVariable = manifestVariable(statement.body, '$Class');
  if (
    rawClassVariable?.declaration.initializer === undefined ||
    !hasModifier(
      rawClassVariable.statement,
      typescript.SyntaxKind.ExportKeyword,
    ) ||
    !typescript.isIdentifier(
      unwrapExpression(rawClassVariable.declaration.initializer),
    ) ||
    (
      unwrapExpression(
        rawClassVariable.declaration.initializer,
      ) as typescript.Identifier
    ).text !== rawClassName
  ) {
    violations.push(
      createViolation(
        sourceFile,
        rawClassVariable?.declaration ?? statement,
        'namespace-manifest',
        `namespace ${eponymousName} must export $Class = ${rawClassName}`,
      ),
    );
  }

  const selectedClassVariable = manifestVariable(statement.body, 'Class');
  if (
    selectedClassVariable?.declaration.initializer === undefined ||
    !hasModifier(
      selectedClassVariable.statement,
      typescript.SyntaxKind.ExportKeyword,
    ) ||
    !selectedClassTargetsRawClass(
      selectedClassVariable.declaration.initializer,
      rawClassName,
    )
  ) {
    violations.push(
      createViolation(
        sourceFile,
        selectedClassVariable?.declaration ?? statement,
        'namespace-manifest',
        `namespace ${eponymousName} must select ${rawClassName} through Static, Reactive, or the raw plain-class form`,
      ),
    );
  }

  for (const namespaceStatement of statement.body.statements) {
    const hasOnlyManifestVariables =
      typescript.isVariableStatement(namespaceStatement) &&
      namespaceStatement.declarationList.declarations.every(
        (declaration) =>
          typescript.isIdentifier(declaration.name) &&
          ['$Class', 'Class'].includes(declaration.name.text),
      );
    if (
      !hasOnlyManifestVariables &&
      !typescript.isTypeAliasDeclaration(namespaceStatement) &&
      !typescript.isInterfaceDeclaration(namespaceStatement)
    ) {
      violations.push(
        createViolation(
          sourceFile,
          namespaceStatement,
          'namespace-manifest',
          'the namespace is a construction/type manifest only; behavior belongs on the class',
        ),
      );
    }
  }
  return violations;
}

function inspectTopLevelBehavior(
  sourceFile: typescript.SourceFile,
): FileGrammarViolation[] {
  const violations: FileGrammarViolation[] = [];
  for (const statement of sourceFile.statements) {
    if (typescript.isFunctionDeclaration(statement)) {
      violations.push(
        createViolation(
          sourceFile,
          statement,
          'module-function',
          'module-level behavior must be a protected class method',
        ),
      );
    } else if (typescript.isVariableStatement(statement)) {
      violations.push(
        createViolation(
          sourceFile,
          statement,
          'module-variable',
          'module-level data or behavior must live on the eponymous class',
        ),
      );
    }
  }
  return violations;
}

function inspectContractInterfaceContent(
  sourceFile: typescript.SourceFile,
): FileGrammarViolation[] {
  const violations: FileGrammarViolation[] = [];
  for (const statement of sourceFile.statements) {
    if (
      typescript.isClassDeclaration(statement) ||
      typescript.isFunctionDeclaration(statement)
    ) {
      violations.push(
        createViolation(
          sourceFile,
          statement,
          'contract-interface-content',
          '*.interface.ts files may declare interfaces and type aliases, never classes or detached functions',
        ),
      );
    } else if (typescript.isVariableStatement(statement)) {
      violations.push(
        createViolation(
          sourceFile,
          statement,
          'module-variable',
          'module-level data or behavior does not belong in a contract-interface file',
        ),
      );
    }
  }
  return violations;
}

function isPureContractSource(sourceFile: typescript.SourceFile): boolean {
  const declarations = sourceFile.statements.filter(
    (statement) => !isImportStatement(statement),
  );
  return (
    declarations.length > 0 &&
    declarations.every((statement) => isTypeStatement(statement))
  );
}

function inspectClassFileGrammar(
  sourceFile: typescript.SourceFile,
  eponymousName: string,
): { hasEponymousClass: boolean; violations: FileGrammarViolation[] } {
  const statements = [...sourceFile.statements];
  let firstDeclarationIndex = 0;
  while (
    firstDeclarationIndex < statements.length &&
    isImportStatement(statements[firstDeclarationIndex]!)
  ) {
    firstDeclarationIndex++;
  }

  const eponymousClassIndex = statements.findIndex((statement) =>
    isEponymousClass(statement, eponymousName),
  );
  if (eponymousClassIndex < 0) {
    return {
      hasEponymousClass: false,
      violations: [
        createFileViolation(
          sourceFile,
          'eponymous-class',
          `class file must declare class $${eponymousName}`,
        ),
      ],
    };
  }

  const violations: FileGrammarViolation[] = [];
  if (eponymousClassIndex !== firstDeclarationIndex) {
    const firstDeclaration = statements[firstDeclarationIndex]!;
    violations.push(
      createViolation(
        sourceFile,
        firstDeclaration,
        'class-file-order',
        'the eponymous class must be the first declaration after imports',
      ),
    );
  }
  for (
    let statementIndex = firstDeclarationIndex;
    statementIndex < eponymousClassIndex;
    statementIndex++
  ) {
    const statement = statements[statementIndex]!;
    if (!isTypeStatement(statement)) continue;
    violations.push(
      createViolation(
        sourceFile,
        statement,
        'type-before-eponymous',
        'types belong below the eponymous class and namespace manifest',
      ),
    );
  }

  const namespaceIndex = eponymousClassIndex + 1;
  violations.push(
    ...inspectNamespaceManifest(
      sourceFile,
      statements[namespaceIndex],
      eponymousName,
    ),
  );

  const trailingStartIndex =
    statements[namespaceIndex] !== undefined &&
    typescript.isModuleDeclaration(statements[namespaceIndex]!)
      ? namespaceIndex + 1
      : namespaceIndex;
  for (
    let statementIndex = trailingStartIndex;
    statementIndex < statements.length;
    statementIndex++
  ) {
    const statement = statements[statementIndex]!;
    if (
      isTypeStatement(statement) ||
      typescript.isFunctionDeclaration(statement) ||
      typescript.isVariableStatement(statement)
    ) {
      continue;
    }
    violations.push(
      createViolation(
        sourceFile,
        statement,
        'class-file-order',
        'only exported type aliases and interfaces may follow the namespace manifest',
      ),
    );
  }

  return { hasEponymousClass: true, violations };
}

function inspectContractInterfaceGrammar(
  sourceFile: typescript.SourceFile,
  eponymousName: string,
): FileGrammarViolation[] {
  const statements = [...sourceFile.statements];
  let firstDeclarationIndex = 0;
  while (
    firstDeclarationIndex < statements.length &&
    isImportStatement(statements[firstDeclarationIndex]!)
  ) {
    firstDeclarationIndex++;
  }

  const eponymousInterfaceIndex = statements.findIndex((statement) =>
    isEponymousInterface(statement, eponymousName),
  );
  if (eponymousInterfaceIndex < 0) {
    return [
      createFileViolation(
        sourceFile,
        'eponymous-interface',
        `contract-interface file must declare export interface ${eponymousName}`,
      ),
    ];
  }

  const violations: FileGrammarViolation[] = [];
  if (eponymousInterfaceIndex !== firstDeclarationIndex) {
    const firstDeclaration = statements[firstDeclarationIndex]!;
    violations.push(
      createViolation(
        sourceFile,
        firstDeclaration,
        'contract-interface-order',
        'the eponymous contract interface must be the first declaration after imports',
      ),
    );
  }
  for (
    let statementIndex = firstDeclarationIndex;
    statementIndex < eponymousInterfaceIndex;
    statementIndex++
  ) {
    const statement = statements[statementIndex]!;
    if (!isTypeStatement(statement)) continue;
    violations.push(
      createViolation(
        sourceFile,
        statement,
        'type-before-eponymous',
        'supporting types belong below the eponymous contract interface',
      ),
    );
  }

  for (
    let statementIndex = eponymousInterfaceIndex + 1;
    statementIndex < statements.length;
    statementIndex++
  ) {
    const statement = statements[statementIndex]!;
    if (
      isTypeStatement(statement) ||
      typescript.isClassDeclaration(statement) ||
      typescript.isFunctionDeclaration(statement) ||
      typescript.isVariableStatement(statement)
    ) {
      continue;
    }
    violations.push(
      createViolation(
        sourceFile,
        statement,
        'contract-interface-order',
        'only exported type aliases and interfaces may follow the eponymous contract interface',
      ),
    );
  }
  return violations;
}

function inspectSource(file: FileGrammarInput): {
  hasEponymousClass: boolean;
  violations: FileGrammarViolation[];
} {
  const fileName = normalizeFileName(file.fileName);
  const sourceFile = typescript.createSourceFile(
    fileName,
    file.sourceText,
    typescript.ScriptTarget.Latest,
    true,
    typescript.ScriptKind.TS,
  );

  if (isTestFile(fileName)) {
    return { hasEponymousClass: false, violations: [] };
  }

  const violations = [...inspectClassMembers(sourceFile)];
  const eponymousName = eponymousNameFor(fileName);
  if (isContractInterfaceFile(fileName)) {
    violations.push(...inspectContractInterfaceContent(sourceFile));
    violations.push(
      ...inspectContractInterfaceGrammar(sourceFile, eponymousName),
    );
    return { hasEponymousClass: false, violations };
  }

  if (isPureContractSource(sourceFile)) {
    violations.push(
      createFileViolation(
        sourceFile,
        'contract-interface-file-name',
        `type-only contract file should be named ${eponymousName}.interface.ts so its shape is structurally declared`,
      ),
    );
    return { hasEponymousClass: false, violations };
  }

  violations.push(...inspectTopLevelBehavior(sourceFile));
  const grammarResult = inspectClassFileGrammar(sourceFile, eponymousName);
  violations.push(...grammarResult.violations);
  return { hasEponymousClass: grammarResult.hasEponymousClass, violations };
}

export function inspectFileGrammar(
  files: readonly FileGrammarInput[],
  options: FileGrammarInspectionOptions = {},
): FileGrammarViolation[] {
  const normalizedFiles = files.map((file) => ({
    fileName: normalizeFileName(file.fileName),
    sourceText: file.sourceText,
  }));
  const suppliedFileNames = new Set(
    normalizedFiles.map((file) => file.fileName),
  );
  const testFileExists =
    options.testFileExists ??
    ((fileName: string) => suppliedFileNames.has(fileName));
  const violations: FileGrammarViolation[] = [];

  for (const file of normalizedFiles) {
    if (file.fileName.split('/').includes('__tests__')) {
      violations.push({
        fileName: file.fileName,
        line: 1,
        column: 1,
        rule: 'test-colocation',
        message:
          'tests and test support files must be colocated beside their source',
      });
    }

    const sourceResult = inspectSource(file);
    violations.push(...sourceResult.violations);
    if (
      !sourceResult.hasEponymousClass ||
      isContractInterfaceFile(file.fileName)
    ) {
      continue;
    }

    const sourceExtension = extname(file.fileName);
    const expectedTestFileName =
      file.fileName.slice(0, -sourceExtension.length) +
      `.test${sourceExtension}`;
    if (!testFileExists(expectedTestFileName)) {
      violations.push({
        fileName: file.fileName,
        line: 1,
        column: 1,
        rule: 'missing-colocated-test',
        message: `eponymous class requires colocated test ${basename(expectedTestFileName)}`,
      });
    }
  }

  violations.sort(
    (left, right) =>
      left.fileName.localeCompare(right.fileName) ||
      left.line - right.line ||
      left.column - right.column ||
      left.rule.localeCompare(right.rule),
  );
  return violations;
}

function collectTypeScriptFiles(absolutePath: string): string[] {
  if (!existsSync(absolutePath)) return [];
  const directoryEntries = readdirSync(absolutePath, { withFileTypes: true });
  const fileNames: string[] = [];
  for (const directoryEntry of directoryEntries) {
    const entryPath = resolve(absolutePath, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      fileNames.push(...collectTypeScriptFiles(entryPath));
    } else if (
      directoryEntry.isFile() &&
      /\.tsx?$/.test(directoryEntry.name) &&
      !directoryEntry.name.endsWith('.d.ts')
    ) {
      fileNames.push(entryPath);
    }
  }
  return fileNames;
}

function filesForArguments(
  projectRoot: string,
  arguments_: readonly string[],
): string[] {
  const requestedPaths = arguments_.length > 0 ? arguments_ : ['src/modules'];
  const fileNames = new Set<string>();
  for (const requestedPath of requestedPaths) {
    const absolutePath = resolve(projectRoot, requestedPath);
    if (!existsSync(absolutePath)) {
      process.stderr.write(
        `check-file-grammar: path does not exist: ${requestedPath}\n`,
      );
      process.exit(2);
    }
    if (/\.tsx?$/.test(absolutePath)) {
      fileNames.add(absolutePath);
      continue;
    }
    for (const fileName of collectTypeScriptFiles(absolutePath))
      fileNames.add(fileName);
  }
  return [...fileNames].sort();
}

interface FileGrammarEnforcementResult {
  enforcedViolations: FileGrammarViolation[];
  reportedViolations: FileGrammarViolation[];
}

function isEnforcedViolation(violation: FileGrammarViolation): boolean {
  return (
    violation.rule !== 'contract-interface-file-name' &&
    (isContractInterfaceFile(violation.fileName) ||
      CONVERTED_MODULES.has(moduleNameFor(violation.fileName)))
  );
}

function enforceConvertedModules(
  violations: readonly FileGrammarViolation[],
): FileGrammarEnforcementResult {
  const enforcedViolations: FileGrammarViolation[] = [];
  const reportedViolations: FileGrammarViolation[] = [];
  for (const violation of violations) {
    const violationCollection = isEnforcedViolation(violation)
      ? enforcedViolations
      : reportedViolations;
    violationCollection.push(violation);
  }
  return { enforcedViolations, reportedViolations };
}

function printEnforcedViolations(
  violations: readonly FileGrammarViolation[],
): void {
  for (const violation of violations) {
    process.stderr.write(
      `${violation.fileName}:${violation.line}:${violation.column}: ` +
        `[${violation.rule}] ${violation.message}\n`,
    );
  }
}

function printReportedSuggestions(
  violations: readonly FileGrammarViolation[],
): void {
  for (const violation of violations) {
    if (violation.rule !== 'contract-interface-file-name') continue;
    process.stdout.write(
      `${violation.fileName}:${violation.line}:${violation.column}: ` +
        `suggestion: ${violation.message}\n`,
    );
  }
}

function printViolationCountTable(
  violations: readonly FileGrammarViolation[],
): void {
  const violationCountsByModuleAndEnforcement = new Map<string, number>();
  for (const violation of violations) {
    const moduleName = moduleNameFor(violation.fileName);
    const enforcement = isEnforcedViolation(violation)
      ? 'enforced'
      : 'reported';
    const countKey = `${moduleName}\t${enforcement}`;
    violationCountsByModuleAndEnforcement.set(
      countKey,
      (violationCountsByModuleAndEnforcement.get(countKey) ?? 0) + 1,
    );
  }
  process.stdout.write('file-grammar violations by module:\n');
  process.stdout.write('module\tenforcement\tviolations\n');
  for (const [countKey, violationCount] of [
    ...violationCountsByModuleAndEnforcement,
  ].sort()) {
    process.stdout.write(`${countKey}\t${violationCount}\n`);
  }
  if (violationCountsByModuleAndEnforcement.size === 0)
    process.stdout.write('(none)\t-\t0\n');
}

if (import.meta.main) {
  const projectRoot = process.cwd();
  const fileNames = filesForArguments(projectRoot, process.argv.slice(2));
  const files = fileNames.map((fileName) => ({
    fileName: relative(projectRoot, fileName),
    sourceText: readFileSync(fileName, 'utf8'),
  }));
  const violations = inspectFileGrammar(files, {
    testFileExists: (fileName) => existsSync(resolve(projectRoot, fileName)),
  });
  const enforcementResult = enforceConvertedModules(violations);

  printViolationCountTable(violations);
  printReportedSuggestions(enforcementResult.reportedViolations);

  if (enforcementResult.enforcedViolations.length > 0) {
    printEnforcedViolations(enforcementResult.enforcedViolations);
    process.stderr.write(
      `check-file-grammar: ${enforcementResult.enforcedViolations.length} ` +
        `enforced violation(s); ${enforcementResult.reportedViolations.length} ` +
        'legacy violation(s) reported\n',
    );
    process.exit(1);
  }

  process.stdout.write(
    `check-file-grammar: PASS (${files.length} TypeScript file(s), ` +
      `${enforcementResult.reportedViolations.length} legacy violation(s) reported, ` +
      `${CONVERTED_MODULES.size} converted module(s) enforced, ` +
      `${files.filter((file) => isContractInterfaceFile(file.fileName)).length} ` +
      'structural interface test-pair exemption(s))\n',
  );
}
