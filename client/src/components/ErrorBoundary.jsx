import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-5">
        <h4>Something broke</h4>
        <pre className="text-danger" style={{ whiteSpace: 'pre-wrap' }}>
          {String(this.state.error.stack || this.state.error)}
        </pre>
        <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}