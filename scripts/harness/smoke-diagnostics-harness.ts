#!/usr/bin/env bun
// Byte-level diagnostics parity port. Both supported real TypeScript servers feed the same store and
// paint the same gutter/range cells; the diagnostic hover message is asserted from emulator cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function diagnosticColorCounts(
  snapshot: HarnessSnapshot.Model,
): { gutter: number; range: number } {
  const errorLinePosition = snapshot.findText('badValue');
  if (!errorLinePosition) return { gutter: 0, range: 0 };
  let gutter = 0;
  let range = 0;
  for (const cell of snapshot.rowCells(errorLinePosition.row)) {
    if (!cell.isForegroundRgb || cell.foreground !== 0xdb4b4b) continue;
    const codePoint = cell.characters.codePointAt(0) ?? 0;
    if (
      cell.characters === '▎'
      || cell.characters === '▁'
      || codePoint >= 0x10000
    ) {
      gutter++;
    } else if (cell.characters.trim()) {
      range++;
    }
  }
  return { gutter, range };
}

function diagnosticCardVisible(snapshot: HarnessSnapshot.Model): boolean {
  return snapshot.textRows().some(
    (rowText) => rowText.includes('│')
      && (
        rowText.toLowerCase().includes('error:')
        || rowText.includes('not assignable')
      ),
  );
}

async function runServerCase(
  repositoryRoot: string,
  serverName: 'tsgo' | 'typescript-language-server',
  serverBinary: string,
): Promise<void> {
  if (!Bun.file(serverBinary).size) {
    console.log(`SKIP  ${serverName} not installed (${serverBinary}) — diagnostics case skipped`);
    return;
  }
  const fixtureRoot = mkdtempSync(join(tmpdir(), `tui-diagnostics-${serverName}-harness-`));
  const homeDirectory = mkdtempSync(join(tmpdir(), `tui-diagnostics-${serverName}-home-`));
  const statusPath = join(homeDirectory, 'status.json');
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  await Bun.write(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
    JSON.stringify({ typescriptServer: serverName }),
  );
  symlinkSync(join(repositoryRoot, 'node_modules'), join(fixtureRoot, 'node_modules'));
  await Bun.write(
    join(fixtureRoot, 'tsconfig.json'),
    '{ "compilerOptions": { "target": "ES2022", "module": "ESNext", '
      + '"moduleResolution": "bundler", "strict": true }, "include": ["*.ts"] }\n',
  );
  await Bun.write(
    join(fixtureRoot, 'e.ts'),
    'const okValue: number = 42;\nconst badValue: number = "not a number";\n',
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 120,
    rows: 36,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
    },
  });

  try {
    console.log(`== harness diagnostics: ${serverName} ==`);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      (status) => status.ready === true,
      20_000,
    );
    driver.sendKeys('Down');
    await driver.awaitQuiescence();
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      (status) => String(status.activeBuffer).endsWith('/e.ts'),
    );
    const snapshot = await driver.awaitSnapshot(
      (candidate) => {
        const counts = diagnosticColorCounts(candidate);
        return Number(HarnessSmoke.Class.readStatus(statusPath).diagnosticsCount) > 0
          && counts.gutter >= 1
          && counts.range >= 1;
      },
      55_000,
    );
    const counts = diagnosticColorCounts(snapshot);
    HarnessSmoke.Class.requireCondition(
      counts.gutter >= 1,
      `[${serverName}] severity-colored gutter mark paints`,
    );
    HarnessSmoke.Class.requireCondition(
      counts.range >= 1,
      `[${serverName}] colored diagnostic range paints`,
    );

    const errorPosition = snapshot.findText('badValue');
    if (!errorPosition) throw new Error('Diagnostic source marker disappeared');
    driver.sendMouse({
      kind: 'move',
      column: errorPosition.column,
      row: errorPosition.row,
      button: 'none',
    });
    await driver.awaitSnapshot(diagnosticCardVisible, 30_000);
    HarnessSmoke.Class.pass(`[${serverName}] hover card surfaces the diagnostic message`);
    driver.sendKeys('Control+q');
  } finally {
    driver.dispose();
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(homeDirectory, { recursive: true, force: true });
  }
}

const repositoryRoot = process.cwd();
if (!Bun.file(join(repositoryRoot, 'node_modules', 'typescript', 'package.json')).size) {
  console.log('SKIP  typescript not installed — diagnostics smoke skipped');
  process.exit(0);
}

await runServerCase(
  repositoryRoot,
  'tsgo',
  join(repositoryRoot, 'node_modules', '.bin', 'tsgo'),
);
await runServerCase(
  repositoryRoot,
  'typescript-language-server',
  join(repositoryRoot, 'node_modules', '.bin', 'typescript-language-server'),
);
console.log('smoke-diagnostics-harness: ALL-PASS');
