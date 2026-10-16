import { ipc } from './bridge/ipc-client';

export function reportError(source: string, reason: unknown): void {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  void ipc.invoke('app:reportError', { source, message: error.message, stack: error.stack }).catch(() => {});
}

export function registerErrorReporting(): void {
  window.addEventListener('error', (event) => reportError('renderer', event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => reportError('renderer-promise', event.reason));
}
