import React from 'react';

/**
 * Catches render-time errors in any child page so a single broken component
 * shows a readable message instead of blanking the whole app. Without this, an
 * uncaught error in one page unmounts the entire React tree (white screen).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface in console for diagnosis; never swallow silently.
    // eslint-disable-next-line no-console
    console.error('[UI ErrorBoundary]', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Reset the boundary when navigating to a different route.
    if (prevProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <div className="max-w-2xl mx-auto bg-white border border-red-200 rounded-xl shadow p-6">
            <h2 className="text-lg font-bold text-red-700 mb-2">This screen hit an error</h2>
            <p className="text-sm text-gray-600 mb-3">
              The rest of the app is fine — you can switch pages from the sidebar. If this keeps
              happening, share the message below.
            </p>
            <pre className="text-xs bg-gray-50 border rounded-lg p-3 overflow-x-auto text-red-600 whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
