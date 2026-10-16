import type { IpcChannels, IpcErrorCode, IpcErrorInfo } from '@explore/shared';
const IPC_ERROR_PREFIX = '__EXPLORE_IPC_ERROR__';

export function createIpcCodedError(code: IpcErrorCode, message: string, path?: string): Error {
  const err = new Error(message) as Error & { code?: IpcErrorCode; path?: string };
  err.code = code;
  err.path = path;
  return err;
}

export function toIpcError(channel: keyof IpcChannels, err: unknown): Error {
  return new Error(`${IPC_ERROR_PREFIX}${encodeIpcErrorInfo(toIpcErrorInfo(channel, err))}`);
}

export function toIpcErrorInfo(channel: keyof IpcChannels, err: unknown): IpcErrorInfo {
  const anyErr = err as { code?: string; message?: string; path?: string; filePath?: string; errno?: number };
  const nativeCode = typeof anyErr?.code === 'string' ? anyErr.code : undefined;
  const code = mapErrorCode(channel, nativeCode);
  const path =
    typeof anyErr?.path === 'string'
      ? anyErr.path
      : typeof anyErr?.filePath === 'string'
        ? anyErr.filePath
        : undefined;
  const details = anyErr?.message && anyErr.message !== userMessageFor(code) ? anyErr.message : undefined;

  return {
    code,
    message: userMessageFor(code),
    channel: String(channel),
    nativeCode,
    path,
    details,
  };
}

function encodeIpcErrorInfo(info: IpcErrorInfo): string {
  return `b64:${Buffer.from(JSON.stringify(info), 'utf8').toString('base64url')}`;
}

function mapErrorCode(channel: keyof IpcChannels, nativeCode?: string): IpcErrorCode {
  switch (nativeCode) {
    case 'FILE_NOT_FOUND':
    case 'PERMISSION_DENIED':
    case 'PATH_TOO_LONG':
    case 'FILE_TOO_LARGE':
    case 'INVALID_ENCODING':
    case 'IS_DIRECTORY':
    case 'WATCH_FAILED':
    case 'PROCESS_FAILED':
    case 'IPC_BRIDGE_MISSING':
    case 'INVALID_REQUEST':
      return nativeCode;
    case 'ENOENT':
    case 'ENOTDIR':
      return 'FILE_NOT_FOUND';
    case 'EACCES':
    case 'EPERM':
      return 'PERMISSION_DENIED';
    case 'ENAMETOOLONG':
      return 'PATH_TOO_LONG';
    case 'EISDIR':
      return 'IS_DIRECTORY';
    default:
      return String(channel).startsWith('search:') ? 'PROCESS_FAILED' : 'UNKNOWN';
  }
}

function userMessageFor(code: IpcErrorCode): string {
  switch (code) {
    case 'FILE_NOT_FOUND':
      return '文件不存在或已被移动';
    case 'PERMISSION_DENIED':
      return '没有权限访问此路径';
    case 'PATH_TOO_LONG':
      return '路径过长，系统无法访问';
    case 'FILE_TOO_LARGE':
      return '文件过大，已停止读取';
    case 'INVALID_ENCODING':
      return '文件编码不是有效的 UTF-8 文本，无法预览';
    case 'IS_DIRECTORY':
      return '这是文件夹，不能按文本预览';
    case 'WATCH_FAILED':
      return '文件监听失败，内容不会自动刷新';
    case 'PROCESS_FAILED':
      return '搜索进程执行失败';
    case 'IPC_BRIDGE_MISSING':
      return 'IPC 桥接不可用';
    case 'INVALID_REQUEST':
      return '请求参数无效';
    default:
      return '操作失败';
  }
}
