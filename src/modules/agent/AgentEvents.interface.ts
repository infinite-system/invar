// The agent event vocabulary — the honest minimal shape of "what an agent session emits". An agent is
// NOT a screen (ANSI cells you can only replay); it is a STREAM OF STRUCTURED EVENTS the host can
// project into any surface. This file defines that stream's types (`AgentEvent`) and the append-only
// transcript those events fold into (`TranscriptEntry`). Every backend — the scripted MockAgentBackend,
// the real CliStreamBackend later — speaks exactly this vocabulary, and every surface (pane renderer,
// badges, persistence) is a pure projection of the transcript. No ANSI, ever.
//
// invariant: An agent session is a structured event stream, not a screen (src/modules/agent/agent.invariants.md)
// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)
import type { ResolvedEngine } from './AgentProviderRegistry';

/** The structured event vocabulary emitted by an AgentBackend. */
export interface AgentEvents {
  /** The session began accepting turns. */
  'session-start': { readonly kind: 'session-start' };
  /** A streaming chunk of assistant text. Consecutive deltas concatenate into one assistant turn. */
  'text-delta': { readonly kind: 'text-delta'; readonly text: string };
  /** The assistant requested a tool call. `id` correlates with the matching `tool-result`. */
  'tool-use': {
    readonly kind: 'tool-use';
    readonly id: string;
    readonly name: string;
    readonly input: unknown;
  };
  /** A tool call finished. `id` matches the originating `tool-use`. */
  'tool-result': {
    readonly kind: 'tool-result';
    readonly id: string;
    readonly result: string;
    readonly isError: boolean;
  };
  /** The backend PAUSED a tool call awaiting the user's approval (ask-mode). `respond` resolves the
   *  paused call exactly once; the session owns routing the user's y/n/a answer into it. */
  'permission-request': {
    readonly kind: 'permission-request';
    readonly id: string;
    readonly toolName: string;
    readonly input: unknown;
    readonly respond: (decision: PermissionDecision) => void;
  };
  /** A session-level error (transport, backend, protocol) — distinct from a tool that returned isError. */
  error: { readonly kind: 'error'; readonly message: string };
  /** The session finished; `reason` says how. */
  'session-end': {
    readonly kind: 'session-end';
    readonly reason: AgentEndReason;
  };
}

/** A single structured event emitted by an AgentBackend, in the order the session produced it. */
export type AgentEvent = AgentEvents[keyof AgentEvents];

/** The user's answer to a pending permission request. 'always-allow' additionally adds the tool to the
 *  backend's session-scoped auto-allow set (future calls for that tool skip the prompt). */
export type PermissionDecision = 'allow' | 'always-allow' | 'deny';

/** How a session ended. */
export type AgentEndReason = 'completed' | 'interrupted' | 'error';

/** The role of an append-only transcript entry — the projection surface every UI reads. */
export type TranscriptRole =
  | 'user'
  | 'assistant'
  | 'tool-use'
  | 'tool-result'
  | 'permission-request'
  | 'system'
  | 'error';

/** Where a permission request stands. Pending renders the interactive prompt; a resolved entry stays in
 *  the transcript as a compact record of the decision. */
export type PermissionRequestStatus = 'pending' | 'allowed' | 'denied';

/** One append-only transcript entry. Assistant text-deltas accumulate into a single 'assistant' entry
 *  until a non-text event closes it; everything else appends a discrete entry. The permission entry is
 *  PURE DATA (its status mutates on resolution); the live respond callback lives in the session, never
 *  in the transcript. */
export type TranscriptEntry =
  | {
      readonly role: 'user';
      readonly text: string;
      /** Present only while this visible user message is waiting for backend delivery. */
      delivery?: 'queued';
    }
  /** `engine` is the provider that PRODUCED this turn, stamped when the entry opens — after an engine
   *  switch, new turns carry the new engine while history keeps the label of the engine that wrote it
   *  (the transcript is the source of truth). Absent on entries predating the stamp: those were all
   *  produced when only Claude ran, so projections default them to 'claude'. */
  | {
      readonly role: 'assistant';
      text: string;
      readonly engine?: ResolvedEngine;
    }
  | {
      readonly role: 'tool-use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly role: 'tool-result';
      readonly id: string;
      readonly result: string;
      readonly isError: boolean;
    }
  /** `engine` = the provider asking (a pending prompt is always the ACTIVE engine — swaps are refused
   *  while a turn is busy); same historical default as assistant entries. */
  | {
      readonly role: 'permission-request';
      readonly id: string;
      readonly toolName: string;
      readonly input: unknown;
      status: PermissionRequestStatus;
      readonly engine?: ResolvedEngine;
    }
  /** A session-level NOTE the pane injects (not from a backend) — e.g. an engine switch banner. Renders
   *  as a dim, centered aside; carries no agent semantics. */
  | { readonly role: 'system'; readonly text: string }
  | { readonly role: 'error'; readonly text: string };

/** The lifecycle state of a session, derived from the event stream. Drives composer availability and
 *  status affordances without any surface tracking its own copy. */
export type AgentStatus = 'idle' | 'streaming' | 'awaiting-tool' | 'ended';

/** User-facing liveness of the current or most recently canceled turn. */
export type AgentTurnState = 'running' | 'stalled' | 'canceled' | 'idle';
