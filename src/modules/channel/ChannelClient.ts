import { Static } from 'ivue/extras';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  ChannelFrame,
  type ChannelFrameKind,
  type ChannelDecodedFrame,
} from './ChannelFrame';

class $ChannelClient {
  constructor(
    protected readonly write: (bytes: Uint8Array) => void,
    protected readonly requestHandler?: ChannelRequestHandler,
  ) {}

  protected readonly decoder = new ChannelFrame.Class();
  protected welcomePromise: Promise<void> | null = null;
  protected welcomeResolve: (() => void) | null = null;
  protected welcomeReject: ((error: unknown) => void) | null = null;
  protected readonly requests = new Map<string, PendingRequest>();

  async negotiate(): Promise<void> {
    if (this.welcomePromise) return this.welcomePromise;
    this.welcomePromise = new Promise<void>((resolve, reject) => {
      this.welcomeResolve = resolve;
      this.welcomeReject = reject;
    });
    this.send(ChannelFrame.Class.FRAME_KIND.Hello, {
      versions: ['1.0'],
      capabilities: ['dialog.*', 'fs.*', 'pty.*'],
    });
    return this.welcomePromise;
  }

  receive(bytes: Uint8Array): void {
    try {
      for (const frame of this.decoder.push(bytes)) this.handleFrame(frame);
    } catch (error) {
      this.welcomeReject?.(error);
      for (const request of this.requests.values()) request.reject(error);
      this.requests.clear();
      throw error;
    }
  }

  close(error: unknown = new Error('Channel closed')): void {
    this.welcomeReject?.(error);
    for (const request of this.requests.values()) request.reject(error);
    this.requests.clear();
  }

  async upload(path: string): Promise<ChannelUploadResult> {
    await this.negotiate();
    const status = await stat(path);
    if (!status.isFile())
      throw new Error(`Drop path is not a regular file: ${path}`);
    const requestId = randomUUID();
    const streamId = randomUUID();
    const response = new Promise<ChannelUploadResult>((resolve, reject) => {
      this.requests.set(requestId, {
        resolve: (result) => resolve(result as unknown as ChannelUploadResult),
        reject,
      });
    });
    this.send(ChannelFrame.Class.FRAME_KIND.Request, {
      requestId,
      method: 'drop.upload',
      parameters: { name: basename(path), size: status.size, streamId },
    });
    this.send(ChannelFrame.Class.FRAME_KIND.StreamOpen, {
      requestId,
      streamId,
      contentLength: status.size,
    });
    const hasher = new Bun.CryptoHasher('sha256');
    for await (const chunk of Bun.file(path).stream()) {
      const bytes = new Uint8Array(chunk);
      hasher.update(bytes);
      this.write(
        ChannelFrame.Class.encode(
          ChannelFrame.Class.FRAME_KIND.StreamData,
          { streamId },
          bytes,
        ),
      );
    }
    this.send(ChannelFrame.Class.FRAME_KIND.StreamEnd, {
      streamId,
      sha256: hasher.digest('hex'),
    });
    return response;
  }

  protected handleFrame(frame: ChannelDecodedFrame): void {
    if (frame.kind === ChannelFrame.Class.FRAME_KIND.Welcome) {
      if (frame.header.version !== '1.0') {
        this.welcomeReject?.(
          new Error(
            `Unsupported selected version ${String(frame.header.version)}`,
          ),
        );
        return;
      }
      const capabilities = frame.header.capabilities;
      if (
        !Array.isArray(capabilities) ||
        !capabilities.includes('drop.upload')
      ) {
        this.welcomeReject?.(
          new Error('Remote channel does not offer drop.upload'),
        );
        return;
      }
      this.welcomeResolve?.();
      return;
    }
    if (frame.kind === ChannelFrame.Class.FRAME_KIND.Request) {
      void this.handleRequest(frame.header);
      return;
    }
    if (frame.kind !== ChannelFrame.Class.FRAME_KIND.Response) {
      throw new Error(`Unexpected client channel frame kind ${frame.kind}`);
    }
    const requestId = String(frame.header.requestId ?? '');
    const request = this.requests.get(requestId);
    if (!request) {
      if (requestId === 'negotiation') {
        this.welcomeReject?.(
          new Error(this.responseErrorMessage(frame.header)),
        );
        return;
      }
      throw new Error(`Response for unknown request ${requestId}`);
    }
    this.requests.delete(requestId);
    if (frame.header.error)
      request.reject(new Error(this.responseErrorMessage(frame.header)));
    else request.resolve(frame.header.result as Record<string, unknown>);
  }

  protected async handleRequest(
    header: Record<string, unknown>,
  ): Promise<void> {
    const requestId = String(header.requestId ?? '');
    const method = String(header.method ?? '');
    if (!requestId || !method || !this.requestHandler) {
      this.send(ChannelFrame.Class.FRAME_KIND.Response, {
        requestId,
        error: {
          code: 'METHOD_NOT_FOUND',
          message: `Unsupported method ${method}`,
        },
      });
      return;
    }
    try {
      const parameters =
        header.parameters && typeof header.parameters === 'object'
          ? (header.parameters as Record<string, unknown>)
          : {};
      const result = await this.requestHandler(method, parameters);
      this.send(ChannelFrame.Class.FRAME_KIND.Response, {
        requestId,
        result,
      });
    } catch (error) {
      this.send(ChannelFrame.Class.FRAME_KIND.Response, {
        requestId,
        error: {
          code: 'INTERNAL',
          message: String((error as Error)?.message ?? error),
        },
      });
    }
  }

  protected responseErrorMessage(header: Record<string, unknown>): string {
    const error = header.error as
      { code?: unknown; message?: unknown } | undefined;
    return `${String(error?.code ?? 'INTERNAL')}: ${String(error?.message ?? 'Channel request failed')}`;
  }

  protected send(
    kind: ChannelFrameKind,
    header: Record<string, unknown>,
  ): void {
    this.write(ChannelFrame.Class.encode(kind, header));
  }
}

export namespace ChannelClient {
  export const $Class = Static($ChannelClient);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface ChannelUploadResult {
  path: string;
  size: number;
  sha256: string;
}

interface PendingRequest {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: unknown) => void;
}

export type ChannelRequestHandler = (
  method: string,
  parameters: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
