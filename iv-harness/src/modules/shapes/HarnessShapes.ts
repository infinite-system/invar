import { Static } from 'ivue/extras';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as typescript from 'typescript';

/**
 * The type-shape projection: generated from the TypeScript compiler,
 * never authored (one authority, many projections). The generator
 * walks iv-harness sources and emits every exported interface's
 * members and every namespace class's public static methods into
 * shapes.generated.json; `describe` answers from it. A colocated test
 * regenerates and diffs, so the projection cannot drift.
 */
// invariant: The harness graph never imports from the app (iv-harness/iv-harness.invariants.md)
class $HarnessShapes {
  static get SHAPES_FILE_RELATIVE_PATH(): string {
    return 'iv-harness/shapes.generated.json';
  }

  /** Binds graph domains to the type names their nodes carry. */
  static get PATH_TYPE_BINDINGS(): Record<string, string> {
    return {
      tasks: 'TaskNode',
      'tasks.all': 'TaskNode',
      'tasks.byNumber': 'TaskNode',
      gates: 'GateRun',
      lanes: 'LaneNode',
      'fleet.heartbeat': 'HeartbeatNode',
      metrics: 'TaskReportMetrics',
      drift: 'DriftNode',
      verbs: 'VerbListing',
      events: 'VerbEvent',
      reportMeta: 'TaskReportMeta',
    };
  }

  static generate(rootDirectory: string): ShapeCatalog {
    const catalog: ShapeCatalog = { interfaces: {}, classes: {} };
    for (const fileName of this.sourceFiles(
      join(rootDirectory, 'iv-harness', 'src'),
    )) {
      const sourceFile = typescript.createSourceFile(
        fileName,
        readFileSync(fileName, 'utf8'),
        typescript.ScriptTarget.Latest,
        true,
      );
      const relativeFileName = relative(rootDirectory, fileName).replaceAll(
        '\\',
        '/',
      );
      for (const statement of sourceFile.statements) {
        if (
          typescript.isInterfaceDeclaration(statement) &&
          this.isExported(statement)
        ) {
          catalog.interfaces[statement.name.text] = {
            file: relativeFileName,
            source:
              this.leadingDocComment(statement, sourceFile) +
              statement.getText(sourceFile),
            members: statement.members.flatMap((member) =>
              typescript.isPropertySignature(member) && member.name
                ? [
                    {
                      name: member.name.getText(sourceFile),
                      type: member.type?.getText(sourceFile) ?? 'unknown',
                      optional: member.questionToken !== undefined,
                    },
                  ]
                : [],
            ),
          };
        }
        if (
          typescript.isClassDeclaration(statement) &&
          statement.name?.text.startsWith('$')
        ) {
          const methods = statement.members.flatMap((member) => {
            if (
              !typescript.isMethodDeclaration(member) ||
              !this.isStatic(member) ||
              this.isProtected(member) ||
              !member.name
            ) {
              return [];
            }
            return [
              {
                name: member.name.getText(sourceFile),
                parameters: member.parameters.map(
                  (parameter) =>
                    `${parameter.name.getText(sourceFile)}: ${parameter.type?.getText(sourceFile) ?? 'unknown'}`,
                ),
                returns: member.type?.getText(sourceFile) ?? 'unknown',
              },
            ];
          });
          if (methods.length > 0) {
            catalog.classes[statement.name.text.slice(1)] = {
              file: relativeFileName,
              source: null,
              methods,
            };
          }
        }
      }
    }
    return catalog;
  }

  /** A declaration's attached JSDoc — leading trivia getText() drops. */
  static leadingDocComment(
    statement: typescript.Statement,
    sourceFile: typescript.SourceFile,
  ): string {
    const jsDocNodes = (statement as { jsDoc?: typescript.JSDoc[] }).jsDoc;
    if (!jsDocNodes || jsDocNodes.length === 0) return '';
    return (
      jsDocNodes.map((docNode) => docNode.getText(sourceFile)).join('\n') + '\n'
    );
  }

