// The TypeScript source refinement for LSP document symbols. The server remains the source of the
// symbol tree. This analyzer removes declaration noise and adds syntax facts that the protocol's
// DocumentSymbol record does not carry: member visibility, ivue `$` cache names, accessors, and
// inheritance-aware overrides.
//
// The TypeScript compiler loads only when an observed TS/JS outline asks for it. Parent discovery
// parses only the direct inheritance chain. It does not build a workspace-wide Program.
//
// invariant: Symbol structure is analyzer knowledge (src/modules/structure/structure.invariants.md)
// invariant: Outline labels expose source semantics (src/modules/structure/structure.invariants.md)
// invariant: Imported dependencies are read late (project.invariants.md)
import { Static } from 'ivue/extras';
import { Files } from '../system/Files';
import { TextCoordinates } from '../text/TextCoordinates';
import type { LanguageDocument } from '../workspace/LanguageProvider.interface';
import type {
  StructureAccessorKind,
  StructureMemberVisibility,
  StructureOutlineResult,
  StructureSymbol,
} from '../structure/StructureSource.interface';
import { TypeScriptProvider } from './TypeScriptProvider';

class $TypeScriptStructureAnalyzer {
  protected static get $typescriptPromise(): Promise<
    typeof import('typescript')
  > {
    return import('typescript');
  }

  protected static get MAXIMUM_INHERITANCE_DEPTH(): number {
    return 32;
  }

  protected static get Files() {
    return Files.Class;
  }

  protected static get TextCoordinates() {
    return TextCoordinates.Class;
  }

  static supportsPath(path: string): boolean {
    return TypeScriptProvider.Class.supportsPath(path);
  }

  static async refine(
    document: LanguageDocument,
    result: StructureOutlineResult,
  ): Promise<StructureOutlineResult> {
    if (!this.supportsPath(document.path)) return result;
    const typescript = await this.$typescriptPromise;
    const sourceModel = this.parseSourceModel(
      typescript,
      document.path,
      document.text,
    );
    this.annotateCurrentSource(typescript, sourceModel, document);
    return {
      truncated: result.truncated,
      symbols: this.refineSymbols(result.symbols, sourceModel),
    };
  }

  protected static refineSymbols(
    symbols: readonly StructureSymbol[],
    sourceModel: TypeScriptSourceModel,
  ): StructureSymbol[] {
    const refined: StructureSymbol[] = [];
    for (const symbol of symbols) {
      if (this.positionIsExcluded(symbol.line, symbol.column, sourceModel)) {
        continue;
      }
      const metadata = sourceModel.metadataByAnchor.get(
        this.anchorKey(symbol.line, symbol.column, symbol.name),
      );
      refined.push({
        ...symbol,
        ...(metadata ?? {}),
        children: this.refineSymbols(symbol.children, sourceModel),
      });
    }
    return refined;
  }

  protected static positionIsExcluded(
    line: number,
    column: number,
    sourceModel: TypeScriptSourceModel,
  ): boolean {
    const lineStart = sourceModel.sourceFile.getPositionOfLineAndCharacter(
      line,
      0,
    );
    const lineEnd = sourceModel.sourceFile.getLineEndOfPosition(lineStart);
    const lineText = sourceModel.sourceFile.text.slice(lineStart, lineEnd);
    const position =
      lineStart + this.TextCoordinates.graphemeToU16(lineText, column);
    return sourceModel.excludedRanges.some(
      (range) => position >= range.start && position < range.end,
    );
  }

  protected static annotateCurrentSource(
    typescript: typeof import('typescript'),
    sourceModel: TypeScriptSourceModel,
    document: LanguageDocument,
  ): void {
    for (const classModel of sourceModel.classesByName.values()) {
      const inheritedNames = this.inheritedMemberNames(
        typescript,
        sourceModel,
        classModel,
        new Set(),
        0,
      );
      for (const member of classModel.declaration.members) {
        const name = this.memberName(typescript, member);
        if (!name) continue;
        const anchor = this.memberAnchor(
          typescript,
          member,
          sourceModel.sourceFile,
          document,
        );
        if (!anchor) continue;
        const explicitlyOverrides = this.hasModifier(
          typescript,
          member,
          typescript.SyntaxKind.OverrideKeyword,
        );
        sourceModel.metadataByAnchor.set(
          this.anchorKey(anchor.line, anchor.column, name),
          {
            visibility: this.memberVisibility(typescript, member, name),
            cached: name.startsWith('$'),
            override:
              !name.startsWith('#') &&
              (explicitlyOverrides || inheritedNames.has(name)),
            accessor: this.accessorKind(typescript, member),
          },
        );
      }
    }
  }

