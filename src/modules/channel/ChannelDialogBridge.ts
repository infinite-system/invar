import { Static } from 'ivue/extras';
import { createConnection } from 'node:net';
import { Environment } from '../system/Environment';

class $ChannelDialogBridge {
  static async pickFile(): Promise<ChannelDialogResult> {
    const socketPath = Environment.Class.env('INVAR_CHANNEL_SOCKET');
    if (!socketPath) return { available: false, path: null };
    try {
      const path = await this.request(socketPath);
      return { available: true, path };
    } catch {
      return { available: false, path: null };
    }
  }

  protected static request(socketPath: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(socketPath);
      let responseText = '';
      socket.setEncoding('utf8');
      socket.on('connect', () =>
        socket.write(`${JSON.stringify({ method: 'dialog.request' })}\n`),
      );
      socket.on('data', (text) => {
        responseText += text;
        const newlineIndex = responseText.indexOf('\n');
        if (newlineIndex < 0) return;
        const response = JSON.parse(responseText.slice(0, newlineIndex)) as {
          path?: unknown;
          error?: unknown;
        };
        socket.end();
        if (response.error) reject(new Error(String(response.error)));
        else resolve(typeof response.path === 'string' ? response.path : null);
      });
      socket.on('error', reject);
    });
  }
}

export namespace ChannelDialogBridge {
  export const $Class = Static($ChannelDialogBridge);
  export let Class = $Class;
}

export interface ChannelDialogResult {
  available: boolean;
  path: string | null;
}
