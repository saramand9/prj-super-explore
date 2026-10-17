/** Never treats a timeout, stale response or a different window as successful persistence. */
export class UpdateSaveBarrier {
  private requestId = 0;
  private pending?: { owner: number; id: number; finish: (allow: boolean) => void };
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private send: (id: number) => void) {}

  wait(owner: number): Promise<boolean> {
    this.cancel();
    const id = ++this.requestId;
    return new Promise<boolean>((finish) => {
      this.pending = { owner, id, finish };
      this.timer = setTimeout(() => this.cancel(), 15000);
      try {
        this.send(id);
      } catch {
        this.cancel(); /* A disappearing renderer cannot safely authorize installation. */
      }
    });
  }

  resolve(owner: number, id: number, allow: boolean): void {
    if (this.pending?.owner !== owner || this.pending.id !== id) return;
    this.finish(allow);
  }

  cancel(): void {
    this.finish(false);
  }

  private finish(allow: boolean): void {
    clearTimeout(this.timer);
    const pending = this.pending;
    this.pending = undefined;
    pending?.finish(allow);
  }
}
