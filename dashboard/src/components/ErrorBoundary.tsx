import React, { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleResetStorage = () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // ignore
    }
    window.location.href = '/'
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 text-slate-900 font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg w-full shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-4 font-bold text-lg">
              !
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Application Encountered an Error
            </h1>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              PulseGrid encountered a runtime rendering exception. You can reload the page or reset cached session storage to recover.
            </p>

            {this.state.error && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-left overflow-auto max-h-40">
                <p className="text-xs font-mono font-bold text-red-700">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="text-[10px] font-mono text-slate-500 mt-2 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-sm cursor-pointer"
              >
                Reload Dashboard
              </button>
              <button
                onClick={this.handleResetStorage}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-all cursor-pointer"
              >
                Reset Local Cache
              </button>
            </div>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
