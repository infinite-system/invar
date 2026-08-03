#!/usr/bin/env bun
// A stdio MCP doorway to the checkout-keyed DriveSession server.
//
// Input still reaches Invar through DriveSession's real PTY verbs. Graph set
// remains an experiment primitive and never supplies verification evidence.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: Graph observation reads and never mutates (src/modules/system/system.invariants.md)
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Static } from 'ivue/extras';
import { z } from 'zod/v4';
import { DriveScriptRunner } from './DriveSession';
import { GraphClient } from './GraphClient';

class $InvarMcpServer {
  static create(options: { serverDirectory?: string } = {}): McpServer {
    const server = new McpServer({
      name: 'invar-drive',
      version: '1.0.0',
    });

    server.registerTool(
      'drive_attach',
      {
        description:
          'Run a DriveSession snippet against the live checkout server. ' +
          'Actions use the existing real-PTY input verbs.',
        inputSchema: {
          snippet: z.string().min(1).describe('DriveSession snippet source'),
        },
      },
      async ({ snippet }) =>
        this.textResult(
          await DriveScriptRunner.Class.attach({
            source: snippet,
            serverDirectory: options.serverDirectory,
          }),
        ),
    );

    server.registerTool(
      'graph_get',
      {
        description:
          'Read one live app graph path now. This observes and never mutates.',
        inputSchema: { path: z.string().min(1) },
        annotations: { readOnlyHint: true },
      },
      async ({ path }) => {
        const response = await GraphClient.Class.query(
          this.statusPath(options.serverDirectory),
          path,
          'now',
        );
        return this.jsonResult({ path, ...response });
      },
    );

    server.registerTool(
      'graph_await',
      {
        description:
          'Wait for one live app graph path to reach a value at a completed-frame boundary.',
        inputSchema: {
          path: z.string().min(1),
          value: z.unknown(),
          timeoutMs: z.number().int().positive().max(120_000).optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ path, value, timeoutMs }) => {
        await GraphClient.Class.awaitValue(
          this.statusPath(options.serverDirectory),
          path,
          value,
          timeoutMs,
        );
        return this.jsonResult({ path, value, reached: true });
      },
    );

    server.registerTool(
      'graph_set',
      {
        description:
          'EXPERIMENT ONLY, never verification. Write one live graph path to test a hypothesis.',
        inputSchema: {
          path: z.string().min(1),
          value: z.unknown(),
        },
      },
      async ({ path, value }) => {
        const response = await GraphClient.Class.query(
          this.statusPath(options.serverDirectory),
          path,
          'now',
          { set: { value } },
        );
        return this.jsonResult({ path, ...response });
      },
    );

    server.registerTool(
      'screen',
      {
        description:
          'Read the latest completed terminal grid, optionally limited to an inclusive row band.',
        inputSchema: {
          firstRow: z.number().int().nonnegative().optional(),
          lastRow: z.number().int().nonnegative().optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ firstRow, lastRow }) => {
        if (
          firstRow !== undefined &&
          lastRow !== undefined &&
          firstRow > lastRow
        ) {
          throw new Error('screen firstRow must not be greater than lastRow');
        }
        return this.textResult(
          await DriveScriptRunner.Class.attach({
            source: this.screenSnippet(firstRow, lastRow),
            serverDirectory: options.serverDirectory,
          }),
        );
      },
    );

    server.registerTool(
      'server_start',
      {
        description:
          'Start the checkout-keyed warm DriveSession server and wait until its manifest is ready.',
        inputSchema: {
          workspace: z
            .string()
            .min(1)
            .optional()
            .describe('Workspace directory; defaults to a temporary workspace'),
        },
      },
      async ({ workspace }) =>
        this.textResult(
          await this.startServer(options.serverDirectory, workspace),
        ),
    );

    server.registerTool(
      'server_reload',
      {
        description:
          'Replace the warm server app with a fresh app on the same rendezvous.',
      },
      async () =>
        this.textResult(
          await DriveScriptRunner.Class.attach({
            source: '',
            serverDirectory: options.serverDirectory,
            reload: true,
          }),
        ),
    );

    server.registerTool(
      'server_stop',
      {
        description: 'Stop the checkout-keyed warm DriveSession server.',
      },
      async () =>
        this.textResult(
          await DriveScriptRunner.Class.attach({
            source: '',
            serverDirectory: options.serverDirectory,
            stop: true,
          }),
        ),
    );

    return server;
  }