  protected static inheritedMemberNames(
    typescript: typeof import('typescript'),
    sourceModel: TypeScriptSourceModel,
    classModel: TypeScriptClassModel,
    visitedClasses: Set<string>,
    depth: number,
  ): Set<string> {
    const inheritedNames = new Set<string>();
    if (depth >= this.MAXIMUM_INHERITANCE_DEPTH) return inheritedNames;
    for (const heritageClause of classModel.declaration.heritageClauses ?? []) {
      if (heritageClause.token !== typescript.SyntaxKind.ExtendsKeyword) {
        continue;
      }
      for (const heritageType of heritageClause.types) {
        const parent = this.resolveParentClass(
          typescript,
          sourceModel,
          heritageType.expression,
        );
        if (!parent) continue;
        const parentIdentity = `${parent.sourceModel.path}:${parent.classModel.name}`;
        if (visitedClasses.has(parentIdentity)) continue;
        const nextVisitedClasses = new Set(visitedClasses);
        nextVisitedClasses.add(parentIdentity);
        for (const member of parent.classModel.declaration.members) {
          const name = this.memberName(typescript, member);
          if (
            name &&
            !name.startsWith('#') &&
            this.memberVisibility(typescript, member, name) !== 'private'
          ) {
            inheritedNames.add(name);
          }
        }
        for (const name of this.inheritedMemberNames(
          typescript,
          parent.sourceModel,
          parent.classModel,
          nextVisitedClasses,
          depth + 1,
        )) {
          inheritedNames.add(name);
        }
      }
    }
    return inheritedNames;
  }

  protected static resolveParentClass(
    typescript: typeof import('typescript'),
    sourceModel: TypeScriptSourceModel,
    expression: import('typescript').Expression,
  ): ResolvedTypeScriptClass | null {
    const reference = this.classReference(typescript, expression);
    if (!reference) return null;
    const localClass = sourceModel.classesByName.get(reference.className);
    if (localClass && !reference.importName) {
      return { sourceModel, classModel: localClass };
    }
    const importBinding = sourceModel.importsByLocalName.get(
      reference.importName ?? reference.className,
    );
    if (!importBinding) return null;
    const resolvedPath = this.resolveModulePath(
      typescript,
      importBinding.moduleSpecifier,
      sourceModel.path,
    );
    if (!resolvedPath) return null;
    const parentSourceModel = this.loadSourceModel(typescript, resolvedPath);
    if (!parentSourceModel) return null;
    const importedName =
      reference.className === '$Class'
        ? `$${importBinding.importedName}`
        : reference.className;
    const classModel =
      parentSourceModel.classesByName.get(importedName) ??
      parentSourceModel.classesByName.get(importBinding.importedName);
    return classModel ? { sourceModel: parentSourceModel, classModel } : null;
  }

  protected static classReference(
    typescript: typeof import('typescript'),
    expression: import('typescript').Expression,
  ): TypeScriptClassReference | null {
    if (typescript.isIdentifier(expression)) {
      return { className: expression.text, importName: null };
    }
    if (!typescript.isPropertyAccessExpression(expression)) return null;
    if (!typescript.isIdentifier(expression.expression)) return null;
    return {
      className: expression.name.text,
      importName: expression.expression.text,
    };
  }

  protected static resolveModulePath(
    typescript: typeof import('typescript'),
    moduleSpecifier: string,
    containingPath: string,
  ): string | null {
    const resolved = typescript.resolveModuleName(
      moduleSpecifier,
      containingPath,
      {
        allowJs: true,
        jsx: typescript.JsxEmit.Preserve,
        moduleResolution: typescript.ModuleResolutionKind.Bundler,
      },
      typescript.sys,
    ).resolvedModule?.resolvedFileName;
    return resolved && this.supportsPath(resolved) ? resolved : null;
  }

  protected static loadSourceModel(
    typescript: typeof import('typescript'),
    path: string,
  ): TypeScriptSourceModel | null {
    try {
      if (!this.Files.exists(path)) return null;
      return this.parseSourceModel(typescript, path, this.Files.read(path));
    } catch {
      return null;
    }
  }

