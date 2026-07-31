import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { Static } from 'ivue/extras';

// invariant: A bounded read is the only verification the instrument runs (tools/invariant-field-v2/invariant-field.invariants.md)
import {
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from 'shiki';

class $CodeLens {
  protected static get $highlighter(): Promise<Highlighter> {
    return createHighlighter({
      themes: ['github-dark-default'],
      langs: [
        'typescript',
        'tsx',
        'javascript',
        'vue',
        'json',
        'shellscript',
        'markdown',
        'python',
        'go',
        'rust',
        'text',
      ],
    });
  }

  static async response(
    request: Request,
    options: CodeLensResponseOptions,
  ): Promise<Response> {
    if (request.method !== 'GET') {
      return this.jsonResponse(
        {
          resolved: false,
          reason: 'read-only',
          message: 'The code lens endpoint accepts read requests only.',
        },
        405,
        { Allow: 'GET' },
      );
    }
    const url = new URL(request.url);
    const requestedPath = url.searchParams.get('path')?.trim() ?? '';
    const requestedLine = Number(url.searchParams.get('line') ?? '1');
    const requestedCommit =
      url.searchParams.get('commit')?.trim() || options.currentCommit;
    if (
      !requestedPath ||
      !Number.isInteger(requestedLine) ||
      requestedLine < 1
    ) {
      return this.jsonResponse(
        {
          resolved: false,
          reason: 'invalid-request',
          message: 'The code lens needs a repository path and positive line.',
        },
        400,
      );
    }
    if (!options.allowedCommits.has(requestedCommit)) {
      return this.jsonResponse(
        {
          resolved: false,
          reason: 'unknown-commit',
          message: 'The selected snapshot is not in the field store.',
          path: requestedPath,
          line: requestedLine,
        },
        404,
      );
    }
    const sourceResult =
      requestedCommit === options.currentCommit
        ? this.readCurrentSource(options.repositoryRoot, requestedPath)
        : this.readHistoricalSource(
            options.repositoryRoot,
            requestedCommit,
            requestedPath,
          );
    if (!sourceResult.resolved) {
      return this.jsonResponse(
        {
          ...sourceResult,
          line: requestedLine,
        },
        sourceResult.reason === 'outside-repository' ? 403 : 404,
      );
    }
    const span = this.extractSpan(
      sourceResult.source,
      requestedPath,
      requestedLine,
      options.contextLineCount ?? 7,
    );
    return this.jsonResponse({
      ...span,
      highlightedHtml: await this.highlight(span),
    });
  }

  static readCurrentSource(
    repositoryRoot: string,
    requestedPath: string,
  ): CodeLensSourceResult {
    const confinedPath = this.confinedPath(repositoryRoot, requestedPath);
    if (!confinedPath.resolved) return confinedPath;
    let realTargetPath: string;
    try {
      realTargetPath = realpathSync(confinedPath.absolutePath);
    } catch {
      return {
        resolved: false,
        reason: 'not-found',
        message: 'The cited file does not resolve in the repository.',
        path: confinedPath.path,
      };
    }
    const realRepositoryRoot = realpathSync(repositoryRoot);
    const targetRelativePath = relative(realRepositoryRoot, realTargetPath);
    if (targetRelativePath.startsWith('..') || isAbsolute(targetRelativePath)) {
      return {
        resolved: false,
        reason: 'outside-repository',
        message: 'The cited file resolves outside the repository.',
        path: confinedPath.path,
      };
    }
    if (!statSync(realTargetPath).isFile()) {
      return {
        resolved: false,
        reason: 'not-found',
        message: 'The cited path is not a file.',
        path: confinedPath.path,
      };
    }
    return {
      resolved: true,
      path: confinedPath.path,
      source: readFileSync(realTargetPath, 'utf8'),
    };
  }

  static readHistoricalSource(
    repositoryRoot: string,
    commit: string,
    requestedPath: string,
  ): CodeLensSourceResult {
    const confinedPath = this.confinedPath(repositoryRoot, requestedPath);
    if (!confinedPath.resolved) return confinedPath;
    const processResult = Bun.spawnSync({
      cmd: ['git', 'show', `${commit}:${confinedPath.path}`],
      cwd: repositoryRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (processResult.exitCode !== 0) {
      return {
        resolved: false,
        reason: 'not-found',
        message: 'The cited file does not resolve in the selected snapshot.',
        path: confinedPath.path,
      };
    }
    return {
      resolved: true,
      path: confinedPath.path,
      source: processResult.stdout.toString(),
    };
  }

  static extractSpan(
    source: string,
    path: string,
    requestedLine: number,
    contextLineCount = 7,
  ): CodeLensSpan {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const line = Math.max(1, Math.min(lines.length, requestedLine));
    const boundedContextLineCount = Math.max(
      0,
      Math.min(20, Math.floor(contextLineCount)),
    );
    const startLine = Math.max(1, line - boundedContextLineCount);
    const endLine = Math.min(lines.length, line + boundedContextLineCount);
    return {
      resolved: true,
      path,
      line,
      startLine,
      endLine,
      source: lines.slice(startLine - 1, endLine).join('\n'),
      language: this.languageFor(path),
    };
  }

  static async highlight(span: CodeLensSpan): Promise<string> {
    const highlighter = await this.$highlighter;
    const highlighted = highlighter.codeToHtml(span.source, {
      lang: span.language,
      theme: 'github-dark-default',
    });
    let highlightedLine = span.startLine;
    return highlighted.replace(/<span class="line">/g, () => {
      const isFocusLine = highlightedLine === span.line;
      const openingTag = `<span class="line${isFocusLine ? ' code-lens-focus-line' : ''}" data-line="${highlightedLine}">`;
      highlightedLine++;
      return openingTag;
    });
  }

  protected static confinedPath(
    repositoryRoot: string,
    requestedPath: string,
  ): CodeLensConfinedPathResult {
    const realRepositoryRoot = realpathSync(repositoryRoot);
    const absolutePath = resolve(realRepositoryRoot, requestedPath);
    const repositoryRelativePath = relative(realRepositoryRoot, absolutePath);
    if (
      !repositoryRelativePath ||
      repositoryRelativePath.startsWith('..') ||
      isAbsolute(repositoryRelativePath)
    ) {
      return {
        resolved: false,
        reason: 'outside-repository',
        message: 'The requested path is outside the repository.',
        path: requestedPath,
      };
    }
    return {
      resolved: true,
      path: repositoryRelativePath.replaceAll('\\', '/'),
      absolutePath,
    };
  }

  protected static languageFor(path: string): BundledLanguage {
    const extension = extname(path).toLowerCase();
    if (extension === '.ts') return 'typescript';
    if (extension === '.tsx') return 'tsx';
    if (['.js', '.mjs', '.cjs'].includes(extension)) return 'javascript';
    if (extension === '.vue') return 'vue';
    if (extension === '.json') return 'json';
    if (extension === '.sh') return 'shellscript';
    if (extension === '.md') return 'markdown';
    if (extension === '.py') return 'python';
    if (extension === '.go') return 'go';
    if (extension === '.rs') return 'rust';
    return 'text' as BundledLanguage;
  }

  protected static jsonResponse(
    value: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ): Response {
    return Response.json(value, {
      status,
      headers: {
        'cache-control': 'no-store',
        ...headers,
      },
    });
  }
}

export namespace CodeLens {
  export const $Class = Static($CodeLens);
  export let Class = $Class;
}

export interface CodeLensResponseOptions {
  repositoryRoot: string;
  currentCommit: string;
  allowedCommits: ReadonlySet<string>;
  contextLineCount?: number;
}

export interface CodeLensSpan {
  resolved: true;
  path: string;
  line: number;
  startLine: number;
  endLine: number;
  source: string;
  language: BundledLanguage;
}

export interface HighlightedCodeLensSpan extends CodeLensSpan {
  highlightedHtml: string;
}

export type CodeLensFailureReason =
  | 'invalid-request'
  | 'not-found'
  | 'outside-repository'
  | 'read-only'
  | 'unknown-commit';

export interface CodeLensFailure {
  resolved: false;
  reason: CodeLensFailureReason;
  message: string;
  path?: string;
  line?: number;
}

export type CodeLensPayload = HighlightedCodeLensSpan | CodeLensFailure;

interface CodeLensSource {
  resolved: true;
  path: string;
  source: string;
}

type CodeLensSourceResult = CodeLensSource | CodeLensFailure;

interface CodeLensConfinedPath {
  resolved: true;
  path: string;
  absolutePath: string;
}

type CodeLensConfinedPathResult = CodeLensConfinedPath | CodeLensFailure;
