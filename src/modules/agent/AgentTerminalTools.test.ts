import { expect, test } from 'bun:test';
import { Static } from 'ivue/extras';
import {
  AgentTerminalTools,
  type AgentTerminalToolPort,
} from './AgentTerminalTools';

class $AgentTerminalToolsTest {
  static {
    test('ask mode exposes both reads and staging while run remains unavailable', () => {
      const definitions = AgentTerminalTools.Class.definitions(
        false,
        this.terminalPort(),
      );
      expect(definitions.map((definition) => definition.name)).toEqual([
        'readTerminalInput',
        'readTerminalScrollback',
        'stageTerminalCommand',
        'replaceTerminalInput',
      ]);
      expect(definitions[1]?.description).toContain('default 40');
      expect(definitions[1]?.description).toContain('full retained scrollback');
      expect(definitions[1]?.description).toContain('redaction is heuristic');
      expect(definitions[2]?.description).toContain('Default courtesy');
      expect(definitions[2]?.description).toContain('header shows the cwd');
      expect(definitions[2]?.description).toContain(
        'edit the real readline buffer',
      );
      expect(definitions[2]?.description).toContain(
        'Ctrl+C during animated typing',
      );
    });

    test('read observes input while replacement remains staged', async () => {
      const definitions = AgentTerminalTools.Class.definitions(
        false,
        this.terminalPort(),
      );
      const readResult = await definitions[0]!.invoke({});
      expect(readResult).toContain('Current terminal input: printf brokn');
      expect(readResult).toContain('previous output');
      const replaceResult = await definitions[3]!.invoke({
        command: 'printf fixed',
      });
      expect(replaceResult).toContain('staged without Enter');
    });

    test('scrollback accepts an exact newest count or inclusive retained range', async () => {
      const definitions = AgentTerminalTools.Class.definitions(
        false,
        this.terminalPort(),
      );
      const scrollback = definitions[1]!;
      expect(
        JSON.parse(await scrollback.invoke({ lineCount: 55 })).lines,
      ).toHaveLength(55);
      expect(
        JSON.parse(
          await scrollback.invoke({
            range: { startLine: 11, endLine: 13 },
          }),
        ),
      ).toEqual({
        lines: ['line-11', 'line-12', 'line-13'],
        totalLines: 80,
        startLine: 11,
        endLine: 13,
      });
      expect(
        await scrollback.invoke({
          lineCount: 5,
          range: { startLine: 1, endLine: 2 },
        }),
      ).toContain('either lineCount or range');
    });

    test('bypass mode adds visible autonomous execution', async () => {
      const definitions = AgentTerminalTools.Class.definitions(
        true,
        this.terminalPort(),
      );
      expect(definitions.map((definition) => definition.name)).toEqual([
        'readTerminalInput',
        'readTerminalScrollback',
        'stageTerminalCommand',
        'replaceTerminalInput',
        'runTerminalCommand',
      ]);
      const result = await definitions[4]!.invoke({ command: 'printf hello' });
      expect(result).toContain('sent Enter after the complete command');
    });
  }

  protected static terminalPort(): AgentTerminalToolPort {
    return {
      readTerminalInput: () => ({
        currentInputLine: 'printf brokn',
        recentOutputLines: ['previous output'],
      }),
      readTerminalScrollback: (request) => {
        if (request.range) {
          return {
            lines: Array.from(
              { length: request.range.endLine - request.range.startLine + 1 },
              (_unusedValue, lineIndex) =>
                `line-${request.range!.startLine + lineIndex}`,
            ),
            totalLines: 80,
            startLine: request.range.startLine,
            endLine: request.range.endLine,
          };
        }
        const lineCount = request.lineCount ?? 40;
        return {
          lines: Array.from(
            { length: lineCount },
            (_unusedValue, lineIndex) => `line-${lineIndex + 1}`,
          ),
          totalLines: 80,
          startLine: 80 - lineCount + 1,
          endLine: 80,
        };
      },
      stageTerminalCommand: async (command) => ({ state: 'staged', command }),
      replaceTerminalInput: async (command) => ({ state: 'staged', command }),
      runTerminalCommand: async (command) => ({ state: 'executed', command }),
    };
  }
}

export namespace AgentTerminalToolsTest {
  export const $Class = Static($AgentTerminalToolsTest);
  export let Class = $Class;
}