  static isExported(statement: typescript.Statement): boolean {
    return (
      typescript
        .getModifiers(statement as typescript.HasModifiers)
        ?.some(
          (modifier) => modifier.kind === typescript.SyntaxKind.ExportKeyword,
        ) ?? false
    );
  }

  static isStatic(member: typescript.ClassElement): boolean {
    return (
      typescript
        .getModifiers(member as typescript.HasModifiers)
        ?.some(
          (modifier) => modifier.kind === typescript.SyntaxKind.StaticKeyword,
        ) ?? false
    );
  }

  static isProtected(member: typescript.ClassElement): boolean {
    return (
      typescript
        .getModifiers(member as typescript.HasModifiers)
        ?.some(
          (modifier) =>
            modifier.kind === typescript.SyntaxKind.ProtectedKeyword,
        ) ?? false
    );
  }

  static readCatalog(rootDirectory: string): ShapeCatalog | null {
    const catalogPath = join(rootDirectory, this.SHAPES_FILE_RELATIVE_PATH);
    if (!existsSync(catalogPath)) return null;
    try {
      return JSON.parse(readFileSync(catalogPath, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Answers a type name or a bound graph path; misses teach both namespaces. */
  static describe(
    rootDirectory: string,
    subject: string,
    depth: number = 1,
  ): ShapeAnswer {
    const catalog = this.readCatalog(rootDirectory);
    if (!catalog) {
      throw new Error(
        `no shape catalog at ${this.SHAPES_FILE_RELATIVE_PATH} — run: bun iv-harness/generate-shapes.ts`,
      );
    }
    const typeName = this.PATH_TYPE_BINDINGS[subject] ?? subject;
    if (catalog.interfaces[typeName]) {
      const shape = this.expandInterface(
        catalog,
        typeName,
        depth,
        new Set([typeName]),
      );
      return {
        subject,
        type: typeName,
        kind: 'interface',
        shape,
        references: this.referencesIn(catalog, catalog.interfaces[typeName]),
      };
    }
    if (catalog.classes[typeName]) {
      return {
        subject,
        type: typeName,
        kind: 'class',
        shape: catalog.classes[typeName],
        references: this.referencesIn(catalog, catalog.classes[typeName]),
      };
    }
    const describable = [
      ...Object.keys(this.PATH_TYPE_BINDINGS),
      ...Object.keys(catalog.interfaces),
      ...Object.keys(catalog.classes),
    ].join(', ');
    throw new Error(
      `nothing describable named '${subject}'. Describable: ${describable}`,
    );
  }

  /** Catalog type names appearing in a shape's type texts — the graph's edges. */
  static referencesIn(
    catalog: ShapeCatalog,
    shape: InterfaceShape | ClassShape,
  ): string[] {
    const typeTexts: string[] = [];
    if ('members' in shape) {
      for (const member of shape.members) typeTexts.push(member.type);
    } else {
      for (const method of shape.methods) {
        typeTexts.push(method.returns, ...method.parameters);
      }
    }
    const knownNames = [
      ...Object.keys(catalog.interfaces),
      ...Object.keys(catalog.classes),
    ];
    const found = new Set<string>();
    for (const typeText of typeTexts) {
      for (const knownName of knownNames) {
        if (new RegExp(`\\b${knownName}\\b`).test(typeText)) {
          found.add(knownName);
        }
      }
    }
    return [...found].sort();
  }

  /**
   * Depth expansion: referenced interfaces inline in place until depth
   * runs out; a type already on the path becomes a reference at the
   * cut (the cycle guard), never a loop.
   */
  static expandInterface(
    catalog: ShapeCatalog,
    typeName: string,
    depth: number,
    visited: Set<string>,
  ): ExpandedInterfaceShape {
    const shape = catalog.interfaces[typeName]!;
    return {
      file: shape.file,
      members: shape.members.map((member) => {
        if (depth <= 1) return member;
        const referenced = Object.keys(catalog.interfaces).find((knownName) =>
          new RegExp(`\\b${knownName}\\b`).test(member.type),
        );
        if (referenced === undefined) return member;
        if (visited.has(referenced)) {
          return { ...member, cycle: referenced };
        }
        return {
          ...member,
          expanded: this.expandInterface(
            catalog,
            referenced,
            depth - 1,
            new Set([...visited, referenced]),
          ),
        };
      }),
    };
  }

  /**
   * The agent-native form: the declaration verbatim, then referenced
   * declarations appended to the requested depth — a self-contained
   * mini d.ts. Cycle-guarded like expansion.
   */
  static renderTypeScript(
    rootDirectory: string,
    subject: string,
    depth: number,
  ): string {
    const catalog = this.readCatalog(rootDirectory);
    if (!catalog) {
      throw new Error(
        `no shape catalog at ${this.SHAPES_FILE_RELATIVE_PATH} — run: bun iv-harness/generate-shapes.ts`,
      );
    }
    const rootTypeName = this.PATH_TYPE_BINDINGS[subject] ?? subject;
    if (!catalog.interfaces[rootTypeName] && !catalog.classes[rootTypeName]) {
      // reuse describe's loud miss
      this.describe(rootDirectory, subject, 1);
    }
    const rendered: string[] = [];
    const visited = new Set<string>();
    const queue: [string, number][] = [[rootTypeName, depth]];
    while (queue.length > 0) {
      const [typeName, remainingDepth] = queue.shift()!;
      if (visited.has(typeName)) continue;
      visited.add(typeName);
      const interfaceShape = catalog.interfaces[typeName];
      const classShape = catalog.classes[typeName];
      const shape = interfaceShape ?? classShape;
      if (!shape) continue;
      if (interfaceShape) {
        rendered.push(`// ${shape.file}\n${interfaceShape.source}`);
      } else if (classShape) {
        const methodLines = classShape.methods
          .map(
            (method) =>
              `  static ${method.name}(${method.parameters.join(', ')}): ${method.returns};`,
          )
          .join('\n');
        rendered.push(
          `// ${shape.file}\nclass ${typeName} {\n${methodLines}\n}`,
        );
      }
      const references = this.referencesIn(catalog, shape).filter(
        (referenceName) => referenceName !== typeName,
      );
      if (remainingDepth > 1) {
        for (const referenceName of references) {
          queue.push([referenceName, remainingDepth - 1]);
        }
      } else if (references.length > 0) {
        rendered.push(
          `// references (raise --depth to inline): ${references.join(', ')}`,
        );
      }
    }
    return rendered.join('\n\n') + '\n';
  }

  static sourceFiles(directory: string): string[] {
    if (!existsSync(directory)) return [];
    const files: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...this.sourceFiles(entryPath));
      else if (entryPath.endsWith('.ts') && !entryPath.endsWith('.test.ts')) {
        files.push(entryPath);
      }
    }
    return files.sort();
  }
}

export namespace HarnessShapes {
  export const $Class = Static($HarnessShapes);
  export let Class = $Class;
}

export interface ShapeMember {
  name: string;
  type: string;
  optional: boolean;
}

export interface ShapeMethod {
  name: string;
  parameters: string[];
  returns: string;
}

export interface InterfaceShape {
  file: string;
  /** The declaration verbatim — the authority's own words. */
  source: string;
  members: ShapeMember[];
}

export interface ClassShape {
  file: string;
  /** Classes render from method signatures; no single-declaration source. */
  source: null;
  methods: ShapeMethod[];
}

export interface ShapeCatalog {
  interfaces: Record<string, InterfaceShape>;
  classes: Record<string, ClassShape>;
}

export interface ShapeAnswer {
  subject: string;
  type: string;
  kind: 'interface' | 'class';
  shape: InterfaceShape | ClassShape | ExpandedInterfaceShape;
  /** Catalog types this shape points at — chain describe through them. */
  references: string[];
}

export interface ExpandedShapeMember extends ShapeMember {
  /** Present at depth > 1: the referenced interface inlined. */
  expanded?: ExpandedInterfaceShape;
  /** Present when expansion met a type already on the path. */
  cycle?: string;
}

export interface ExpandedInterfaceShape {
  file: string;
  members: ExpandedShapeMember[];
}
