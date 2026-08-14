import { Static } from 'ivue/extras';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The verb contract, rung 1: registered wrap faces run the fleet's own
 * scripts (logic stays in the scripts — the one-place record governs)
 * and return structured results; every run appends one typed event to
 * the ledger. Verbs the repo's scripts cannot back are absent, never
 * errors; an unknown verb fails loudly with the verb list.
 */
// invariant: A wrapped script keeps its logic in one place (iv-harness/iv-harness.invariants.md)
// invariant: Only the files arbitrate process state (iv-harness/iv-harness.invariants.md)
class $HarnessVerbs {
  static get EVENTS_FILE_RELATIVE_PATH(): string {
    return '.invar/harness-events.jsonl';
  }

  static get VERB_REGISTRY(): Record<string, VerbDefinition> {
    return {
      'probe.selfTest': {
        script: 'scripts/fleet/probe.sh',
        buildArguments: () => ['self-test'],
        description: 'prove the fleet probes fire AND stay silent',
      },
      'probe.builders': {
        script: 'scripts/fleet/probe.sh',
        buildArguments: () => ['builders'],
        description: 'live builders by /proc cwd evidence',
      },
      'probe.gate': {
        script: 'scripts/fleet/probe.sh',
        buildArguments: () => ['gate'],
        description: 'gate liveness (a finished log must not read as running)',
      },
      'dispatch.dry': {
        script: 'scripts/fleet/dispatch.sh',
        buildArguments: (verbArguments) => verbArguments,
        environment: { DRY_RUN: '1' },
        description: 'every dispatch guard, no side effect (number slug brief)',
      },
    };
  }

  static availableVerbs(rootDirectory: string): VerbListing[] {
    return Object.entries(this.VERB_REGISTRY).map(([name, definition]) => ({
      name,
      description: definition.description,
      available: existsSync(join(rootDirectory, definition.script)),
      script: definition.script,
    }));
  }

  static run(
    rootDirectory: string,
    verbName: string,
    verbArguments: string[],
  ): VerbResult {
    const definition = this.VERB_REGISTRY[verbName];
    if (!definition) {
      const verbNames = Object.keys(this.VERB_REGISTRY).join(', ');
      throw new Error(`no verb '${verbName}'. Registered verbs: ${verbNames}`);
    }
    const scriptPath = join(rootDirectory, definition.script);
    if (!existsSync(scriptPath)) {
      throw new Error(
        `verb '${verbName}' is not available here: ${definition.script} does not exist`,
      );
    }
    const startedAt = new Date().toISOString();
    const startedMilliseconds = Date.now();
    let exitCode = 0;
    let output = '';
    try {
      output = execFileSync(
        'bash',
        [scriptPath, ...definition.buildArguments(verbArguments)],
        {
          cwd: rootDirectory,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, ...definition.environment },
        },
      );
    } catch (error) {
      const failure = error as {
        status?: number;
        stdout?: string;
        stderr?: string;
      };
      exitCode = failure.status ?? 1;
      output = String(failure.stdout ?? '') + String(failure.stderr ?? '');
    }
    const result: VerbResult = {
      verb: verbName,
      arguments: verbArguments,
      ok: exitCode === 0,
      exitCode,
      lines: output.split('\n').filter((line) => line.trim().length > 0),
      startedAt,
      durationMilliseconds: Date.now() - startedMilliseconds,
    };
    this.appendEvent(rootDirectory, result);
    return result;
  }

  /** One typed line per run — the steering ledger the Observer counts. */
  static appendEvent(rootDirectory: string, result: VerbResult): void {
    const event = {
      verb: result.verb,
      arguments: result.arguments,
      exitCode: result.exitCode,
      startedAt: result.startedAt,
      durationMilliseconds: result.durationMilliseconds,
    };
    appendFileSync(
      join(rootDirectory, this.EVENTS_FILE_RELATIVE_PATH),
      JSON.stringify(event) + '\n',
    );
  }

  static readEvents(rootDirectory: string): VerbEvent[] {
    const eventsPath = join(rootDirectory, this.EVENTS_FILE_RELATIVE_PATH);
    if (!existsSync(eventsPath)) return [];
    return readFileSync(eventsPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as VerbEvent;
        } catch {
          return null;
        }
      })
      .filter((event): event is VerbEvent => event !== null);
  }
}

export namespace HarnessVerbs {
  export const $Class = Static($HarnessVerbs);
  export let Class = $Class;
}

export interface VerbDefinition {
  script: string;
  buildArguments: (verbArguments: string[]) => string[];
  environment?: Record<string, string>;
  description: string;
}

export interface VerbListing {
  name: string;
  description: string;
  available: boolean;
  script: string;
}

export interface VerbResult {
  verb: string;
  arguments: string[];
  ok: boolean;
  exitCode: number;
  lines: string[];
  startedAt: string;
  durationMilliseconds: number;
}

export interface VerbEvent {
  verb: string;
  arguments: string[];
  exitCode: number;
  startedAt: string;
  durationMilliseconds: number;
}
