import { open as openFileHandle, readFile, stat } from 'node:fs/promises';
import type { IpcChannels, FileReadResult } from '@explore/shared';
import { createIpcCodedError } from './ipc-errors';
const DEFAULT_TEXT_PREVIEW_LIMIT = 1024 * 1024;

export async function readTextFile(payload: IpcChannels['file:read']['req']): Promise<FileReadResult> {
  const limit = payload.maxSize ?? DEFAULT_TEXT_PREVIEW_LIMIT;
  const st = await stat(payload.path);
  if (st.isDirectory()) {
    throw createIpcCodedError('IS_DIRECTORY', '这是文件夹，不能按文本预览', payload.path);
  }

  if (payload.loadFull || st.size <= limit) {
    const buffer = await readFile(payload.path);
    return {
      content: decodeUtf8(buffer, false, payload.path),
      size: st.size,
      bytesRead: buffer.length,
    };
  }

  const handle = await openFileHandle(payload.path, 'r');
  try {
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    const chunk = buffer.subarray(0, bytesRead);
    return {
      content: decodeUtf8(chunk, true, payload.path),
      size: st.size,
      bytesRead,
      partial: true,
      limit,
      canContinue: true,
    };
  } finally {
    await handle.close();
  }
}

function decodeUtf8(buffer: Buffer, stream: boolean, filePath: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer, { stream });
  } catch {
    throw createIpcCodedError('INVALID_ENCODING', '文件不是有效的 UTF-8 文本，无法预览', filePath);
  }
}
