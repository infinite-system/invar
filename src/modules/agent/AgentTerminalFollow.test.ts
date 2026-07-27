import { describe, expect, test } from 'bun:test';
import { Static } from 'ivue/extras';
import { ref, type Ref } from 'vue';
import { AgentSession } from './AgentSession';
import {
  AgentTerminalFollow,
  type AgentTerminalObservation,
} from './AgentTerminalFollow';
import { MockAgentBackend } from './MockAgentBackend';
import type { AgentTerminalFollowMode } from '../settings/Settings';

class $AgentTerminalFollowTest {
  static {
    describe('AgentTerminalFollow', () => {
      test('follow-all responds to passing and failing command boundaries', () => {
        const driven = this.create('follow-all');
        driven.emit(this.event('passing', 0));
        driven.backend.emit({ kind: 'session-end', reason: 'completed' });
        driven.emit(this.event('failing', 7));
        expect(driven.backend.sent).toHaveLength(2);
        expect(driven.backend.sent[0]).toContain('command: passing');
        expect(driven.backend.sent[1]).toContain('exit code: 7');
        driven.follow.dispose();
        driven.session.dispose();
      });

      test('on-error responds only to a known nonzero exit', () => {
        const driven = this.create('on-error');
        driven.emit(this.event('passing', 0));
        driven.emit(this.event('heuristic', null, 'heuristic'));
        expect(driven.backend.sent).toEqual([]);
        driven.emit(this.event('failing', 2));
        expect(driven.backend.sent).toHaveLength(1);
        expect(driven.backend.sent[0]).toContain('command: failing');
        driven.follow.dispose();
        driven.session.dispose();
      });

      test('on-request stays silent but supplies the next user turn with context', () => {
        const driven = this.create('on-request');
        driven.emit(this.event('context-command', 0));
        expect(driven.backend.sent).toEqual([]);
        expect(driven.session.send('What happened?')).toBe(true);
        expect(driven.backend.sent).toHaveLength(1);
        expect(driven.backend.sent[0]).toContain('command: context-command');
        expect(driven.backend.sent[0]).toContain('What happened?');
        driven.follow.dispose();
        driven.session.dispose();
      });

      test('off delivers nothing and a live mode change governs the next boundary', () => {
        const driven = this.create('off');
        driven.emit(this.event('ignored', 1));
        expect(driven.backend.sent).toEqual([]);
        driven.mode.value = 'follow-all';
        driven.emit(this.event('observed-next', 0));
        expect(driven.backend.sent).toHaveLength(1);
        expect(driven.backend.sent[0]).toContain('observed-next');
        driven.follow.dispose();
        driven.session.dispose();
      });

      test('an observation parsed after terminal exit starts no agent turn', () => {
        const driven = this.create('follow-all');
        driven.terminalExited.value = true;
        driven.emit(this.event('late-output', 17));
        expect(driven.backend.sent).toEqual([]);
        expect(driven.session.turnInFlight).toBe(false);
        expect(driven.session.transcript).toEqual([]);
        driven.follow.dispose();
        driven.session.dispose();
      });

      test('cycle order is follow then on-error then on-request then off', () => {
        const driven = this.create('follow-all');
        expect(driven.follow.cycle()).toBe('on-error');
        expect(driven.follow.cycle()).toBe('on-request');
        expect(driven.follow.cycle()).toBe('off');
        expect(driven.follow.cycle()).toBe('follow-all');
        driven.follow.dispose();
        driven.session.dispose();
      });
    });
  }

  protected static create(modeValue: AgentTerminalFollowMode): {
    backend: MockAgentBackend.Model;
    session: AgentSession.Model;
    follow: AgentTerminalFollow.Model;
    mode: Ref<AgentTerminalFollowMode>;
    terminalExited: Ref<boolean>;
    emit: (event: AgentTerminalObservation) => void;
  } {
    let callback: ((event: AgentTerminalObservation) => void) | null = null;
    const backend = new MockAgentBackend.Class();
    const session = new AgentSession.Class(backend);
    const mode = ref<AgentTerminalFollowMode>(modeValue);
    const terminalExited = ref(false);
    const follow = new AgentTerminalFollow.Class(
      session,
      {
        get terminalExited() {
          return terminalExited.value;
        },
        onTerminalObservation: (nextCallback) => {
          callback = nextCallback;
          return () => {
            callback = null;
          };
        },
      },
      mode,
    );
    return {
      backend,
      session,
      follow,
      mode,
      terminalExited,
      emit: (event) => callback?.(event),
    };
  }

  protected static event(
    command: string,
    exitCode: number | null,
    boundarySource: 'osc133' | 'heuristic' = 'osc133',
  ): AgentTerminalObservation {
    return {
      command,
      cwd: '/tmp/project',
      exitCode,
      boundarySource,
      output: {
        headLines: ['first'],
        tailLines: ['last'],
        totalLines: 5,
        truncated: true,
      },
    } as const;
  }
}

export namespace AgentTerminalFollowTest {
  export const $Class = Static($AgentTerminalFollowTest);
  export let Class = $Class;
}
