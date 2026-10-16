import { Component, type ReactNode, type ErrorInfo } from 'react';
import { ipc } from '../framework/bridge/ipc-client';
import { reportError } from '../framework/diagnostics';

interface Props {
  children: ReactNode;
  name: string;
  resetKey?: string;
}

interface State {
  error: Error | null;
  copied: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: '' };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(this.props.name, new Error(`${error.message}\n${error.stack ?? ''}\n${info.componentStack ?? ''}`));
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null, copied: '' });
  }

  private copyDiagnostics = async () => {
    try {
      await ipc.invoke('app:copyDiagnostics', { source: this.props.name, message: this.state.error?.message, stack: this.state.error?.stack });
      this.setState({ copied: '已复制诊断信息' });
    } catch { this.setState({ copied: '复制失败，请从帮助菜单打开日志目录' }); }
  };

  render() {
    if (this.state.error) {
      return (
        <div role="alert" data-testid="panel-error" className="m-3 rounded border border-red-500/40 bg-surface-light p-4 text-sm text-text-primary">
          <strong>此区域暂时无法显示</strong>
          <p className="my-2 text-xs text-text-muted">可以重新加载此区域；若问题持续，可复制诊断信息帮助定位。</p>
          <div className="flex gap-3 text-xs">
            <button className="rounded bg-accent px-3 py-1 text-white" onClick={() => this.setState({ error: null, copied: '' })}>重新加载</button>
            <button className="rounded border border-border px-3 py-1" onClick={() => void this.copyDiagnostics()}>复制诊断信息</button>
          </div>
          {this.state.copied && <p className="mt-2 text-xs">{this.state.copied}</p>}
          <details className="mt-3 text-xs text-text-muted">
            <summary className="cursor-pointer">错误详情</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{this.state.error.message}{'\n'}{this.state.error.stack}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
