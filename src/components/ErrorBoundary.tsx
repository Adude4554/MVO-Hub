import React from 'react';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MVO ERROR BOUNDARY]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: '#0a0e1a', color: '#ff4466', fontFamily: 'monospace', minHeight: '100vh', overflow: 'auto' }}>
          <h1 style={{ color: '#ff4466', fontSize: 18 }}>MVO Hub — Crash Report</h1>
          <pre style={{ color: '#ff8899', whiteSpace: 'pre-wrap', marginTop: 12, fontSize: 13 }}>
            {this.state.error.message}
          </pre>
          <pre style={{ color: '#667', whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 11 }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
