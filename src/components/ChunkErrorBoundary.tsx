import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  onGoHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ChunkErrorBoundary extends Component<Props, State> {
  // Use declare modifier to specify types of inherited React component members
  // that are treated as untyped in JavaScript-only React 19 environments,
  // preventing shadowing properties or constructor overrides at runtime.
  declare props: Props;
  declare setState: (
    state: State | ((prevState: State, props: Props) => State | Pick<State, never>) | Pick<State, never>,
    callback?: () => void
  ) => void;

  state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ChunkErrorBoundary] Caught error:', error, errorInfo);
    }
  }

  private handleRetry = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState(
      { hasError: false, error: null },
      () => this.props.onGoHome?.()
    );
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || '';
      const isChunkError = 
        errorMsg.includes('ChunkLoadError') || 
        errorMsg.includes('Failed to fetch dynamically imported module') ||
        errorMsg.includes('Importing a module script failed');

      return (
        <div className="bg-white p-6 rounded-3xl border border-slate-100/80 shadow-sm text-center my-8 space-y-6 max-w-md mx-auto animate-fade-in">
          <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500">
            <ShieldAlert className="w-6 h-6" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-base font-bold font-arabic text-slate-800">
              {isChunkError ? 'تعذر تحميل الصفحة المطلوبة' : 'حدث خطأ غير متوقع'}
            </h3>
            <p className="text-xs text-slate-500 font-arabic leading-relaxed">
              {isChunkError 
                ? 'ربما تم تحديث التطبيق مؤخراً أو أن اتصال الإنترنت لديك غير مستقر. يرجى محاولة التحديث.'
                : 'حدثت مشكلة أثناء عرض هذه الصفحة. يمكنك العودة للرئيسية أو إعادة المحاولة.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={this.handleRetry}
              className="bg-[#111111] hover:bg-slate-800 text-white font-arabic py-2.5 px-6 rounded-2xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={this.handleGoHome}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-arabic py-2.5 px-6 rounded-2xl text-xs font-bold transition-all cursor-pointer"
            >
              الرئيسية
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
