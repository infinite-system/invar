import type {
  RewriteCandidate,
  RewriteProvider,
  RewriteRequest,
} from '../inline-rewrite/RewriteProvider.interface';
import type {
  LanguagePosition,
  LanguageRange,
} from '../workspace/LanguageProvider.interface';
import { Processes, type SpawnedProcess } from '../system/Processes';
import { Files } from '../system/Files';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class $CodexRewriteProvider implements RewriteProvider {
  protected activeChild: CodexRewriteProcess | null = null;
  protected disposed = false;

  constructor(protected readonly options: CodexRewriteProviderOptions = {}) {}

  get available(): boolean {
    return this.codexExecutable() !== null;
  }

  protected codexExecutable(): string | null {
    return this.options.codexPath ?? Bun.which('codex');
  }

  async rewrite(
    request: RewriteRequest,
    signal: AbortSignal,
  ): Promise<readonly RewriteCandidate[]> {
    if (this.disposed) return [];
    this.cancelActiveChild();
    const codexExecutable = this.codexExecutable();
    if (!codexExecutable || signal.aborted) return [];

    const schemaDirectory = mkdtempSync(
      join(tmpdir(), 'invar-inline-rewrite-schema-'),
    );
    const schemaPath = join(schemaDirectory, 'response.schema.json');
    writeFileSync(schemaPath, JSON.stringify(this.outputSchema()));
    let child: CodexRewriteProcess | null = null;
    let abortChild: (() => void) | null = null;
    try {
      child = this.spawn(codexExecutable, request, schemaPath);
      this.activeChild = child;
      abortChild = (): void => this.terminateChild(child!);
      signal.addEventListener('abort', abortChild, { once: true });
      child.stdin.write(this.prompt(request));
      await child.stdin.end();
      const [standardOutput, standardError, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (signal.aborted || this.activeChild !== child || this.disposed) {
        return [];
      }
      if (exitCode !== 0) {
        throw new Error(
          standardError.trim().slice(-400) ||
            `codex exited with status ${exitCode}`,
        );
      }
      return this.parseCandidates(standardOutput);
    } finally {
      if (abortChild) signal.removeEventListener('abort', abortChild);
      if (child && this.activeChild === child) this.activeChild = null;
      rmSync(schemaDirectory, { recursive: true, force: true });
    }
  }

  protected spawn(
    codexExecutable: string,
    request: RewriteRequest,
    schemaPath: string,
  ): CodexRewriteProcess {
    return Processes.Class.spawn(
      [
        codexExecutable,
        'exec',
        '--json',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '--model',
        this.options.model ?? 'gpt-5.3-codex-spark',
        '--config',
        'model_reasoning_effort="low"',
        '--output-schema',
        schemaPath,
        '-',
      ],
      {
        cwd: request.documentPath
          ? Files.Class.dirname(request.documentPath)
          : undefined,
        detached: true,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
  }

  protected outputSchema(): Record<string, unknown> {
    const positionSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['line', 'column'],
      properties: {
        line: { type: 'integer', minimum: 0 },
        column: { type: 'integer', minimum: 0 },
      },
    };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['candidates'],
      properties: {
        candidates: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['region', 'replacementText', 'rationale'],
            properties: {
              region: {
                type: 'object',
                additionalProperties: false,
                required: ['start', 'end'],
                properties: {
                  start: positionSchema,
                  end: positionSchema,
                },
              },
              replacementText: { type: 'string' },
              rationale: { type: 'string' },
            },
          },
        },
      },
    };
  }

  protected prompt(request: RewriteRequest): string {
    return [
      'You are an inline code rewrite provider.',
      'Infer the intent of the recent edit region in the supplied document.',
      'Return JSON only, with this exact shape:',
      '{"candidates":[{"region":{"start":{"line":0,"column":0},' +
        '"end":{"line":0,"column":0}},"replacementText":"...",' +
        '"rationale":"one short line"}]}',
      'Return at most three ordered candidates. Rewrites may span lines.',
      'Positions are zero-based line and user-perceived character columns.',
      'Do not use tools, inspect files, or include markdown fences.',
      `Language: ${request.languageId}`,
      `Cursor: ${JSON.stringify(request.cursor)}`,
      `Recent edit region: ${JSON.stringify(request.editRegion)}`,
      'Document:',
      request.documentText,
    ].join('\n');
  }

  protected parseCandidates(output: string): readonly RewriteCandidate[] {
    const trimmedOutput = output.trim();
    const assistantMessage = this.assistantMessageFromJsonLines(trimmedOutput);
    const fencedMatch = trimmedOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidateTexts = [
      assistantMessage,
      trimmedOutput,
      fencedMatch?.[1] ?? '',
      trimmedOutput.slice(trimmedOutput.indexOf('{')),
    ];
    for (const candidateText of candidateTexts) {
      if (!candidateText) continue;
      try {
        const parsed = JSON.parse(candidateText) as {
          candidates?: unknown;
        };
        if (!Array.isArray(parsed.candidates)) continue;
        return this.validateCandidates(parsed.candidates);
      } catch {
        continue;
      }
    }
    throw new Error('codex returned malformed rewrite JSON');
  }

  protected assistantMessageFromJsonLines(output: string): string {
    let assistantMessage = '';
    for (const line of output.split('\n')) {
      try {
        const event = JSON.parse(line) as {
          type?: unknown;
          item?: {
            type?: unknown;
            text?: unknown;
          };
        };
        if (
          event.type === 'item.completed' &&
          (event.item?.type === 'agent_message' ||
            event.item?.type === 'assistant_message') &&
          typeof event.item.text === 'string'
        ) {
          assistantMessage = event.item.text;
        }
      } catch {
        continue;
      }
    }
    return assistantMessage;
  }

  protected validateCandidates(value: unknown): readonly RewriteCandidate[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (candidate): candidate is RewriteCandidate =>
          this.validRange(candidate?.region) &&
          typeof candidate?.replacementText === 'string' &&
          typeof candidate?.rationale === 'string',
      )
      .slice(0, 3);
  }

  protected validRange(value: unknown): value is LanguageRange {
    if (!value || typeof value !== 'object') return false;
    const range = value as {
      start?: unknown;
      end?: unknown;
    };
    return this.validPosition(range.start) && this.validPosition(range.end);
  }

  protected validPosition(value: unknown): value is LanguagePosition {
    if (!value || typeof value !== 'object') return false;
    const position = value as {
      line?: unknown;
      column?: unknown;
    };
    return (
      Number.isInteger(position.line) &&
      Number(position.line) >= 0 &&
      Number.isInteger(position.column) &&
      Number(position.column) >= 0
    );
  }

  protected cancelActiveChild(): void {
    if (this.activeChild) this.terminateChild(this.activeChild);
    this.activeChild = null;
  }

  protected terminateChild(child: CodexRewriteProcess): void {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
        return;
      } catch {
        // The child may already have exited; the direct handle is the fallback.
      }
    }
    child.kill();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelActiveChild();
  }
}

export namespace CodexRewriteProvider {
  export const $Class = $CodexRewriteProvider;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface CodexRewriteProviderOptions {
  readonly codexPath?: string;
  readonly model?: string;
}

type CodexRewriteProcess = SpawnedProcess<'pipe', 'pipe', 'pipe'>;
