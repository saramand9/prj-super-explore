import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  name: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 16,
            color: '#ff4444',
            background: '#2a0000',
            border: '1px solid #ff4444',
            margin: 8,
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          <strong>[{this.props.name}] Error:</strong>
          {'\n'}{this.state.error.message}
          {'\n\n'}{this.state.error.stack}
        </div>
      );
    }
    return this.props.children;
  }
}