  protected static parseSourceModel(
    typescript: typeof import('typescript'),
    path: string,
    text: string,
  ): TypeScriptSourceModel {
    const sourceFile = typescript.createSourceFile(
      path,
      text,
      typescript.ScriptTarget.Latest,
      true,
      this.scriptKind(typescript, path),
    );
    const sourceModel: TypeScriptSourceModel = {
      path,
      sourceFile,
      excludedRanges: [],
      importsByLocalName: new Map(),
      classesByName: new Map(),
      metadataByAnchor: new Map(),
    };
    const visit = (node: import('typescript').Node): void => {
      if (typescript.isImportDeclaration(node)) {
        sourceModel.excludedRanges.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
        });
        this.recordImport(typescript, sourceModel, node);
      } else if (typescript.isHeritageClause(node)) {
        sourceModel.excludedRanges.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
        });
      } else if (typescript.isClassDeclaration(node) && node.name) {
        sourceModel.classesByName.set(node.name.text, {
          name: node.name.text,
          declaration: node,
        });
      }
      typescript.forEachChild(node, visit);
    };
    visit(sourceFile);
    return sourceModel;
  }

  protected static recordImport(
    typescript: typeof import('typescript'),
    sourceModel: TypeScriptSourceModel,
    declaration: import('typescript').ImportDeclaration,
  ): void {
    if (!typescript.isStringLiteral(declaration.moduleSpecifier)) return;
    const moduleSpecifier = declaration.moduleSpecifier.text;
    const importClause = declaration.importClause;
    if (!importClause) return;
    if (importClause.name) {
      sourceModel.importsByLocalName.set(importClause.name.text, {
        importedName: 'default',
        moduleSpecifier,
      });
    }
    const namedBindings = importClause.namedBindings;
    if (!namedBindings) return;
    if (typescript.isNamespaceImport(namedBindings)) {
      sourceModel.importsByLocalName.set(namedBindings.name.text, {
        importedName: '*',
        moduleSpecifier,
      });
      return;
    }
    for (const element of namedBindings.elements) {
      sourceModel.importsByLocalName.set(element.name.text, {
        importedName: element.propertyName?.text ?? element.name.text,
        moduleSpecifier,
      });
    }
  }

  protected static memberAnchor(
    typescript: typeof import('typescript'),
    member: import('typescript').ClassElement,
    sourceFile: import('typescript').SourceFile,
    document: LanguageDocument,
  ): { line: number; column: number } | null {
    const namedMember = member as import('typescript').NamedDeclaration;
    if (!namedMember.name) return null;
    const position = namedMember.name.getStart(sourceFile);
    const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(position);
    return {
      line: lineAndCharacter.line,
      column: this.TextCoordinates.u16ToGrapheme(
        document.line(lineAndCharacter.line),
        lineAndCharacter.character,
      ),
    };
  }

  protected static memberName(
    typescript: typeof import('typescript'),
    member: import('typescript').ClassElement,
  ): string | null {
    const name = (member as import('typescript').NamedDeclaration).name;
    if (!name) return null;
    if (
      typescript.isIdentifier(name) ||
      typescript.isPrivateIdentifier(name) ||
      typescript.isStringLiteral(name) ||
      typescript.isNumericLiteral(name)
    ) {
      return name.getText();
    }
    return null;
  }

  protected static memberVisibility(
    typescript: typeof import('typescript'),
    member: import('typescript').ClassElement,
    name: string,
  ): StructureMemberVisibility {
    if (
      name.startsWith('#') ||
      this.hasModifier(typescript, member, typescript.SyntaxKind.PrivateKeyword)
    ) {
      return 'private';
    }
    return this.hasModifier(
      typescript,
      member,
      typescript.SyntaxKind.ProtectedKeyword,
    )
      ? 'protected'
      : 'public';
  }

  protected static accessorKind(
    typescript: typeof import('typescript'),
    member: import('typescript').ClassElement,
  ): StructureAccessorKind | null {
    if (typescript.isGetAccessorDeclaration(member)) return 'getter';
    if (typescript.isSetAccessorDeclaration(member)) return 'setter';
    return null;
  }

  protected static hasModifier(
    typescript: typeof import('typescript'),
    node: import('typescript').Node,
    kind: import('typescript').SyntaxKind,
  ): boolean {
    return Boolean(
      typescript
        .getModifiers(node as import('typescript').HasModifiers)
        ?.some((modifier) => modifier.kind === kind),
    );
  }

  protected static scriptKind(
    typescript: typeof import('typescript'),
    path: string,
  ): import('typescript').ScriptKind {
    switch (this.Files.extname(path).toLowerCase()) {
      case '.js':
      case '.mjs':
      case '.cjs':
        return typescript.ScriptKind.JS;
      case '.jsx':
        return typescript.ScriptKind.JSX;
      case '.tsx':
        return typescript.ScriptKind.TSX;
      default:
        return typescript.ScriptKind.TS;
    }
  }

  protected static anchorKey(
    line: number,
    column: number,
    name: string,
  ): string {
    return `${line}:${column}:${name}`;
  }
}

export namespace TypeScriptStructureAnalyzer {
  export const $Class = Static($TypeScriptStructureAnalyzer);
  export let Class = $Class;
}

interface TypeScriptSourceModel {
  readonly path: string;
  readonly sourceFile: import('typescript').SourceFile;
  readonly excludedRanges: TypeScriptSourceRange[];
  readonly importsByLocalName: Map<string, TypeScriptImportBinding>;
  readonly classesByName: Map<string, TypeScriptClassModel>;
  readonly metadataByAnchor: Map<string, StructureSymbolMetadata>;
}

interface TypeScriptSourceRange {
  readonly start: number;
  readonly end: number;
}

interface TypeScriptImportBinding {
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

interface TypeScriptClassModel {
  readonly name: string;
  readonly declaration: import('typescript').ClassDeclaration;
}

interface ResolvedTypeScriptClass {
  readonly sourceModel: TypeScriptSourceModel;
  readonly classModel: TypeScriptClassModel;
}

interface TypeScriptClassReference {
  readonly className: string;
  readonly importName: string | null;
}

interface StructureSymbolMetadata {
  readonly visibility: StructureMemberVisibility;
  readonly cached: boolean;
  readonly override: boolean;
  readonly accessor: StructureAccessorKind | null;
}
