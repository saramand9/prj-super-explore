/**
 * 渲染进程 IPC 客户端。
 * 封装 window.explore 调用，提供类型安全的 API。
 */

import type { IpcChannels, IpcErrorInfo, IpcEvents } from '@explore/shared';

type ExploreApi = Window['explore'];
const IPC_ERROR_PREFIX = '__EXPLORE_IPC_ERROR__';

const win = window as unknown as { explore?: ExploreApi };

function getApi(): ExploreApi | null {
  if (!win.explore) return null;
  return win.explore;
}

function panic(msg: string): never {
  // 不抛同步异常，避免 React unmount 导致白屏
  console.error(`[IPC] ${msg}`);
  throw new Error(msg);
}

export class IpcClientError extends Error {
  readonly info: IpcErrorInfo;

  constructor(info: IpcErrorInfo) {
    super(formatIpcErrorMessage(info));
    this.name = 'IpcClientError';
    this.info = info;
  }
}

export function getIpcErrorMessage(err: unknown, fallback = '操作失败'): string {
  if (err instanceof IpcClientError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export const ipc = {
  async invoke<C extends keyof IpcChannels>(
    channel: C,
    payload: IpcChannels[C]['req'],
  ): Promise<IpcChannels[C]['res']> {
    const api = getApi();
    if (!api) {
      throw new IpcClientError({
        code: 'IPC_BRIDGE_MISSING',
        message: 'IPC 桥接不可用',
        channel: String(channel),
      });
    }
    try {
      return await api.requests[channel](payload);
    } catch (err) {
      throw normalizeIpcError(channel, err);
    }
  },

  on<C extends keyof IpcEvents>(channel: C, callback: (payload: IpcEvents[C]) => void): () => void {
    const api = getApi();
    if (!api) {
      console.error('[IPC] bridge not available, cannot listen to', channel);
      return () => {};
    }
    return api.events[channel](callback);
  },

  once<C extends keyof IpcEvents>(channel: C, callback: (payload: IpcEvents[C]) => void): void {
    const api = getApi();
    if (!api) return;
    const unsubscribe = api.events[channel]((payload) => {
      unsubscribe();
      callback(payload);
    });
  },
};

function normalizeIpcError(channel: keyof IpcChannels, err: unknown): IpcClientError {
  const parsed = parseIpcErrorInfo(err);
  if (parsed) return new IpcClientError(parsed);

  const message = err instanceof Error && err.message ? err.message : '操作失败';
  return new IpcClientError({
    code: 'UNKNOWN',
    message,
    channel: String(channel),
  });
}

function parseIpcErrorInfo(err: unknown): IpcErrorInfo | null {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const idx = message.indexOf(IPC_ERROR_PREFIX);
  if (idx < 0) return null;

  const raw = message.slice(idx + IPC_ERROR_PREFIX.length).trim();
  if (raw.startsWith('b64:')) {
    return parseBase64UrlIpcError(raw.slice(4));
  }

  try {
    return JSON.parse(raw) as IpcErrorInfo;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1)) as IpcErrorInfo;
    } catch {
      return null;
    }
  }
}

function parseBase64UrlIpcError(payload: string): IpcErrorInfo | null {
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return JSON.parse(new TextDecoder('utf-8').decode(bytes)) as IpcErrorInfo;
  } catch {
    return null;
  }
}

function formatIpcErrorMessage(info: IpcErrorInfo): string {
  const parts = [info.message];
  if (info.path) parts.push(info.path);
  if (info.details) parts.push(info.details);
  return parts.join('\n');
}
