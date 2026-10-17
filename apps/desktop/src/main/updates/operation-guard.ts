const MUTATIONS = new Set([
  'file:copy',
  'file:move',
  'file:delete',
  'file:mkdir',
  'file:create',
  'file:rename',
  'plugin:install',
]);

/** Tracks the whole IPC promise, including conflict handling and filesystem cleanup. */
export class OperationGuard {
  private active = 0;
  private sealed = false;

  async run<T>(channel: string, action: () => T | Promise<T>): Promise<T> {
    if (!MUTATIONS.has(channel)) return action();
    if (this.sealed) throw new Error('正在准备更新，请稍后重试文件操作。');
    this.active++;
    try {
      return await action();
    } finally {
      this.active--;
    }
  }

  acquire(): boolean {
    if (this.active > 0 || this.sealed) return false;
    this.sealed = true;
    return true;
  }

  release(): void {
    this.sealed = false;
  }
}
