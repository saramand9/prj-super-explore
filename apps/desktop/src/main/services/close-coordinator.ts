interface CloseActions {
  requestSave: (id: number) => void;
  cancelSave: (id: number) => void;
  close: () => void;
  askTimeout: () => Promise<'retry' | 'cancel' | 'discard'>;
}

/** Request IDs ensure that a late save response cannot close a window after the user chose to stay. */
export class CloseCoordinator {
  confirmed = false;
  private waiting = false;
  private prompting = false;
  private requestId = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private actions: CloseActions,
    private timeoutMs = 8000,
  ) {}

  begin(): void {
    if (this.waiting || this.prompting) return;
    this.waiting = true;
    const id = ++this.requestId;
    this.timer = setTimeout(() => void this.timeout(id), this.timeoutMs);
    this.actions.requestSave(id);
  }

  userIsDeciding(id: number): void {
    if (this.waiting && id === this.requestId) clearTimeout(this.timer);
  }

  resolve(id: number, allow: boolean): void {
    if (!this.waiting || id !== this.requestId) return;
    clearTimeout(this.timer);
    this.waiting = false;
    if (allow) {
      this.confirmed = true;
      this.actions.close();
    }
  }

  reset(): void {
    clearTimeout(this.timer);
    this.requestId++;
    this.waiting = false;
    this.prompting = false;
    this.confirmed = false;
  }

  private async timeout(id: number): Promise<void> {
    if (!this.waiting || id !== this.requestId) return;
    this.waiting = false;
    this.prompting = true;
    this.actions.cancelSave(id);
    const choice = await this.actions.askTimeout().catch(() => 'cancel' as const);
    if (id !== this.requestId) return;
    this.prompting = false;
    if (choice === 'retry') this.begin();
    else if (choice === 'discard') {
      this.confirmed = true;
      this.actions.close();
    }
  }
}
