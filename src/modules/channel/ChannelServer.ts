import { Static } from 'ivue/extras';
import { unlink } from 'node:fs/promises';
import {
  ChannelFrame,
  type ChannelFrameKind,
  type ChannelDecodedFrame,
} from './ChannelFrame';
import { ChannelStreamQueue } from './ChannelStreamQueue';
import { Dropzone } from './Dropzone';

class $ChannelServer {
  static async main(): Promise<void> {
    const server = new this((bytes) => process.stdout.write(bytes));
    for await (const bytes of Bun.stdin.stream()) await server.receive(bytes);
  }

  constructor(protected readonly write: (bytes: Uint8Array) => void) {}

  protected readonly decoder = new ChannelFrame.Class();
  protected negotiated = false;
  protected readonly uploads = new Map<string, PendingUpload>();

  async receive(bytes: Uint8Array): Promise<void> {
    for (const frame of this.decoder.push(bytes)) await this.handleFrame(frame);
  }

  protected async handleFrame(frame: ChannelDecodedFrame): Promise<void> {
    if (!this.negotiated) {
      this.handleHello(frame);
      return;
    }
    if (frame.kind === ChannelFrame.Class.FRAME_KIND.Request) {
      this.handleRequest(frame.header);
      return;
    }
    if (frame.kind === ChannelFrame.Class.FRAME_KIND.StreamOpen) {
      this.handleStreamOpen(frame.header);
      return;
    }
    if (frame.kind === ChannelFrame.Class.FRAME_KIND.StreamData) {
      this.handleStreamData(frame.header, frame.body);
      return;
    }
    if (frame.kind === ChannelFrame.Class.FRAME_KIND.StreamEnd) {
      await this.handleStreamEnd(frame.header);
      return;
    }
    if (frame.kind === ChannelFrame.Class.FRAME_KIND.Cancel) {
      this.handleCancel(frame.header);
      return;
    }
    throw new Error(`Unexpected channel frame kind ${frame.kind}`);
  }

  protected handleHello(frame: ChannelDecodedFrame): void {
    if (frame.kind !== ChannelFrame.Class.FRAME_KIND.Hello)
      throw new Error('Channel hello must be first');
    const versions = frame.header.versions;
    if (!Array.isArray(versions) || !versions.includes('1.0')) {
      this.respondError(
        'negotiation',
        'UNSUPPORTED_VERSION',
        'No common channel version',
      );
      throw new Error('No common channel version');
    }
    this.negotiated = true;
    this.send(ChannelFrame.Class.FRAME_KIND.Welcome, {
      version: '1.0',
      capabilities: ['drop.upload'],
    });
  }

  protected handleRequest(header: Record<string, unknown>): void {
    const requestId = this.requiredString(header.requestId, 'requestId');
    const method = this.requiredString(header.method, 'method');
    if (method !== 'drop.upload') {
      this.respondError(
        requestId,
        'METHOD_NOT_FOUND',
        `Unsupported method ${method}`,
      );
      return;
    }
    const parameters = this.requiredRecord(header.parameters, 'parameters');
    const streamId = this.requiredString(parameters.streamId, 'streamId');
    const name = this.requiredString(parameters.name, 'name');
    const size = this.requiredNumber(parameters.size, 'size');
    if (this.uploads.has(streamId))
      throw new Error(`Duplicate stream ${streamId}`);
    const queue = new ChannelStreamQueue.Class();
    const storage = Dropzone.Class.store(name, size, queue, {
      directory: process.env.INVAR_DROPZONE_DIRECTORY,
    });
    void storage.catch(() => undefined);
    this.uploads.set(streamId, {
      requestId,
      declaredByteCount: size,
      queue,
      storage,
      opened: false,
    });
  }

  protected handleStreamOpen(header: Record<string, unknown>): void {
    const streamId = this.requiredString(header.streamId, 'streamId');
    const upload = this.requiredUpload(streamId);
    const requestId = this.requiredString(header.requestId, 'requestId');
    const contentLength = this.requiredNumber(
      header.contentLength,
      'contentLength',
    );
    if (
      requestId !== upload.requestId ||
      contentLength !== upload.declaredByteCount
    ) {
      upload.queue.fail(
        new Error('Stream metadata does not match its request'),
      );
      this.uploads.delete(streamId);
      this.respondError(
        upload.requestId,
        'STREAM_MISMATCH',
        'Stream metadata does not match',
      );
      return;
    }
    upload.opened = true;
  }

  protected handleStreamData(
    header: Record<string, unknown>,
    body: Uint8Array,
  ): void {
    const streamId = this.requiredString(header.streamId, 'streamId');
    const upload = this.requiredUpload(streamId);
    if (!upload.opened)
      throw new Error(`Stream ${streamId} sent data before open`);
    upload.queue.push(body);
  }

  protected async handleStreamEnd(
    header: Record<string, unknown>,
  ): Promise<void> {
    const streamId = this.requiredString(header.streamId, 'streamId');
    const upload = this.requiredUpload(streamId);
    this.uploads.delete(streamId);
    upload.queue.end();
    try {
      const result = await upload.storage;
      const declaredHash = this.requiredString(header.sha256, 'sha256');
      if (declaredHash !== result.sha256) {
        await unlink(result.path).catch(() => undefined);
        this.respondError(
          upload.requestId,
          'HASH_MISMATCH',
          'Upload hash does not match',
        );
        return;
      }
      this.send(ChannelFrame.Class.FRAME_KIND.Response, {
        requestId: upload.requestId,
        result,
      });
    } catch (error) {
      const code = this.errorCode(error);
      this.respondError(
        upload.requestId,
        code,
        String((error as Error)?.message ?? error),
      );
    }
  }

  protected handleCancel(header: Record<string, unknown>): void {
    const requestId = this.requiredString(header.requestId, 'requestId');
    for (const [streamId, upload] of this.uploads) {
      if (upload.requestId !== requestId) continue;
      this.uploads.delete(streamId);
      upload.queue.fail(new Error('Channel request cancelled'));
    }
    this.respondError(requestId, 'CANCELLED', 'Channel request cancelled');
  }

  protected send(
    kind: ChannelFrameKind,
    header: Record<string, unknown>,
  ): void {
    this.write(ChannelFrame.Class.encode(kind, header));
  }

  protected respondError(
    requestId: string,
    code: string,
    message: string,
  ): void {
    this.send(ChannelFrame.Class.FRAME_KIND.Response, {
      requestId,
      error: { code, message },
    });
  }

  protected requiredUpload(streamId: string): PendingUpload {
    const upload = this.uploads.get(streamId);
    if (!upload) throw new Error(`Unknown channel stream ${streamId}`);
    return upload;
  }

  protected requiredString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error(`Missing ${name}`);
    return value;
  }

  protected requiredNumber(value: unknown, name: string): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error(`Invalid ${name}`);
    }
    return value;
  }

  protected requiredRecord(
    value: unknown,
    name: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid ${name}`);
    return value as Record<string, unknown>;
  }

  protected errorCode(error: unknown): string {
    const code = (error as { code?: unknown })?.code;
    return typeof code === 'string' ? code : 'INTERNAL';
  }
}

export namespace ChannelServer {
  export const $Class = Static($ChannelServer);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

interface PendingUpload {
  requestId: string;
  declaredByteCount: number;
  queue: ChannelStreamQueue.Model;
  storage: Promise<{ path: string; size: number; sha256: string }>;
  opened: boolean;
}
