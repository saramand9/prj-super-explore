import type { UpdateState } from '@explore/shared';
import type { OperationGuard } from './operation-guard';

export interface UpdateEvents {
  available: (version: string) => void;
  notAvailable: () => void;
  progress: (percent: number) => void;
  downloaded: (version: string) => void;
  error: (error: unknown) => void;
}

export interface UpdateEngine {
  subscribe: (events: UpdateEvents) => () => void;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => void;
}

interface InstallSafety {
  guard: OperationGuard;
  save: () => Promise<boolean>;
  permitQuit: (allow: boolean) => void;
}

/** The UI receives snapshots only; download paths and provider credentials never cross IPC. */
export class UpdateController {
  private state: UpdateState;
  private listeners = new Set<(state: UpdateState) => void>();
  private unsubscribe?: () => void;
  private disposed = false;
  private checking = false;
  private lastCheck = -Infinity;

  constructor(
    version: string,
    private engine: UpdateEngine | null,
    private safety: InstallSafety,
  ) {
    this.state = { currentVersion: version, status: engine ? 'idle' : 'disabled' };
    this.unsubscribe = engine?.subscribe({
      available: (availableVersion) => {
        if (this.state.status === 'checking') this.set({ status: 'available', availableVersion });
      },
      notAvailable: () => {
        if (this.state.status === 'checking') this.set({ status: 'idle', availableVersion: undefined });
      },
      progress: (percent) => {
        if (this.state.status === 'downloading' && Number.isFinite(percent))
          this.set({ percent: Math.max(0, Math.min(100, percent)) });
      },
      downloaded: (version) => {
        if (this.state.status === 'downloading' && version === this.state.availableVersion)
          this.set({ status: 'downloaded', percent: 100 });
      },
      error: () => this.fail(),
    });
  }

  snapshot(): UpdateState {
    return { ...this.state };
  }

  subscribe(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async check(): Promise<UpdateState> {
    if (
      this.disposed ||
      !this.engine ||
      this.checking ||
      Date.now() - this.lastCheck < 30000 ||
      !['idle', 'error', 'available'].includes(this.state.status)
    )
      return this.snapshot();
    this.checking = true;
    this.lastCheck = Date.now();
    this.set({ status: 'checking', message: undefined, percent: undefined, checkedAt: Date.now() });
    try {
      await this.engine.check();
    } catch {
      this.fail(); /* Transport errors are logged by the engine and surfaced in the state. */
    } finally {
      this.checking = false;
    }
    return this.snapshot();
  }

  async download(): Promise<UpdateState> {
    if (this.disposed || !this.engine || this.state.status !== 'available') return this.snapshot();
    this.set({ status: 'downloading', percent: 0, message: undefined });
    try {
      await this.engine.download();
    } catch {
      this.fail(); /* A failed integrity check must never become an installable state. */
    }
    return this.snapshot();
  }

  async install(): Promise<UpdateState> {
    if (this.disposed || !this.engine || this.state.status !== 'downloaded') return this.snapshot();
    if (!this.safety.guard.acquire()) {
      this.set({ message: '文件操作尚未完成，请完成后再重启安装。' });
      return this.snapshot();
    }
    this.set({ status: 'preparing', message: undefined });
    try {
      const saved = await this.safety.save();
      if (this.disposed || this.snapshot().status !== 'preparing') return this.snapshot();
      if (!saved) {
        this.safety.guard.release();
        this.set({ status: 'downloaded', message: '工作空间或设置未能保存，已取消安装。请重试。' });
      } else {
        this.safety.permitQuit(true);
        this.set({ status: 'installing' });
        this.engine.install();
      }
    } catch {
      this.fail(); /* Restores the close guard and file operations when installer startup fails. */
    }
    return this.snapshot();
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.listeners.clear();
    this.safety.guard.release();
  }

  private fail(): void {
    if (this.disposed) return;
    const installing = ['preparing', 'installing', 'downloaded'].includes(this.state.status);
    if (installing) {
      this.safety.permitQuit(false);
      this.safety.guard.release();
    }
    this.set({
      status: installing ? 'downloaded' : 'error',
      message: installing
        ? '安装未能启动，已保留当前窗口。请重试或从 GitHub 手动下载安装包。'
        : '更新检查或下载失败。请检查 GitHub 网络连接后重试；校验失败的安装包不会被执行。',
    });
  }

  private set(patch: Partial<UpdateState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.snapshot());
  }
}
