import { describe, expect, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { Static } from 'ivue/extras';
import {
  TerminalEmulator,
  type TerminalCell,
  type TerminalShellIntegrationEvent,
} from './TerminalEmulator';

// invariant: Terminal emulator behavior is specified by byte fixtures (src/modules/terminal/terminal.invariants.md)

class $TerminalEmulatorConformance {
  static {
    describe('TerminalEmulator conformance fixtures', () => {
      for (const fixture of this.conformanceFixtures) {
        test(`${fixture.category}: ${fixture.name}`, async () => {
          await this.assertFixture(fixture);
        });
      }
    });

    describe('TerminalEmulator chunk-split conformance', () => {
      for (const fixture of this.CHUNK_SPLIT_FIXTURES) {
        const inputBytes = new TextEncoder().encode(fixture.input);
        for (
          let byteBoundary = 1;
          byteBoundary < inputBytes.length;
          byteBoundary++
        ) {
          test(`${fixture.name}: byte boundary ${byteBoundary}/${inputBytes.length}`, async () => {
            await this.assertFixture({
              ...fixture,
              input: [
                inputBytes.slice(0, byteBoundary),
                inputBytes.slice(byteBoundary),
              ],
            });
          });
        }
      }
    });

    describe('TerminalEmulator recorded OpenTUI fixtures', () => {
      for (const recordedFixture of this.RECORDED_FIXTURES) {
        test(recordedFixture.name, async () => {
          const expectations = (await Bun.file(
            new URL(recordedFixture.expectationsPath, import.meta.url),
          ).json()) as TerminalFixtureExpectations;
          const input: Uint8Array[] = [];
          for (const inputPath of recordedFixture.inputPaths) {
            const base64Input = await Bun.file(
              new URL(inputPath, import.meta.url),
            ).text();
            input.push(
              new Uint8Array(Buffer.from(base64Input.trim(), 'base64')),
            );
          }
          await this.assertFixture({
            category: 'recorded-real',
            name: recordedFixture.name,
            columns: expectations.columns,
            rows: expectations.rows,
            input,
            expectations,
          });
        });
      }
    });
  }

  protected static get conformanceFixtures(): TerminalConformanceFixture[] {
    return [
      {
        category: 'SGR',
        name: '16-color normal and bright foreground and background',
        input: '\x1b[31;44mA\x1b[90;107mB',
        expectations: {
          cursor: { row: 0, column: 2 },
          cells: [
            {
              row: 0,
              column: 0,
              characters: 'A',
              foreground: { mode: 'palette', value: 1 },
              background: { mode: 'palette', value: 4 },
            },
            {
              row: 0,
              column: 1,
              characters: 'B',
              foreground: { mode: 'palette', value: 8 },
              background: { mode: 'palette', value: 15 },
            },
          ],
        },
      },
      {
        category: 'SGR',
        name: '256-color foreground and background',
        input: '\x1b[38;5;202;48;5;17mX',
        expectations: {
          cursor: { row: 0, column: 1 },
          cells: [
            {
              row: 0,
              column: 0,
              characters: 'X',
              foreground: { mode: 'palette', value: 202 },
              background: { mode: 'palette', value: 17 },
            },
          ],
        },
      },
      {
        category: 'SGR',
        name: 'truecolor foreground and background',
        input: '\x1b[38;2;1;2;3;48;2;4;5;6mX',
        expectations: {
          cursor: { row: 0, column: 1 },
          cells: [
            {
              row: 0,
              column: 0,
              characters: 'X',
              foreground: { mode: 'rgb', value: 0x010203 },
              background: { mode: 'rgb', value: 0x040506 },
            },
          ],
        },
      },
      {
        category: 'SGR',
        name: 'all supported attributes',
        input: '\x1b[1;2;3;4;5;7;8;9;53mX',
        expectations: {
          cursor: { row: 0, column: 1 },
          cells: [
            {
              row: 0,
              column: 0,
              characters: 'X',
              attributes: {
                isBold: true,
                isDim: true,
                isItalic: true,
                isUnderline: true,
                isBlink: true,
                isInverse: true,
                isInvisible: true,
                isStrikethrough: true,
                isOverline: true,
              },
            },
          ],
        },
      },
      {
        category: 'SGR',
        name: 'per-attribute resets',
        input: '\x1b[1;2;3;4;5;7;8;9;53mA\x1b[22;23;24;25;27;28;29;55mB',
        expectations: {
          cursor: { row: 0, column: 2 },
          cells: [
            {
              row: 0,
              column: 0,
              characters: 'A',
              attributes: this.allAttributes(true),
            },
            {
              row: 0,
              column: 1,
              characters: 'B',
              attributes: this.allAttributes(false),
            },
          ],
        },
      },
      {
        category: 'SGR',
        name: 'foreground and background resets',
        input: '\x1b[31;44mA\x1b[39mB\x1b[49mC',
        expectations: {
          cursor: { row: 0, column: 3 },
          cells: [
            {
              row: 0,
              column: 0,
              characters: 'A',
              foreground: { mode: 'palette', value: 1 },
              background: { mode: 'palette', value: 4 },
            },
            {
              row: 0,
              column: 1,
              characters: 'B',
              foreground: { mode: 'default', value: -1 },
              background: { mode: 'palette', value: 4 },
            },
            {
              row: 0,
              column: 2,
              characters: 'C',
              foreground: { mode: 'default', value: -1 },
              background: { mode: 'default', value: -1 },
            },
          ],
        },
      },
      {
        category: 'SGR',
        name: 'full reset',
        input: '\x1b[31;44;1;3;4mA\x1b[0mB',
        expectations: {
          cursor: { row: 0, column: 2 },
          cells: [
            {
              row: 0,
              column: 0,
              characters: 'A',
              foreground: { mode: 'palette', value: 1 },
              background: { mode: 'palette', value: 4 },
              attributes: { isBold: true, isItalic: true, isUnderline: true },
            },
            {
              row: 0,
              column: 1,
              characters: 'B',
              foreground: { mode: 'default', value: -1 },
              background: { mode: 'default', value: -1 },
              attributes: this.allAttributes(false),
            },
          ],
        },
      },
      {
        category: 'SGR',
        name: 'attribute run spans parser writes',
        input: ['\x1b[31mA', 'B', '\x1b[0mC'],
        expectations: {
          textRows: { 0: 'ABC' },
          cursor: { row: 0, column: 3 },
          cells: [
            { row: 0, column: 0, foreground: { mode: 'palette', value: 1 } },
            { row: 0, column: 1, foreground: { mode: 'palette', value: 1 } },
            { row: 0, column: 2, foreground: { mode: 'default', value: -1 } },
          ],
        },
      },
      {
        category: 'cursor',
        name: 'CUP addresses row and column',
        columns: 6,
        rows: 4,
        input: '\x1b[3;4HX',
        expectations: {
          textRows: { 2: '   X' },
          cursor: { row: 2, column: 4 },
        },
      },
      {
        category: 'cursor',
        name: 'HVP addresses row and column',
        columns: 6,
        rows: 4,
        input: '\x1b[2;5fX',
        expectations: {
          textRows: { 1: '    X' },
          cursor: { row: 1, column: 5 },
        },
      },
      {
        category: 'cursor',
        name: 'relative moves CUU CUD CUF CUB',
        columns: 6,
        rows: 4,
        input: '\x1b[2;2H\x1b[1B\x1b[2C1\x1b[1A\x1b[1D2',
        expectations: {
          textRows: { 1: '   2', 2: '   1' },
          cursor: { row: 1, column: 4 },
        },
      },
      {
        category: 'cursor',
        name: 'CSI save and restore',
        columns: 6,
        rows: 3,
        input: '\x1b[2;3H\x1b[sX\x1b[3;5HY\x1b[uZ',
        expectations: {
          textRows: { 1: '  Z', 2: '    Y' },
          cursor: { row: 1, column: 3 },
        },
      },
      {
        category: 'cursor',
        name: 'DEC save and restore',
        columns: 6,
        rows: 3,
        input: '\x1b[2;3H\x1b7X\x1b[3;5HY\x1b8Z',
        expectations: {
          textRows: { 1: '  Z', 2: '    Y' },
          cursor: { row: 1, column: 3 },
        },
      },
      {
        category: 'cursor',
        name: 'line wraps at the right edge',
        columns: 5,
        rows: 3,
        input: 'ABCDEF',
        expectations: {
          textRows: { 0: 'ABCDE', 1: 'F' },
          cursor: { row: 1, column: 1 },
        },
      },
      {
        category: 'cursor',
        name: 'origin mode addresses within the scroll region',
        columns: 6,
        rows: 5,
        input: '\x1b[2;4r\x1b[?6h\x1b[1;1HO\x1b[3;2HZ',
        expectations: {
          textRows: { 1: 'O', 3: ' Z' },
          cursor: { row: 3, column: 2 },
          modes: { isOriginModeEnabled: true },
        },
      },
      {
        category: 'erase-scroll',
        name: 'ED 0 erases from cursor through display end',
        columns: 5,
        rows: 3,
        input: '12345\r\n67890\r\nabcde\x1b[2;3H\x1b[0J',
        expectations: {
          textRows: { 0: '12345', 1: '67', 2: '' },
          cursor: { row: 1, column: 2 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'ED 1 erases from display start through cursor',
        columns: 5,
        rows: 3,
        input: '12345\r\n67890\r\nabcde\x1b[2;3H\x1b[1J',
        expectations: {
          textRows: { 0: '', 1: '   90', 2: 'abcde' },
          cursor: { row: 1, column: 2 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'ED 2 erases the display',
        columns: 5,
        rows: 3,
        input: '12345\r\n67890\r\nabcde\x1b[2;3H\x1b[2J',
        expectations: {
          textRows: { 0: '', 1: '', 2: '' },
          cursor: { row: 1, column: 2 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'EL 0 erases from cursor through line end',
        columns: 5,
        rows: 2,
        input: '12345\x1b[1;3H\x1b[0K',
        expectations: {
          textRows: { 0: '12' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'EL 1 erases from line start through cursor',
        columns: 5,
        rows: 2,
        input: '12345\x1b[1;3H\x1b[1K',
        expectations: {
          textRows: { 0: '   45' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'EL 2 erases the line',
        columns: 5,
        rows: 2,
        input: '12345\x1b[1;3H\x1b[2K',
        expectations: {
          textRows: { 0: '' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'DECSTBM scrolls only its region',
        columns: 5,
        rows: 5,
        input: '11111\r\n22222\r\n33333\r\n44444\x1b[2;4r\x1b[4;1H\n',
        expectations: {
          textRows: { 0: '11111', 1: '33333', 2: '44444', 3: '', 4: '' },
          cursor: { row: 3, column: 0 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'IL inserts a blank line',
        columns: 5,
        rows: 4,
        input: '11111\r\n22222\r\n33333\r\n44444\x1b[2;1H\x1b[L',
        expectations: {
          textRows: { 0: '11111', 1: '', 2: '22222', 3: '33333' },
          cursor: { row: 1, column: 0 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'DL deletes a line',
        columns: 5,
        rows: 4,
        input: '11111\r\n22222\r\n33333\r\n44444\x1b[2;1H\x1b[M',
        expectations: {
          textRows: { 0: '11111', 1: '33333', 2: '44444', 3: '' },
          cursor: { row: 1, column: 0 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'ICH inserts blank characters',
        columns: 6,
        rows: 2,
        input: 'ABCDE\x1b[1;3H\x1b[2@X',
        expectations: {
          textRows: { 0: 'ABX CD' },
          cursor: { row: 0, column: 3 },
        },
      },
      {
        category: 'erase-scroll',
        name: 'DCH deletes characters',
        columns: 6,
        rows: 2,
        input: 'ABCDE\x1b[1;2H\x1b[2P',
        expectations: {
          textRows: { 0: 'ADE' },
          cursor: { row: 0, column: 1 },
        },
      },
      {
        category: 'text',
        name: 'CJK grapheme occupies a leading and continuation cell',
        columns: 5,
        rows: 2,
        input: '界',
        expectations: {
          cursor: { row: 0, column: 2 },
          cells: [
            { row: 0, column: 0, characters: '界', width: 2 },
            { row: 0, column: 1, characters: ' ', width: 0 },
          ],
        },
      },
      {
        category: 'text',
        name: 'astral emoji follows the active Unicode width table',
        columns: 5,
        rows: 2,
        input: '😀',
        expectations: {
          cursor: { row: 0, column: 1 },
          cells: [{ row: 0, column: 0, characters: '😀', width: 1 }],
        },
      },
      {
        category: 'text',
        name: 'combining mark joins its base cell',
        columns: 5,
        rows: 2,
        input: 'e\u0301',
        expectations: {
          cursor: { row: 0, column: 1 },
          cells: [{ row: 0, column: 0, characters: 'e\u0301', width: 1 }],
        },
      },
      {
        category: 'OSC-modes',
        name: 'OSC 0 sets the title with BEL termination',
        input: '\x1b]0;Invar title\x07',
        expectations: {
          cursor: { row: 0, column: 0 },
          title: 'Invar title',
        },
      },
      {
        category: 'OSC-modes',
        name: 'OSC 2 sets the title with ST termination',
        input: '\x1b]2;Second title\x1b\\',
        expectations: {
          cursor: { row: 0, column: 0 },
          title: 'Second title',
        },
      },
      {
        category: 'OSC-modes',
        name: 'OSC 7 records the current working directory URI',
        input: '\x1b]7;file://localhost/tmp/invar\x1b\\',
        expectations: {
          cursor: { row: 0, column: 0 },
          currentWorkingDirectory: 'file://localhost/tmp/invar',
        },
      },
      {
        category: 'OSC-modes',
        name: 'OSC 133 A records prompt start',
        input: '\x1b]133;A\x07',
        expectations: {
          cursor: { row: 0, column: 0 },
          shellIntegrationEvents: [
            {
              kind: 'prompt-start',
              marker: 'A',
              exitCode: null,
              command: null,
              currentWorkingDirectory: '',
              currentLine: '',
              cursorColumn: 0,
            },
          ],
        },
      },
      {
        category: 'OSC-modes',
        name: 'OSC 133 B records command start',
        input: '$ \x1b]133;B\x07',
        expectations: {
          textRows: { 0: '$ ' },
          cursor: { row: 0, column: 2 },
          shellIntegrationEvents: [
            {
              kind: 'command-start',
              marker: 'B',
              exitCode: null,
              command: null,
              currentWorkingDirectory: '',
              currentLine: '$ ',
              cursorColumn: 2,
            },
          ],
        },
      },
      {
        category: 'OSC-modes',
        name: 'OSC 133 C records output start and typed command',
        columns: 20,
        input: '$ echo ready\r\n\x1b]133;C\x07',
        expectations: {
          textRows: { 0: '$ echo ready' },
          cursor: { row: 1, column: 0 },
          shellIntegrationEvents: [
            {
              kind: 'output-start',
              marker: 'C',
              exitCode: null,
              command: 'echo ready',
              currentWorkingDirectory: '',
              currentLine: '',
              cursorColumn: 0,
            },
          ],
        },
      },
      {
        category: 'OSC-modes',
        name: 'OSC 133 D records command end and exit code',
        input: 'failed\x1b]133;D;17\x07',
        expectations: {
          textRows: { 0: 'failed' },
          cursor: { row: 0, column: 6 },
          shellIntegrationEvents: [
            {
              kind: 'command-end',
              marker: 'D',
              exitCode: 17,
              command: null,
              currentWorkingDirectory: '',
              currentLine: 'failed',
              cursorColumn: 6,
            },
          ],
        },
      },
      {
        category: 'OSC-modes',
        name: 'DEC 2026 synchronized output markers pair across writes',
        input: ['\x1b[?2026h', 'SYNC', '\x1b[?2026l'],
        expectationsAfterEachWrite: [
          { modes: { isSynchronizedOutputEnabled: true } },
          {
            textRows: { 0: 'SYNC' },
            modes: { isSynchronizedOutputEnabled: true },
          },
          {
            textRows: { 0: 'SYNC' },
            modes: { isSynchronizedOutputEnabled: false },
          },
        ],
        expectations: {
          textRows: { 0: 'SYNC' },
          cursor: { row: 0, column: 4 },
          modes: { isSynchronizedOutputEnabled: false },
        },
      },
      {
        category: 'OSC-modes',
        name: 'bracketed paste and SGR mouse modes enable',
        input: '\x1b[?2004h\x1b[?1000h\x1b[?1006h',
        expectations: {
          cursor: { row: 0, column: 0 },
          modes: {
            isBracketedPasteEnabled: true,
            mouseTrackingMode: 'vt200',
            isSgrMouseEncodingEnabled: true,
          },
        },
      },
      {
        category: 'OSC-modes',
        name: 'bracketed paste and SGR mouse modes reset',
        input:
          '\x1b[?2004h\x1b[?1000h\x1b[?1006h\x1b[?1006l\x1b[?1000l\x1b[?2004l',
        expectations: {
          cursor: { row: 0, column: 0 },
          modes: {
            isBracketedPasteEnabled: false,
            mouseTrackingMode: 'none',
            isSgrMouseEncodingEnabled: false,
          },
        },
      },
      {
        category: 'OSC-modes',
        name: 'alternate screen activates with a fresh grid',
        columns: 8,
        rows: 3,
        input: 'normal\x1b[?1049h\x1b[HALT',
        expectations: {
          textRows: { 0: 'ALT' },
          cursor: { row: 0, column: 3 },
          modes: { isAlternateScreenActive: true },
        },
      },
      {
        category: 'OSC-modes',
        name: 'alternate screen restores the normal grid and cursor',
        columns: 8,
        rows: 3,
        input: 'normal\x1b[?1049h\x1b[HALT\x1b[?1049l',
        expectations: {
          textRows: { 0: 'normal' },
          cursor: { row: 0, column: 6 },
          modes: { isAlternateScreenActive: false },
        },
      },
      {
        category: 'protocol',
        name: 'device status report returns the cursor through onReply',
        columns: 6,
        rows: 3,
        input: '\x1b[2;3H\x1b[6n',
        expectations: {
          textRows: { 0: '', 1: '', 2: '' },
          cursor: { row: 1, column: 2 },
          replies: ['\x1b[2;3R'],
        },
      },
      {
        category: 'recorded-gap',
        name: 'OpenTUI OSC color queries are ignored without renderer colors',
        input: 'A\x1b]10;?\x07\x1b]11;?\x07B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
          replies: [],
        },
      },
      {
        category: 'recorded-gap',
        name: 'OpenTUI XTGETTCAP DCS query is ignored',
        input: 'A\x1bP+q4d73\x1b\\B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
          replies: [],
        },
      },
      {
        category: 'recorded-gap',
        name: 'OpenTUI Kitty keyboard and graphics queries are ignored',
        input: 'A\x1b[?u\x1b_Gi=31337,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
          replies: [],
        },
      },
      {
        category: 'recorded-gap',
        name: 'OpenTUI notification capability and shell integration OSC are ignored',
        input:
          'A' +
          '\x1b]99;i=opentui-notifications:p=?;\x1b\\' +
          '\x1b]1337;Capabilities\x1b\\' +
          '\x1b]66;w=1; \x1b\\' +
          '\x1b]66;s=2; \x1b\\' +
          'B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
          replies: [],
        },
      },
      {
        category: 'recorded-gap',
        name: 'OpenTUI version pixel and modify-other-keys probes are ignored',
        input: 'A\x1b[>0q\x1b[14t\x1b[>4;1mB',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
          replies: [],
        },
      },
      {
        category: 'recorded-gap',
        name: 'OpenTUI private modes 2027 and 2031 are ignored',
        input: 'A\x1b[?2027h\x1b[?2031hB',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
          replies: [],
        },
      },
      {
        category: 'recorded-gap',
        name: 'OpenTUI DECRQM probes pass status replies through without grid changes',
        input:
          'A' +
          '\x1b[?1016$p' +
          '\x1b[?2027$p' +
          '\x1b[?2031$p' +
          '\x1b[?1004$p' +
          '\x1b[?2004$p' +
          '\x1b[?2026$p' +
          'B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
          replies: [
            '\x1b[?1016;2$y',
            '\x1b[?2027;0$y',
            '\x1b[?2031;0$y',
            '\x1b[?1004;2$y',
            '\x1b[?2004;2$y',
            '\x1b[?2026;2$y',
          ],
        },
      },
      {
        category: 'documented-gap',
        name: 'OSC 52 clipboard request is ignored by the grid-only oracle',
        input: 'A\x1b]52;c;SGVsbG8=\x07B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'documented-gap',
        name: 'sixel DCS payload is ignored without a raster addon',
        input: 'A\x1bPq#0;2;100;0;0~\x1b\\B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'documented-gap',
        name: 'Kitty graphics APC payload is ignored by the cell oracle',
        input: 'A\x1b_Gf=32,s=1,v=1;AAAA\x1b\\B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'documented-gap',
        name: 'cursor shape is parsed but not projected into screen cells',
        input: 'A\x1b[6 qB',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'documented-gap',
        name: 'unknown DEC private mode is ignored',
        input: 'A\x1b[?9999hB',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'documented-gap',
        name: 'OSC 8 hyperlink target is not projected but its underline is',
        input: '\x1b]8;;https://example.com\x1b\\A\x1b]8;;\x1b\\B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
          cells: [
            { row: 0, column: 0, attributes: { isUnderline: true } },
            { row: 0, column: 1, attributes: { isUnderline: false } },
          ],
        },
      },
    ];
  }

  protected static get CHUNK_SPLIT_FIXTURES(): TerminalChunkSplitFixture[] {
    return [
      {
        category: 'chunk-split',
        name: 'CSI truecolor SGR',
        input: '\x1b[38;2;1;2;3mX',
        expectations: {
          cursor: { row: 0, column: 1 },
          cells: [
            {
              row: 0,
              column: 0,
              characters: 'X',
              foreground: { mode: 'rgb', value: 0x010203 },
            },
          ],
        },
      },
      {
        category: 'chunk-split',
        name: 'DEC synchronized output private mode',
        input: '\x1b[?2026hX\x1b[?2026l',
        expectations: {
          textRows: { 0: 'X' },
          cursor: { row: 0, column: 1 },
          modes: { isSynchronizedOutputEnabled: false },
        },
      },
      {
        category: 'chunk-split',
        name: 'OSC with BEL terminator',
        input: '\x1b]0;split title\x07',
        expectations: {
          cursor: { row: 0, column: 0 },
          title: 'split title',
        },
      },
      {
        category: 'chunk-split',
        name: 'OSC with ST terminator',
        input: '\x1b]7;file:///split/path\x1b\\',
        expectations: {
          cursor: { row: 0, column: 0 },
          currentWorkingDirectory: 'file:///split/path',
        },
      },
      {
        category: 'chunk-split',
        name: 'OSC 133 A prompt start',
        input: '\x1b]133;A\x07',
        expectations: {
          cursor: { row: 0, column: 0 },
          shellIntegrationEvents: [
            {
              kind: 'prompt-start',
              marker: 'A',
              exitCode: null,
              command: null,
              currentWorkingDirectory: '',
              currentLine: '',
              cursorColumn: 0,
            },
          ],
        },
      },
      {
        category: 'chunk-split',
        name: 'OSC 133 B command start',
        input: '$ \x1b]133;B\x07',
        expectations: {
          textRows: { 0: '$ ' },
          cursor: { row: 0, column: 2 },
          shellIntegrationEvents: [
            {
              kind: 'command-start',
              marker: 'B',
              exitCode: null,
              command: null,
              currentWorkingDirectory: '',
              currentLine: '$ ',
              cursorColumn: 2,
            },
          ],
        },
      },
      {
        category: 'chunk-split',
        name: 'OSC 133 C output start',
        columns: 20,
        input: '$ printf ready\r\n\x1b]133;C\x07',
        expectations: {
          textRows: { 0: '$ printf ready' },
          cursor: { row: 1, column: 0 },
          shellIntegrationEvents: [
            {
              kind: 'output-start',
              marker: 'C',
              exitCode: null,
              command: 'printf ready',
              currentWorkingDirectory: '',
              currentLine: '',
              cursorColumn: 0,
            },
          ],
        },
      },
      {
        category: 'chunk-split',
        name: 'OSC 133 D command end',
        input: 'done\x1b]133;D;23\x07',
        expectations: {
          textRows: { 0: 'done' },
          cursor: { row: 0, column: 4 },
          shellIntegrationEvents: [
            {
              kind: 'command-end',
              marker: 'D',
              exitCode: 23,
              command: null,
              currentWorkingDirectory: '',
              currentLine: 'done',
              cursorColumn: 4,
            },
          ],
        },
      },
      {
        category: 'chunk-split',
        name: 'DCS with ST terminator',
        input: 'A\x1bPq~\x1b\\B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'chunk-split',
        name: 'APC with ST terminator',
        input: 'A\x1b_Ga=d;AAAA\x1b\\B',
        expectations: {
          textRows: { 0: 'AB' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'chunk-split',
        name: 'ESC save and restore',
        columns: 5,
        rows: 2,
        input: 'A\x1b7\x1b[2;2HB\x1b8C',
        expectations: {
          textRows: { 0: 'AC', 1: ' B' },
          cursor: { row: 0, column: 2 },
        },
      },
      {
        category: 'chunk-split',
        name: 'three-byte CJK UTF-8',
        input: '界',
        expectations: {
          cursor: { row: 0, column: 2 },
          cells: [
            { row: 0, column: 0, characters: '界', width: 2 },
            { row: 0, column: 1, characters: ' ', width: 0 },
          ],
        },
      },
      {
        category: 'chunk-split',
        name: 'four-byte astral emoji UTF-8',
        input: '😀',
        expectations: {
          cursor: { row: 0, column: 1 },
          cells: [{ row: 0, column: 0, characters: '😀', width: 1 }],
        },
      },
      {
        category: 'chunk-split',
        name: 'combining mark UTF-8',
        input: 'e\u0301',
        expectations: {
          cursor: { row: 0, column: 1 },
          cells: [{ row: 0, column: 0, characters: 'e\u0301', width: 1 }],
        },
      },
    ];
  }

  protected static get RECORDED_FIXTURES(): TerminalRecordedFixture[] {
    return [
      {
        name: 'OpenTUI boot frame',
        inputPaths: ['./fixtures/terminal-emulator-recorded-boot.base64'],
        expectationsPath:
          './fixtures/terminal-emulator-recorded-boot.expected.json',
      },
      {
        name: 'OpenTUI keypress diff frame',
        inputPaths: [
          './fixtures/terminal-emulator-recorded-boot.base64',
          './fixtures/terminal-emulator-recorded-keypress-diff.base64',
        ],
        expectationsPath:
          './fixtures/terminal-emulator-recorded-keypress-diff.expected.json',
      },
      {
        name: 'OpenTUI light themed frame',
        inputPaths: [
          './fixtures/terminal-emulator-recorded-light-theme.base64',
        ],
        expectationsPath:
          './fixtures/terminal-emulator-recorded-light-theme.expected.json',
      },
      {
        name: 'shimmed Bash OSC 133 command lifecycle',
        inputPaths: ['./fixtures/terminal-observer-recorded-bash.base64'],
        expectationsPath:
          './fixtures/terminal-observer-recorded-bash.expected.json',
      },
    ];
  }

  protected static allAttributes(
    isEnabled: boolean,
  ): TerminalAttributeExpectations {
    return {
      isBold: isEnabled,
      isDim: isEnabled,
      isItalic: isEnabled,
      isUnderline: isEnabled,
      isBlink: isEnabled,
      isInverse: isEnabled,
      isInvisible: isEnabled,
      isStrikethrough: isEnabled,
      isOverline: isEnabled,
    };
  }

  protected static async assertFixture(
    fixture: TerminalConformanceFixture,
  ): Promise<void> {
    const emulator = new TerminalEmulator.Class(
      fixture.columns ?? fixture.expectations.columns ?? 10,
      fixture.rows ?? fixture.expectations.rows ?? 4,
    );
    const replies: string[] = [];
    const shellIntegrationEvents: TerminalShellIntegrationEvent[] = [];
    emulator.onReply((reply) => replies.push(reply));
    emulator.onShellIntegrationEvent((event) =>
      shellIntegrationEvents.push(event),
    );
    const inputChunks = Array.isArray(fixture.input)
      ? fixture.input
      : [fixture.input];
    try {
      for (let writeIndex = 0; writeIndex < inputChunks.length; writeIndex++) {
        emulator.write(inputChunks[writeIndex]!);
        await emulator.flush();
        const intermediateExpectations =
          fixture.expectationsAfterEachWrite?.[writeIndex];
        if (intermediateExpectations) {
          this.assertExpectations(
            emulator,
            intermediateExpectations,
            replies,
            shellIntegrationEvents,
          );
        }
      }
      this.assertExpectations(
        emulator,
        fixture.expectations,
        replies,
        shellIntegrationEvents,
      );
    } finally {
      emulator.dispose();
    }
  }

  protected static assertExpectations(
    emulator: TerminalEmulator.Model,
    expectations: TerminalFixtureExpectations,
    replies: readonly string[],
    shellIntegrationEvents: readonly TerminalShellIntegrationEvent[],
  ): void {
    if (expectations.columns !== undefined)
      expect(emulator.columns).toBe(expectations.columns);
    if (expectations.rows !== undefined)
      expect(emulator.rows).toBe(expectations.rows);
    if (expectations.cursor) {
      expect({
        row: emulator.cursorRow,
        column: emulator.cursorColumn,
      }).toEqual(expectations.cursor);
    }
    if (expectations.title !== undefined)
      expect(emulator.title).toBe(expectations.title);
    if (expectations.currentWorkingDirectory !== undefined) {
      expect(emulator.currentWorkingDirectory).toBe(
        expectations.currentWorkingDirectory,
      );
    }
    if (expectations.replies !== undefined)
      expect(replies).toEqual(expectations.replies);
    if (expectations.shellIntegrationEvents !== undefined) {
      expect(shellIntegrationEvents).toEqual(
        expectations.shellIntegrationEvents,
      );
      expect(emulator.lastShellIntegrationEvent).toEqual(
        expectations.shellIntegrationEvents.at(-1) ?? null,
      );
    }
    if (expectations.textRows) {
      for (const [rowTextIndex, expectedRowText] of Object.entries(
        expectations.textRows,
      )) {
        const row = Number(rowTextIndex);
        expect(this.rowText(emulator, row)).toBe(
          expectedRowText.padEnd(emulator.columns),
        );
      }
    }
    for (const expectedCell of expectations.cells ?? []) {
      const actualCell = emulator.cell(expectedCell.row, expectedCell.column);
      expect(actualCell).not.toBeNull();
      this.assertCell(actualCell!, expectedCell);
    }
    if (expectations.modes?.isBracketedPasteEnabled !== undefined) {
      expect(emulator.isBracketedPasteEnabled).toBe(
        expectations.modes.isBracketedPasteEnabled,
      );
    }
    if (expectations.modes?.mouseTrackingMode !== undefined) {
      expect(emulator.mouseTrackingMode).toBe(
        expectations.modes.mouseTrackingMode,
      );
    }
    if (expectations.modes?.isSgrMouseEncodingEnabled !== undefined) {
      expect(emulator.isSgrMouseEncodingEnabled).toBe(
        expectations.modes.isSgrMouseEncodingEnabled,
      );
    }
    if (expectations.modes?.isOriginModeEnabled !== undefined) {
      expect(emulator.isOriginModeEnabled).toBe(
        expectations.modes.isOriginModeEnabled,
      );
    }
    if (expectations.modes?.isSynchronizedOutputEnabled !== undefined) {
      expect(emulator.isSynchronizedOutputEnabled).toBe(
        expectations.modes.isSynchronizedOutputEnabled,
      );
    }
    if (expectations.modes?.isAlternateScreenActive !== undefined) {
      expect(emulator.isAlternateScreenActive).toBe(
        expectations.modes.isAlternateScreenActive,
      );
    }
  }

  protected static rowText(
    emulator: TerminalEmulator.Model,
    row: number,
  ): string {
    let text = '';
    for (let column = 0; column < emulator.columns; column++) {
      text += emulator.cell(row, column)?.characters ?? ' ';
    }
    return text;
  }

  protected static assertCell(
    actualCell: TerminalCell,
    expectedCell: TerminalCellExpectation,
  ): void {
    if (expectedCell.characters !== undefined) {
      expect(actualCell.characters).toBe(expectedCell.characters);
    }
    if (expectedCell.width !== undefined)
      expect(actualCell.width).toBe(expectedCell.width);
    if (expectedCell.foreground) {
      this.assertColor(actualCell, 'foreground', expectedCell.foreground);
    }
    if (expectedCell.background) {
      this.assertColor(actualCell, 'background', expectedCell.background);
    }
    for (const [attributeName, expectedValue] of Object.entries(
      expectedCell.attributes ?? {},
    )) {
      expect(
        actualCell[attributeName as keyof TerminalAttributeExpectations],
      ).toBe(expectedValue);
    }
  }

  protected static assertColor(
    actualCell: TerminalCell,
    layer: 'foreground' | 'background',
    expectedColor: TerminalColorExpectation,
  ): void {
    const isForeground = layer === 'foreground';
    const actualValue = isForeground
      ? actualCell.foreground
      : actualCell.background;
    const isDefault = isForeground
      ? actualCell.isForegroundDefault
      : actualCell.isBackgroundDefault;
    const isPalette = isForeground
      ? actualCell.isForegroundPalette
      : actualCell.isBackgroundPalette;
    const isRgb = isForeground
      ? actualCell.isForegroundRgb
      : actualCell.isBackgroundRgb;
    expect(actualValue).toBe(expectedColor.value);
    expect(isDefault).toBe(expectedColor.mode === 'default');
    expect(isPalette).toBe(expectedColor.mode === 'palette');
    expect(isRgb).toBe(expectedColor.mode === 'rgb');
  }
}

export namespace TerminalEmulatorConformance {
  export const $Class = $TerminalEmulatorConformance;
  export let Class = Static($Class);
}

type TerminalAttributeExpectations = Partial<
  Pick<
    TerminalCell,
    | 'isBold'
    | 'isDim'
    | 'isItalic'
    | 'isUnderline'
    | 'isBlink'
    | 'isInverse'
    | 'isInvisible'
    | 'isStrikethrough'
    | 'isOverline'
  >
>;

interface TerminalColorExpectation {
  mode: 'default' | 'palette' | 'rgb';
  value: number;
}

interface TerminalCellExpectation {
  row: number;
  column: number;
  characters?: string;
  width?: number;
  foreground?: TerminalColorExpectation;
  background?: TerminalColorExpectation;
  attributes?: TerminalAttributeExpectations;
}

interface TerminalModeExpectations {
  isBracketedPasteEnabled?: boolean;
  mouseTrackingMode?: 'none' | 'x10' | 'vt200' | 'drag' | 'any';
  isSgrMouseEncodingEnabled?: boolean;
  isOriginModeEnabled?: boolean;
  isSynchronizedOutputEnabled?: boolean;
  isAlternateScreenActive?: boolean;
}

interface TerminalFixtureExpectations {
  columns?: number;
  rows?: number;
  textRows?: Record<number, string>;
  cursor?: { row: number; column: number };
  cells?: TerminalCellExpectation[];
  title?: string;
  currentWorkingDirectory?: string;
  modes?: TerminalModeExpectations;
  replies?: string[];
  shellIntegrationEvents?: TerminalShellIntegrationEvent[];
}

interface TerminalConformanceFixture {
  category: string;
  name: string;
  columns?: number;
  rows?: number;
  input: string | Uint8Array | ReadonlyArray<string | Uint8Array>;
  expectations: TerminalFixtureExpectations;
  expectationsAfterEachWrite?: TerminalFixtureExpectations[];
}

interface TerminalChunkSplitFixture extends Omit<
  TerminalConformanceFixture,
  'input'
> {
  input: string;
}

interface TerminalRecordedFixture {
  name: string;
  inputPaths: string[];
  expectationsPath: string;
}
