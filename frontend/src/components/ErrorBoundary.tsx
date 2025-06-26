import React, { Component, ErrorInfo, ReactNode } from 'react';

// Debug logger with timestamp
const debugLog = (action: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`🐛 [${timestamp}] [ErrorBoundary] ${action}`, data || '');
};

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
    debugLog('Component created');
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    debugLog('getDerivedStateFromError called', { errorMessage: error.message, errorStack: error.stack });
    
    return { 
      hasError: true, 
      error 
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    debugLog('componentDidCatch called', { 
      errorMessage: error.message, 
      errorStack: error.stack,
      componentStack: errorInfo.componentStack 
    });
    
    console.error('🚨 [ErrorBoundary] Caught error:', error);
    console.error('🚨 [ErrorBoundary] Error info:', errorInfo);
    
    // Log to help with debugging
    console.error('🚨 [ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    // Log memory usage if available
    if ((performance as any).memory) {
      debugLog('Memory usage at error time', {
        used: `${((performance as any).memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
        total: `${((performance as any).memory.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
        limit: `${((performance as any).memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`
      });
    }
    
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    debugLog('render called', { hasError: this.state.hasError });
    
    if (this.state.hasError) {
      debugLog('Rendering error fallback UI', { 
        errorMessage: this.state.error?.message,
        hasCustomFallback: !!this.props.fallback 
      });
      
      // Fallback UI
      return this.props.fallback || (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm mb-2">
            An error occurred in the application. Please refresh the page.
          </p>
          {this.state.error && (
            <details className="text-xs bg-red-50 p-2 rounded mt-2">
              <summary className="cursor-pointer font-medium">Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => {
              debugLog('Refresh button clicked');
              window.location.reload();
            }}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;