  static async main(argumentsList: readonly string[]): Promise<void> {
    let serverDirectory: string | undefined;
    for (
      let argumentIndex = 0;
      argumentIndex < argumentsList.length;
      argumentIndex += 1
    ) {
      const argument = argumentsList[argumentIndex];
      if (argument === '--server-dir') {
        const value = argumentsList[argumentIndex + 1];
        if (value === undefined)
          throw new Error('--server-dir requires a value');
        serverDirectory = resolve(value);
        argumentIndex += 1;
        continue;
      }
      if (argument === '--help') {
        process.stderr.write(
          'Usage: bun scripts/harness/InvarMcpServer.ts [--server-dir DIR]\n',
        );
        return;
      }
      throw new Error(`Unknown Invar MCP server argument: ${argument}`);
    }
    await this.create({ serverDirectory }).connect(new StdioServerTransport());
  }

  protected static async startServer(
    serverDirectory?: string,
    workspace?: string,
  ): Promise<string> {
    const currentManifest =
      DriveScriptRunner.Class.serverManifest(serverDirectory);
    if (this.manifestNamesLiveServer(currentManifest)) {
      return `drive-server: already ready (pid ${String(currentManifest?.pid)})`;
    }
    if (workspace !== undefined) {
      const workspacePath = resolve(workspace);
      try {
        if (!statSync(workspacePath).isDirectory()) {
          throw new Error('not a directory');
        }
      } catch {
        throw new Error(
          `server_start workspace is not a directory: ${workspacePath}`,
        );
      }
    }
    const command = [
      process.execPath,
      resolve(import.meta.dir, 'DriveSession.ts'),
      '--serve',
      ...(serverDirectory === undefined
        ? []
        : ['--server-dir', serverDirectory]),
      ...(workspace === undefined ? [] : ['--open', resolve(workspace)]),
    ];
    const serverProcess = Bun.spawn({
      cmd: command,
      cwd: process.cwd(),
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const manifest = DriveScriptRunner.Class.serverManifest(serverDirectory);
      if (
        manifest?.pid === serverProcess.pid &&
        typeof manifest.statusPath === 'string'
      ) {
        serverProcess.unref();
        return `drive-server: ready (pid ${serverProcess.pid})`;
      }
      if (serverProcess.exitCode !== null) {
        throw new Error(
          `drive server exited with code ${serverProcess.exitCode} before its manifest became ready`,
        );
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 15));
    }
    serverProcess.kill();
    throw new Error(
      'drive server did not publish its ready manifest within 30000ms',
    );
  }

  protected static statusPath(serverDirectory?: string): string {
    const manifest = DriveScriptRunner.Class.serverManifest(serverDirectory);
    if (!this.manifestNamesLiveServer(manifest)) {
      throw new Error(
        'no live drive server. Call server_start or start DriveSession with --serve.',
      );
    }
    if (typeof manifest?.statusPath !== 'string') {
      throw new Error('the live drive server manifest has no status path');
    }
    return manifest.statusPath;
  }

  protected static manifestNamesLiveServer(
    manifest: Record<string, unknown> | null,
  ): boolean {
    if (manifest === null || typeof manifest.pid !== 'number') return false;
    try {
      process.kill(manifest.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  protected static screenSnippet(firstRow = 0, lastRow?: number): string {
    return [
      'const snapshot = await app.screen();',
      `const firstRow = ${firstRow};`,
      `const requestedLastRow = ${lastRow ?? -1};`,
      'if (firstRow >= snapshot.rows) throw new Error(`screen firstRow ${firstRow} is outside ${snapshot.rows} rows`);',
      'const lastRow = requestedLastRow < 0 ? snapshot.rows - 1 : Math.min(requestedLastRow, snapshot.rows - 1);',
      'const lines = [];',
      'for (let row = firstRow; row <= lastRow; row += 1) lines.push(`${String(row).padStart(2, " ")} |${snapshot.rowText(row)}|`);',
      'console.log(`${snapshot.columns}x${snapshot.rows}\n${lines.join("\\n")}`);',
    ].join('\n');
  }

  protected static textResult(text: string): {
    content: [{ type: 'text'; text: string }];
  } {
    return { content: [{ type: 'text', text }] };
  }

  protected static jsonResult(value: unknown): {
    content: [{ type: 'text'; text: string }];
  } {
    return this.textResult(JSON.stringify(value, null, 2) ?? 'undefined');
  }
}

export namespace InvarMcpServer {
  export const $Class = Static($InvarMcpServer);
  export let Class = $Class;
}

if (import.meta.main) {
  try {
    await InvarMcpServer.Class.main(process.argv.slice(2));
  } catch (thrown) {
    process.stderr.write(
      `Invar MCP server failed: ${
        thrown instanceof Error ? thrown.message : String(thrown)
      }\n`,
    );
    process.exitCode = 1;
  }
}
