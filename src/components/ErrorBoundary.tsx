import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = window.location.origin;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div id="error-boundary-screen" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
          <div className="max-w-md w-full bg-white rounded-3xl border border-slate-100 p-8 shadow-xl text-center space-y-6">
            
            {/* Warning Icon */}
            <div className="inline-flex bg-amber-50 text-amber-600 p-4 rounded-2xl border border-amber-200 shadow-xs">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="font-sans font-bold text-xl tracking-tight text-slate-900">
                Algo não deu certo
              </h1>
              <p className="text-slate-500 text-sm max-w-sm mx-auto">
                Ocorreu um erro inesperado na execução do Vistoria Fácil IA. Mas não se preocupe, seus dados estão salvos em segurança no banco de dados.
              </p>
            </div>

            {/* Error Detail (collapsible/expandable for power users) */}
            {this.state.error && (
              <details className="text-left bg-slate-50 rounded-xl border border-slate-200 p-3 text-xs font-mono text-slate-600 max-h-40 overflow-auto">
                <summary className="cursor-pointer font-semibold text-slate-700 select-none">
                  Detalhes do erro para suporte
                </summary>
                <p className="mt-2 text-rose-600 break-all">{this.state.error.toString()}</p>
                {this.state.errorInfo && (
                  <pre className="mt-1 text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 px-4 rounded-xl shadow-md shadow-indigo-600/10 transition-all active:scale-98 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 animate-spin-hover" />
                Recarregar Página
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-sm py-3 px-4 rounded-xl transition-all active:scale-98 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                Ir para o Início
              </button>
            </div>
          </div>

          <p className="text-slate-400 text-[10px] mt-6 text-center font-mono">
            Vistoria Fácil IA V0.4.0-rc2 • Sistema Estabilizado
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
