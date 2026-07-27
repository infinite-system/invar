import { Static } from 'ivue/extras';
import type { AgentEvent } from './AgentEvents.interface';

// invariant: An agent session is a structured event stream, not a screen (src/modules/agent/agent.invariants.md)

class $CodexAppServerMapping {
  static createTurnState(): MappingTurnState {
    return { streamedItemIds: new Set() };
  }

  protected static record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }

  /** Map ONE app-server notification to zero or more AgentEvents. Pure over (notification, turnState). */
  static mapNotification(
    notification: AppServerNotification,
    turnState: MappingTurnState,
  ): AgentEvent[] {
    const params = this.record(notification.params);
    switch (notification.method) {
      case 'thread/started':
        return [{ kind: 'session-start' }];
      case 'item/agentMessage/delta': {
        const delta = typeof params.delta === 'string' ? params.delta : '';
        const itemId = typeof params.itemId === 'string' ? params.itemId : '';
        if (!delta) return [];
        if (itemId) turnState.streamedItemIds.add(itemId);
        return [{ kind: 'text-delta', text: delta }];
      }
      case 'item/started': {
        const item = this.record(params.item);
        if (item.type === 'commandExecution') {
          return [
            {
              kind: 'tool-use',
              id: String(item.id ?? ''),
              name: 'Bash',
              input: { command: String(item.command ?? '') },
            },
          ];
        }
        return [];
      }
      case 'item/completed': {
        const item = this.record(params.item);
        if (item.type === 'agentMessage') {
          // Emit the full text ONLY when no deltas streamed for this item (delta-less servers/configs).
          const itemId = String(item.id ?? '');
          const text = typeof item.text === 'string' ? item.text : '';
          if (!text || turnState.streamedItemIds.has(itemId)) return [];
          return [{ kind: 'text-delta', text }];
        }
        if (item.type === 'commandExecution') {
          const status = String(item.status ?? '');
          const declined = status === 'declined';
          const exitCode =
            typeof item.exitCode === 'number' ? item.exitCode : null;
          const output =
            typeof item.aggregatedOutput === 'string'
              ? item.aggregatedOutput
              : '';
          return [
            {
              kind: 'tool-result',
              id: String(item.id ?? ''),
              result: declined ? 'The user denied this command.' : output,
              isError: declined || (exitCode !== null && exitCode !== 0),
            },
          ];
        }
        return [];
      }
      case 'turn/completed': {
        const turn = this.record(params.turn);
        const status = String(turn.status ?? 'completed');
        if (status === 'failed') {
          // A failed turn CARRIES ITS REASON (turn.error.message — e.g. "401 Unauthorized" with no
          // auth). Discarding it rendered a blank reply: session-end alone paints nothing. Emit the
          // SAME error event the SDK backend emits (the transcript already renders error rows — no
          // new vocabulary), then end the session.
          const turnError = this.record(turn.error);
          const message =
            typeof turnError.message === 'string' && turnError.message
              ? turnError.message
              : 'codex: the turn failed (no error detail from the app-server)';
          return [
            { kind: 'error', message },
            { kind: 'session-end', reason: 'error' },
          ];
        }
        return [
          {
            kind: 'session-end',
            reason: status === 'interrupted' ? 'interrupted' : 'completed',
          },
        ];
      }
      case 'error': {
        // A server-level error NOTIFICATION (auth failures, stream errors) — previously unmapped, so
        // the failure never reached the transcript. Both observed dialects are accepted:
        // { error: { message } } and the flat { message }.
        const nestedError = this.record(params.error);
        const message =
          typeof nestedError.message === 'string' && nestedError.message
            ? nestedError.message
            : typeof params.message === 'string' && params.message
              ? params.message
              : 'codex: the app-server reported an error (no detail)';
        return [{ kind: 'error', message }];
      }
      default:
        return [];
    }
  }

  /** Translate a server→client approval REQUEST's method+params into the pane's prompt vocabulary (with
   *  its method-specific response builder), or null when the method is not an approval at all. Three
   *  approval families exist in the current dialect (the reviewed gap: the permissions request was
   *  unrecognized, so it hung to the fail-safe instead of reaching the y/n/a prompt):
   *  - command execution / file change → decision enum (accept / acceptForSession / decline);
   *  - permission-profile requests → a GRANT: the requested profile back (allow: this turn;
   *    always-allow: session scope) or an EMPTY profile (deny grants nothing; the turn continues). */
  static approvalOf(
    method: string,
    params: unknown,
  ): ApprovalDescriptor | null {
    const parameters = this.record(params);
    const decisionResponse = (
      decision: 'allow' | 'always-allow' | 'deny',
    ): unknown => ({ decision: this.decisionToCodex(decision) });
    if (
      method === 'item/commandExecution/requestApproval' ||
      method === 'execCommandApproval'
    ) {
      const command = parameters.command;
      const commandText = Array.isArray(command)
        ? command.join(' ')
        : String(command ?? '');
      return {
        toolName: 'Bash',
        input: { command: commandText, reason: parameters.reason ?? undefined },
        respondWith: decisionResponse,
      };
    }
    if (
      method === 'item/fileChange/requestApproval' ||
      method === 'applyPatchApproval'
    ) {
      return {
        toolName: 'ApplyPatch',
        input: { reason: parameters.reason ?? 'apply file changes' },
        respondWith: decisionResponse,
      };
    }
    if (method === 'item/permissions/requestApproval') {
      const requestedProfile = parameters.permissions ?? {};
      return {
        toolName: 'Permissions',
        input: {
          reason: parameters.reason ?? 'grant additional permissions',
          request: requestedProfile,
        },
        respondWith: (decision) =>
          decision === 'deny'
            ? { permissions: {} } // grant NOTHING — a valid answer; the turn continues denied
            : {
                permissions: requestedProfile,
                scope: decision === 'always-allow' ? 'session' : 'turn',
              },
      };
    }
    return null;
  }

  /** Translate the pane's y/n/a decision to the v2 wire enum. allow → accept; always-allow →
   *  acceptForSession (codex's native session-scoped auto-allow — no client-side set needed); deny →
   *  decline (the agent continues the turn — exactly our deny semantics). The v1 strings
   *  ('approved'/'denied') are REJECTED by the server and fail-safe to decline — never send them. */
  static decisionToCodex(
    decision: 'allow' | 'always-allow' | 'deny',
  ): 'accept' | 'acceptForSession' | 'decline' {
    if (decision === 'deny') return 'decline';
    if (decision === 'always-allow') return 'acceptForSession';
    return 'accept';
  }
}

export namespace CodexAppServerMapping {
  export const $Class = Static($CodexAppServerMapping);
  export let Class = $Class;
}

/** A JSON-RPC notification (method + params) as parsed off the app-server stdout. */
export interface AppServerNotification {
  method: string;
  params?: unknown;
}

/** What a server→client approval REQUEST asks, translated to the pane's vocabulary. */
export interface ApprovalDescriptor {
  toolName: string;
  input: unknown;
  respondWith(decision: 'allow' | 'always-allow' | 'deny'): unknown;
}

/** Mutable per-turn mapping state, owned by the caller. */
export interface MappingTurnState {
  streamedItemIds: Set<string>;
}
