export interface Service {
  serviceName?: string;
  init?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export class ServiceContainer {
  private services = new Map<string, unknown>();
  private factoryOrder: string[] = [];

  register<T>(token: string, factory: (ctx: ServiceContainer) => T): T {
    if (this.services.has(token)) {
      throw new Error(`Service "${token}" already registered`);
    }
    const instance = factory(this);
    this.services.set(token, instance);
    this.factoryOrder.push(token);
    return instance;
  }

  get<T>(token: string): T {
    const svc = this.services.get(token);
    if (!svc) throw new Error(`Service "${token}" not found`);
    return svc as T;
  }

  tryGet<T>(token: string): T | undefined {
    return this.services.get(token) as T | undefined;
  }

  async initAll(): Promise<void> {
    for (const token of this.factoryOrder) {
      const svc = this.services.get(token) as Service;
      if (svc.init) await svc.init();
    }
  }

  async disposeAll(): Promise<void> {
    const errors: unknown[] = [];
    for (const token of [...this.factoryOrder].reverse()) {
      const svc = this.services.get(token) as Service;
      try { if (svc?.dispose) await svc.dispose(); } catch (error) { errors.push(error); }
    }
    this.services.clear();
    this.factoryOrder = [];
    if (errors.length) throw new AggregateError(errors, 'Some services could not be disposed');
  }
}
