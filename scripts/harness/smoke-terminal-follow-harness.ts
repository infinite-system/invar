#!/usr/bin/env bun
// The real echo-agent + Bash path verifies live terminal-follow policy, footer controls, scrollback
// reach, and redaction through the public tool boundary.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import {
  mkdirSync as makeDirectorySync,
  mkdtempSync as makeTemporaryDirectorySync,
  writeFileSync,
} from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

class $SmokeTerminalFollowHarness {
  protected static repositoryRoot = process.cwd();
  protected static homeDirectory = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'invar-terminal-follow-harness-'),
  );
  protected static statusPath = join(this.homeDirectory, 'status.json');
  protected static driver: PtyTestDriver.Model | null = null;

  static {
    void this.run().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }

  protected static async run(): Promise<void> {
    this.prepareSettings();
    const driver = new PtyTestDriver.Class({
      workspaceRoot: join(this.repositoryRoot, 'fixtures'),
      repositoryRoot: this.repositoryRoot,
      columns: 160,
      rows: 44,
      homeDirectory: this.homeDirectory,
      environment: {
        TUI_STATUS_PATH: this.statusPath,
        INVAR_AGENT_BACKEND: 'echo',
      },
    });
    this.driver = driver;

    try {
      console.log('== harness terminal-follow: boot real Bash + echo agent ==');
      await this.awaitStatus(
        'application is ready with the configured follow mode',
        (status) =>
          status.ready === true && status.terminalFollowMode === 'follow-all',
      );
      driver.sendKeys('F9');
      await this.awaitStatus(
        'F9 opens the terminal and agent side by side',
        (status) =>
          Array.isArray(status.panelCellIds) &&
          status.panelCellIds.join(',') === 'agent,terminal' &&
          status.panelActiveContent === 'agent',
      );

      console.log(
        '== harness terminal-follow: follow-all responds to both outcomes ==',
      );
      await this.runTerminalCommand(
        "printf 'FOLLOW_ALL_PASS\\n'",
        true,
        'follow-all responds to a passing command',
      );
      await this.runTerminalCommand(
        "printf 'FOLLOW_ALL_FAIL\\n'; false",
        true,
        'follow-all responds to a failing command',
      );

      console.log(
        '== harness terminal-follow: keyboard cycles through all live modes ==',
      );
      await this.cycleModeByKeyboard(
        'on-error',
        'F6 changes the live footer mode to on-error',
      );
      await this.runTerminalCommand(
        "printf 'ON_ERROR_PASS\\n'",
        false,
        'on-error stays silent for a passing command',
      );
      await this.runTerminalCommand(
        "printf 'ON_ERROR_FAIL\\n'; false",
        true,
        'on-error responds to a known nonzero Bash exit',
      );

      await this.cycleModeByKeyboard(
        'on-request',
        'F6 changes the live footer mode to on-request',
      );
      await this.runTerminalCommand(
        "printf 'ON_REQUEST_PASS\\n'",
        false,
        'on-request stays silent for a passing command',
      );
      await this.runTerminalCommand(
        "printf 'ON_REQUEST_FAIL\\n'; false",
        false,
        'on-request stays silent for a failing command',
      );
      await this.sendAgentPrompt(
        'Summarize the terminal context now',
        (status) =>
          String(status.agentLastAssistantText).includes('ON_REQUEST_PASS') &&
          String(status.agentLastAssistantText).includes('ON_REQUEST_FAIL'),
        'the subsequent user question receives both silent terminal observations',
      );

      await this.cycleModeByKeyboard(
        'off',
        'F6 changes the live footer mode to off',
      );
      await this.runTerminalCommand(
        "printf 'OFF_PASS\\n'",
        false,
        'off delivers no passing observation to the agent',
      );
      await this.runTerminalCommand(
        "printf 'OFF_FAIL\\n'; false",
        false,
        'off delivers no failing observation to the agent',
      );

      console.log(
        '== harness terminal-follow: footer mouse and palette share the action ==',
      );
      await this.focusPanelCell(
        'agent',
        'agent footer is focused for pointer cycling',
      );
      await driver.awaitQuiescence();
      HarnessSmoke.Class.pass(
        'agent footer repaint is settled before pointer discovery',
      );
      HarnessSmoke.Class.clickText(driver, driver.snapshot(), 'follow: off', 2);
      await this.awaitStatus(
        'clicking the discovered footer text cycles off to follow',
        (status) => status.terminalFollowMode === 'follow-all',
      );
      await this.clickEditorToBlurPanel();
      driver.sendKeys('F1');
      await this.awaitStatus(
        'F1 opens the command palette outside the focused panel',
        (status) => status.paletteOpen === true,
      );
      driver.sendText('terminal follow mode');
      await this.awaitStatus(
        'the palette finds the terminal-follow command',
        (status) =>
          status.paletteOpen === true && Number(status.paletteMatches) === 1,
      );
      driver.sendKeys('Enter');
      await this.awaitStatus(
        'the palette command runs the same cycle action',
        (status) =>
          status.paletteOpen === false &&
          status.terminalFollowMode === 'on-error',
      );

      console.log(
        '== harness terminal-follow: full scrollback read + shared redaction ==',
      );
      await this.runTerminalCommand(
        "for number in $(seq 1 70); do printf 'scroll-%02d\\n' \"$number\"; done; printf 'API_TOKEN=fixture-token\\nNORMAL=value\\nPassword: hunter2\\n'",
        false,
        'on-error remains silent while Bash creates more than forty retained lines',
      );
      const toolBaselineStatus = await this.awaitStatus(
        'terminal observation state is published before the explicit read-tool request',
        (status) => typeof status.terminalObservedEventCount === 'number',
      );
      const previousToolResult = String(toolBaselineStatus.agentLastToolResult);
      await this.focusPanelCell(
        'agent',
        'agent composer is focused for the read-tool request',
      );
      driver.sendText('terminal-tools:scrollback:55');
      driver.sendKeys('Enter');
      const toolStatus = await this.awaitStatus(
        'the echo backend completes the explicit 55-line scrollback tool call',
        (status) =>
          typeof status.agentLastToolResult === 'string' &&
          status.agentLastToolResult !== previousToolResult,
      );
      const toolSnapshot = JSON.parse(
        String(toolStatus.agentLastToolResult),
      ) as ScrollbackToolSnapshot;
      HarnessSmoke.Class.requireCondition(
        toolSnapshot.lines.length === 55,
        'readTerminalScrollback returns exactly 55 requested lines beyond the default',
      );
      const joinedToolLines = toolSnapshot.lines.join('\n');
      HarnessSmoke.Class.requireCondition(
        joinedToolLines.includes('[REDACTED]') &&
          !joinedToolLines.includes('fixture-token') &&
          !joinedToolLines.includes('hunter2'),
        'secret assignment and password values are redacted through the tool',
      );
      HarnessSmoke.Class.requireCondition(
        joinedToolLines.includes('NORMAL=value'),
        'ordinary output survives the same redaction path unchanged',
      );

      driver.sendKeys('Control+q');
      console.log('smoke-terminal-follow-harness: ALL-PASS');
    } finally {
      await driver.dispose();
      HarnessSmoke.Class.pass('terminal-follow harness process disposed');
      await HarnessSmoke.Class.removeTemporaryDirectory(this.homeDirectory);
      this.driver = null;
    }
    await this.runHeuristicOnErrorScenario();
  }

  protected static prepareSettings(): void {
    const settingsDirectory = join(this.homeDirectory, '.config', 'invar');
    makeDirectorySync(settingsDirectory, { recursive: true });
    writeFileSync(
      join(settingsDirectory, 'settings.json'),
      `${JSON.stringify({
        glyphMode: 'unicode',
        agentTerminalFollowMode: 'follow-all',
      })}\n`,
    );
  }

  protected static async runHeuristicOnErrorScenario(): Promise<void> {
    this.homeDirectory = makeTemporaryDirectorySync(
      join(temporaryDirectory(), 'invar-terminal-follow-heuristic-harness-'),
    );
    this.statusPath = join(this.homeDirectory, 'status.json');
    const settingsDirectory = join(this.homeDirectory, '.config', 'invar');
    makeDirectorySync(settingsDirectory, { recursive: true });
    writeFileSync(
      join(settingsDirectory, 'settings.json'),
      `${JSON.stringify({
        glyphMode: 'unicode',
        agentTerminalFollowMode: 'on-error',
        terminalCleanPrompt: false,
      })}\n`,
    );
    writeFileSync(
      join(this.homeDirectory, '.bashrc'),
      "PROMPT_COMMAND=''\nPS0=''\nPS1='$ '\n",
    );
    const driver = new PtyTestDriver.Class({
      workspaceRoot: join(this.repositoryRoot, 'fixtures'),
      repositoryRoot: this.repositoryRoot,
      columns: 160,
      rows: 44,
      homeDirectory: this.homeDirectory,
      environment: {
        TUI_STATUS_PATH: this.statusPath,
        INVAR_AGENT_BACKEND: 'echo',
        SHELL: '/bin/bash',
      },
    });
    this.driver = driver;
    try {
      console.log(
        '== harness terminal-follow: heuristic boundary is never an error trigger ==',
      );
      await this.awaitStatus(
        'plain Bash is ready without shell-integration markers',
        (status) =>
          status.ready === true && status.terminalFollowMode === 'on-error',
      );
      driver.sendKeys('F9');
      await this.awaitStatus(
        'plain Bash and echo agent open side by side',
        (status) =>
          Array.isArray(status.panelCellIds) &&
          status.panelCellIds.join(',') === 'agent,terminal',
      );
      await this.runTerminalCommand(
        "printf 'HEURISTIC_FAIL\\n'; false",
        false,
        'on-error never responds to a heuristic-boundary command',
      );
      await this.awaitStatus(
        'the silent failing command is published as a heuristic-boundary observation',
        (status) => status.terminalLastObservedBoundarySource === 'heuristic',
      );
      HarnessSmoke.Class.pass(
        'the silent failing command was observed specifically at a heuristic boundary',
      );
      driver.sendKeys('Control+q');
    } finally {
      await driver.dispose();
      HarnessSmoke.Class.pass('heuristic-boundary harness process disposed');
      await HarnessSmoke.Class.removeTemporaryDirectory(this.homeDirectory);
      this.driver = null;
    }
  }

  protected static async runTerminalCommand(
    command: string,
    expectsAgentResponse: boolean,
    label: string,
  ): Promise<void> {
    const statusBeforeCommand = await this.awaitStatus(
      `terminal and assistant counters are published before ${label}`,
      (status) =>
        typeof status.terminalObservedEventCount === 'number' &&
        typeof status.agentAssistantEntryCount === 'number',
    );
    const observedEventCount = Number(
      statusBeforeCommand.terminalObservedEventCount,
    );
    const assistantEntryCount = Number(
      statusBeforeCommand.agentAssistantEntryCount,
    );
    await this.focusPanelCell(
      'terminal',
      `terminal is focused before ${label}`,
    );
    if (expectsAgentResponse) {
      this.requiredDriver.sendText(command);
      this.requiredDriver.sendKeys('Enter');
    } else {
      const commandBaselineSnapshot = this.requiredDriver.snapshot();
      await this.requiredDriver.assertContentInvariantAcrossAction({
        invariantRegion: {
          startRow: Math.floor(commandBaselineSnapshot.rows / 2),
          endRowExclusive: commandBaselineSnapshot.rows - 1,
          startColumn: 0,
          endColumnExclusive: Math.floor(commandBaselineSnapshot.columns / 2),
        },
        changedRegion: {
          startRow: Math.floor(commandBaselineSnapshot.rows / 2),
          endRowExclusive: commandBaselineSnapshot.rows - 1,
          startColumn: Math.floor(commandBaselineSnapshot.columns / 2),
          endColumnExclusive: commandBaselineSnapshot.columns,
        },
        actionDescription: `${label} changes only the terminal pane`,
        performAction: () => {
          this.requiredDriver.sendText(command);
          this.requiredDriver.sendKeys('Enter');
        },
      });
    }
    const commandStatus = await this.awaitStatus(
      `the real Bash command boundary is observed for ${label}`,
      (status) =>
        Number(status.terminalObservedEventCount) > observedEventCount &&
        (!expectsAgentResponse ||
          Number(status.agentAssistantEntryCount) > assistantEntryCount),
    );
    if (expectsAgentResponse) {
      HarnessSmoke.Class.requireCondition(
        Number(commandStatus.agentAssistantEntryCount) > assistantEntryCount,
        label,
      );
      return;
    }
    await this.awaitStatus(
      `the assistant count remains unchanged after the terminal action for ${label}`,
      (status) =>
        Number(status.agentAssistantEntryCount) === assistantEntryCount,
    );
    HarnessSmoke.Class.pass(label);
  }

  protected static async cycleModeByKeyboard(
    expectedMode: string,
    label: string,
  ): Promise<void> {
    await this.focusPanelCell(
      'agent',
      `agent is focused before keyboard mode cycle to ${expectedMode}`,
    );
    this.requiredDriver.sendKeys('F6');
    await this.awaitStatus(
      label,
      (status) => status.terminalFollowMode === expectedMode,
    );
  }

  protected static async sendAgentPrompt(
    prompt: string,
    predicate: (status: StatusSnapshot) => boolean,
    label: string,
  ): Promise<void> {
    const promptBaselineStatus = await this.awaitStatus(
      `the assistant count is published before ${label}`,
      (status) => typeof status.agentAssistantEntryCount === 'number',
    );
    const previousAssistantEntryCount = Number(
      promptBaselineStatus.agentAssistantEntryCount,
    );
    await this.focusPanelCell('agent', `agent is focused before ${label}`);
    this.requiredDriver.sendText(prompt);
    this.requiredDriver.sendKeys('Enter');
    await this.awaitStatus(
      label,
      (status) =>
        Number(status.agentAssistantEntryCount) > previousAssistantEntryCount &&
        predicate(status),
    );
  }

  protected static async focusPanelCell(
    contentIdentifier: 'terminal' | 'agent',
    label: string,
  ): Promise<void> {
    const status = await this.awaitStatus(
      `panel cell geometry is published before ${label}`,
      (candidate) => {
        const candidateLayoutSlots = candidate.layoutSlots as
          | Record<string, { left: number; top: number; height: number }>
          | undefined;
        return (
          Array.isArray(candidate.panelCellIds) &&
          candidate.panelCellIds.includes(contentIdentifier) &&
          Array.isArray(candidate.panelCellColumns) &&
          candidateLayoutSlots?.bottomPanel !== undefined
        );
      },
    );
    const contentIdentifiers = status.panelCellIds;
    const cellColumns = status.panelCellColumns;
    const layoutSlots = status.layoutSlots as
      Record<string, { left: number; top: number; height: number }> | undefined;
    if (!Array.isArray(contentIdentifiers) || !Array.isArray(cellColumns)) {
      throw new Error('Panel cell geometry is unavailable from status.');
    }
    const contentIndex = contentIdentifiers.indexOf(contentIdentifier);
    if (contentIndex < 0) {
      throw new Error(`Panel cell is not visible: ${contentIdentifier}`);
    }
    const panel = layoutSlots?.bottomPanel;
    if (!panel)
      throw new Error('Bottom-panel geometry is unavailable from status.');
    let column = panel.left + 2;
    for (
      let precedingIndex = 0;
      precedingIndex < contentIndex;
      precedingIndex += 1
    ) {
      column += Number(cellColumns[precedingIndex]) + 1;
    }
    const row = panel.top + Math.max(1, Math.floor(panel.height / 2));
    this.requiredDriver.sendMouse({
      kind: 'press',
      column,
      row,
      button: 'left',
    });
    this.requiredDriver.sendMouse({
      kind: 'release',
      column,
      row,
      button: 'left',
    });
    await this.awaitStatus(
      label,
      (candidate) =>
        candidate.panelActiveContent === contentIdentifier &&
        candidate.panelFocusedIndex === contentIndex,
    );
  }

  protected static async clickEditorToBlurPanel(): Promise<void> {
    const status = await this.awaitStatus(
      'editor geometry is published before blurring the bottom panel',
      (candidate) => {
        const candidateLayoutSlots = candidate.layoutSlots as
          Record<string, { editorCenter?: unknown }> | undefined;
        return candidateLayoutSlots?.editorCenter !== undefined;
      },
    );
    const layoutSlots = status.layoutSlots as
      | Record<
          string,
          {
            left: number;
            top: number;
            width: number;
            height: number;
          }
        >
      | undefined;
    const editor = layoutSlots?.editorCenter;
    if (!editor) throw new Error('Editor geometry is unavailable from status.');
    const column = editor.left + Math.max(1, Math.floor(editor.width / 2));
    const row = editor.top + Math.max(1, Math.floor(editor.height / 3));
    this.requiredDriver.sendMouse({
      kind: 'press',
      column,
      row,
      button: 'left',
    });
    this.requiredDriver.sendMouse({
      kind: 'release',
      column,
      row,
      button: 'left',
    });
    await this.awaitStatus(
      'the status-derived editor click blurs the bottom panel',
      (candidate) => candidate.terminalFocused === false,
    );
  }

  protected static async awaitStatus(
    label: string,
    predicate: (status: StatusSnapshot) => boolean,
  ): Promise<StatusSnapshot> {
    const status = await HarnessSmoke.Class.awaitStatus(
      this.requiredDriver,
      this.statusPath,
      label,
      predicate,
      20_000,
    );
    HarnessSmoke.Class.pass(label);
    return status;
  }

  protected static get requiredDriver(): PtyTestDriver.Model {
    if (!this.driver) throw new Error('Terminal-follow driver is not running.');
    return this.driver;
  }
}

export namespace SmokeTerminalFollowHarness {
  export const $Class = $SmokeTerminalFollowHarness;
  export const Class = $Class;
}

interface ScrollbackToolSnapshot {
  readonly lines: readonly string[];
  readonly totalLines: number;
  readonly startLine: number;
  readonly endLine: number;
}
