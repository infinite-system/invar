import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
function collect(root: string, out: string[] = []): string[] {
  for (const e of readdirSync(root)) {
    const f = join(root, e);
    if (statSync(f).isDirectory()) collect(f, out);
    else if (f.endsWith('.ts') && !f.endsWith('.test.ts')) out.push(f);
  }
  return out;
}
const files = collect('src/modules').sort();
for (const name of process.argv.slice(2)) {
  const classes = new Set<string>();
  for (const file of files) {
    if (file.endsWith(`/${name}.ts`)) continue;
    const src = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === name
      ) {
        let a: ts.Node | undefined = node.parent;
        while (a && !ts.isClassDeclaration(a) && !ts.isClassExpression(a))
          a = a.parent;
        classes.add(
          a && (a as ts.ClassDeclaration).name
            ? `${file}:${(a as ts.ClassDeclaration).name!.text}`
            : `${file}:<none>`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  console.log(
    `${name}: ${classes.size} enclosing class(es) need a seam getter`,
  );
  for (const c of [...classes].sort()) console.log(`   ${c}`);
}
