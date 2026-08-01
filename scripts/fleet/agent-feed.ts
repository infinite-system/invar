#!/usr/bin/env bun
/**
 * agent-feed.ts — a clean, scrollable monitoring feed for a running codex task.
 *
 * Reads the codex rollout jsonl (structured session log), filters it to the
 * narrative channel (agent messages, user steers, lifecycle + patch markers),
 * and prints it as plain text. Tool calls, reasoning dumps, and token counts
 * are stripped — this is the monitor's view, not the debugger's.
 *
 * Usage:
 *   bun scripts/fleet/agent-feed.ts <task-number-or-slug>          # print feed
 *   bun scripts/fleet/agent-feed.ts <task-number-or-slug> --follow # live tail
 *   bun scripts/fleet/agent-feed.ts --self-test
 *
 * Matching: the rollout whose session_meta.cwd ends with the task's worktree
 * directory name (newest wins when several match).
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SESSIONS_ROOT = join(homedir(), '.codex', 'sessions');
const WORKTREES_ROOT = join(import.meta.dir, '..', '..', '.invar', 'worktrees');

function listRollouts(root: string): string[] {
  const results: string[] = [];
  const walk = (directory: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry);
      let info;
      try {
        info = statSync(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) walk(full);
      else if (entry.startsWith('rollout-') && entry.endsWith('.jsonl'))
        results.push(full);
    }
  };
  walk(root);
  return results.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

function rolloutCwd(path: string): string | null {
  try {
    const firstLines = readFileSync(path, 'utf8').split('\n').slice(0, 5);
    for (const line of firstLines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      const cwd =
        event?.payload?.cwd ?? event?.payload?.session_meta?.cwd ?? event?.cwd;
      if (typeof cwd === 'string') return cwd;
    }
  } catch {
    /* unreadable line — not this file's problem */
  }
  return null;
}

function resolveWorktreeName(taskArgument: string): string | null {
  if (!existsSync(WORKTREES_ROOT)) return null;
  const entries = readdirSync(WORKTREES_ROOT);
  const exact = entries.find((entry) => entry === taskArgument);
  if (exact) return exact;
  const byNumber = entries.find((entry) =>
    entry.startsWith(`${taskArgument}-`),
  );
  if (byNumber) return byNumber;
  const bySlug = entries.find((entry) => entry.includes(taskArgument));
  return bySlug ?? null;
}

function findRollout(worktreeName: string): string | null {
  const matches = listRollouts(SESSIONS_ROOT).filter((path) => {
    const cwd = rolloutCwd(path);
    return (
      cwd !== null && (cwd.endsWith(`/${worktreeName}`) || cwd === worktreeName)
    );
  });
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

type FeedLine = { stamp: string; text: string; compact?: boolean };

function renderEvent(rawLine: string): FeedLine | null {
  let event;
  try {
    event = JSON.parse(rawLine);
  } catch {
    return null;
  }
  const payload = event?.payload ?? {};
  const stamp = (event?.timestamp ?? '').slice(11, 19);
  switch (payload.type) {
    case 'agent_message':
      return { stamp, text: `agent │ ${payload.message}` };
    case 'user_message':
      return {
        stamp,
        text: `steer │ ${String(payload.message ?? '').slice(0, 400)}`,
      };
    case 'task_started':
      return { stamp, text: '──── task started ────' };
    case 'patch_apply_end': {
      const status = payload.success === false ? 'FAILED' : '';
      const files = String(payload.stdout ?? '')
        .split('\n')
        .map((line) => line.match(/^([AMD]) (.+)$/))
        .filter((match) => match !== null)
        .map(
          (match) =>
            `${match![1]} ${match![2].replace(/^.*\/\.invar\/worktrees\/[^/]+\//, '')}`,
        );
      const summary = files.length > 0 ? files.join('  ·  ') : 'applied';
      return {
        stamp,
        text: `patch │ ${status ? status + ' ' : ''}${summary}`,
        compact: true,
      };
    }
    case 'context_compacted':
      return { stamp, text: '──── context compacted ────' };
    default:
      return null;
  }
}

function renderFeed(
  rolloutPath: string,
  fromByte: number,
): { output: string; nextByte: number } {
  const content = readFileSync(rolloutPath, 'utf8');
  const fresh = content.slice(fromByte);
  const lastNewline = fresh.lastIndexOf('\n');
  if (lastNewline < 0) return { output: '', nextByte: fromByte };
  const complete = fresh.slice(0, lastNewline);
  const blocks: string[] = [];
  let previousCompact = false;
  for (const rawLine of complete.split('\n')) {
    if (!rawLine.trim()) continue;
    const rendered = renderEvent(rawLine);
    if (!rendered) continue;
    const separator =
      blocks.length === 0
        ? ''
        : rendered.compact && previousCompact
          ? '\n'
          : '\n\n';
    blocks.push(`${separator}${rendered.stamp} ${rendered.text}`);
    previousCompact = rendered.compact === true;
  }
  return { output: blocks.join(''), nextByte: fromByte + lastNewline + 1 };
}

function selfTest(): void {
  const sample = [
    JSON.stringify({
      timestamp: '2026-08-01T03:05:12.000Z',
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'hello narrative' },
    }),
    JSON.stringify({
      timestamp: '2026-08-01T03:05:13.000Z',
      type: 'response_item',
      payload: { type: 'custom_tool_call', name: 'shell' },
    }),
    JSON.stringify({
      timestamp: '2026-08-01T03:05:14.000Z',
      type: 'event_msg',
      payload: { type: 'token_count', total: 5 },
    }),
    JSON.stringify({
      timestamp: '2026-08-01T03:05:15.000Z',
      type: 'event_msg',
      payload: { type: 'patch_apply_end', success: true },
    }),
  ];
  const rendered = sample.map(renderEvent).filter((line) => line !== null);
  // PRESENT arm: narrative and patch lines render.
  if (rendered.length !== 2)
    throw new Error(
      `self-test: expected 2 rendered lines, got ${rendered.length}`,
    );
  if (!rendered[0]!.text.includes('hello narrative'))
    throw new Error('self-test: agent message lost');
  // ABSENT arm: tool call and token count are stripped.
  if (
    rendered.some(
      (line) => line!.text.includes('shell') || line!.text.includes('token'),
    )
  ) {
    throw new Error('self-test: noise leaked into the feed');
  }
  console.log('self-test: OK (present arm renders, absent arm strips)');
}

const argument = process.argv[2];
if (!argument || argument === '--help') {
  console.log(
    'usage: bun scripts/fleet/agent-feed.ts <task-number-or-slug> [--follow] | --self-test',
  );
  process.exit(argument ? 0 : 2);
}
if (argument === '--self-test') {
  selfTest();
  process.exit(0);
}

const worktreeName = resolveWorktreeName(argument);
if (!worktreeName) {
  console.error(
    `agent-feed: no worktree matches '${argument}' under ${WORKTREES_ROOT}`,
  );
  process.exit(2);
}
const rollout = findRollout(worktreeName);
if (!rollout) {
  console.error(
    `agent-feed: no codex rollout found with cwd ending in '${worktreeName}'`,
  );
  process.exit(2);
}

console.log(`# feed for ${worktreeName}\n# source: ${rollout}\n`);
let cursor = 0;
const first = renderFeed(rollout, cursor);
if (first.output) console.log(first.output);
cursor = first.nextByte;

if (process.argv.includes('--follow')) {
  setInterval(() => {
    const next = renderFeed(rollout, cursor);
    if (next.output) console.log('\n' + next.output);
    cursor = next.nextByte;
  }, 2000);
}
