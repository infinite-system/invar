import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { HarnessSmoke } from './HarnessSmoke';

class $InvarMcpServerTest {
  static async callTool(
    client: Client,
    name: string,
    argumentsValue: Record<string, unknown> = {},
  ): Promise<TextToolResult> {
    return (await client.callTool({
      name,
      arguments: argumentsValue,
    })) as TextToolResult;
  }

  static text(result: TextToolResult): string {
    return result.content
      .filter(
        (content): content is { type: 'text'; text: string } =>
          content.type === 'text' && typeof content.text === 'string',
      )
      .map((content) => content.text)
      .join('\n');
  }

  static async awaitServerStopped(serverDirectory: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    const manifestPath = join(serverDirectory, 'server.json');
    while (Date.now() < deadline) {
      if (!(await Bun.file(manifestPath).exists())) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 15));
    }
    throw new Error(`Drive server did not remove ${manifestPath} after stop`);
  }

  static async runScaleArm(lineCount: number): Promise<void> {
    const serverDirectory = mkdtempSync(
      join(tmpdir(), `invar-mcp-server-${lineCount}-`),
    );
    const mcpServerPath = resolve(import.meta.dir, 'InvarMcpServer.ts');
    const driveSessionPath = resolve(import.meta.dir, 'DriveSession.ts');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpServerPath, '--server-dir', serverDirectory],
      cwd: resolve(import.meta.dir, '../..'),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'invar-mcp-test', version: '1.0.0' });
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        'drive_attach',
        'graph_await',
        'graph_get',
        'graph_set',
        'screen',
        'server_reload',
        'server_start',
        'server_stop',
      ]);
      expect(
        tools.tools.find((tool) => tool.name === 'graph_set')?.description,
      ).toContain('EXPERIMENT ONLY, never verification');

      const startResult = await this.callTool(client, 'server_start', {
        sizeLines: lineCount,
      });
      expect(startResult.isError).not.toBe(true);

      const graphResult = await this.callTool(client, 'graph_get', {
        path: 'workspaceSet.active.editor.document.lineCount',
      });
      expect(graphResult.isError).not.toBe(true);
      expect(JSON.parse(this.text(graphResult)).value).toBe(lineCount);

      const driveResult = await this.callTool(client, 'drive_attach', {
        snippet:
          `await app.key('Control+j')` +
          `.waitForStatus('panelVisible', true);` +
          `console.log('panel opened through real PTY input');`,
      });
      expect(driveResult.isError).not.toBe(true);
      expect(this.text(driveResult)).toContain(
        'panel opened through real PTY input',
      );

      const awaitResult = await this.callTool(client, 'graph_await', {
        path: 'workspaceSet.active.editor.document.lineCount',
        value: lineCount,
        timeoutMs: 5_000,
      });
      expect(awaitResult.isError).not.toBe(true);

      const screenResult = await this.callTool(client, 'screen', {
        firstRow: 0,
        lastRow: 2,
      });
      expect(screenResult.isError).not.toBe(true);
      expect(this.text(screenResult)).toContain('220x60');
      expect(this.text(screenResult)).toContain(' 0 |');

      const wrongPathResult = await this.callTool(client, 'graph_get', {
        path: 'definitely.not.a.real.path',
      });
      expect(wrongPathResult.isError).toBe(true);
      expect(this.text(wrongPathResult)).toContain(
        'graph path "definitely.not.a.real.path" did not resolve',
      );

      const failedSnippetResult = await this.callTool(client, 'drive_attach', {
        snippet: `throw new Error('planted MCP snippet failure')`,
      });
      expect(failedSnippetResult.isError).toBe(true);
      expect(this.text(failedSnippetResult)).toContain(
        'planted MCP snippet failure',
      );

      const failedAttachProcess = Bun.spawn({
        cmd: [
          process.execPath,
          driveSessionPath,
          '--attach',
          `throw new Error('planted CLI snippet failure')`,
          '--server-dir',
          serverDirectory,
        ],
        cwd: resolve(import.meta.dir, '../..'),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const failedAttachExitCode = await failedAttachProcess.exited;
      expect(failedAttachExitCode).not.toBe(0);
      expect(await failedAttachProcess.stderr.text()).toContain(
        'attach: snippet failed: planted CLI snippet failure',
      );

      const reloadResult = await this.callTool(client, 'server_reload');
      expect(reloadResult.isError).not.toBe(true);
      expect(this.text(reloadResult)).toContain('drive-server: reloaded');
      const stopResult = await this.callTool(client, 'server_stop');
      expect(stopResult.isError).not.toBe(true);
      expect(this.text(stopResult)).toContain('drive-server: stopped');
      await this.awaitServerStopped(serverDirectory);
    } finally {
      await client.close();
      try {
        const stopProcess = Bun.spawn({
          cmd: [
            process.execPath,
            driveSessionPath,
            '--stop',
            '--server-dir',
            serverDirectory,
          ],
          cwd: resolve(import.meta.dir, '../..'),
          stdout: 'ignore',
          stderr: 'ignore',
        });
        await stopProcess.exited;
      } catch {
        // The normal test path already stopped the server.
      }
      await HarnessSmoke.Class.removeTemporaryDirectory(serverDirectory);
    }
  }
}

test('the stdio MCP doorway drives and observes small and large live apps', async () => {
  await $InvarMcpServerTest.runScaleArm(10);
  await $InvarMcpServerTest.runScaleArm(100_000);
}, 120_000);

type TextToolResult = {
  readonly content: readonly {
    readonly type: string;
    readonly text?: string;
  }[];
  readonly isError?: boolean;
};
