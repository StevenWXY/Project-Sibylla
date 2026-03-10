import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, errorInfo: ErrorInfo) => ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 * 
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details for debugging
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Error info:', errorInfo)
    
    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback && this.state.error && this.state.errorInfo) {
        return this.props.fallback(this.state.error, this.state.errorInfo)
      }

      // Default fallback UI
      return (
        <div className="flex h-screen items-center justify-center bg-notion-bg-primary dark:bg-gray-900">
          <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-lg dark:border-red-800 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <span className="text-2xl">⚠️</span>
              </div>
              <h2 className="text-xl font-semibold text-red-900 dark:text-red-100">
                应用出错了
              </h2>
            </div>
            
            <p className="mb-4 text-sm text-notion-text-secondary dark:text-gray-400">
              很抱歉，应用遇到了一个意外错误。您可以尝试重新加载应用。
            </p>
            
            {this.state.error && (
              <details className="mb-4 rounded-md bg-red-50 p-3 dark:bg-red-900/20">
                <summary className="cursor-pointer text-sm font-medium text-red-800 dark:text-red-200">
                  错误详情
                </summary>
                <pre className="mt-2 overflow-auto text-xs text-red-700 dark:text-red-300">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            
            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="flex-1 rounded-lg bg-notion-accent px-4 py-2 text-sm font-medium text-white hover:bg-notion-accent/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-accent focus-visible:ring-offset-2"
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 rounded-lg border border-notion-border-default bg-transparent px-4 py-2 text-sm font-medium text-notion-text-primary hover:bg-notion-bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-border-default focus-visible:ring-offset-2 dark:text-white dark:border-gray-600 dark:hover:bg-gray-800"
              >
                重新加载
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
