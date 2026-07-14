import { Loader2 } from 'lucide-react';

export function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col w-full animate-pulse">
      {/* Brand Navbar Placeholder */}
      <header className="bg-white border-b border-slate-200/60 sticky top-0 z-50 px-4 py-3 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="w-24 h-8 bg-slate-200 rounded-xl"></div>
          <div className="w-8 h-8 bg-slate-200 rounded-full"></div>
        </div>
      </header>

      {/* Main Container Placeholder */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 pb-24 space-y-6">
        <div className="h-40 bg-white border border-slate-100 rounded-3xl p-5 space-y-3">
          <div className="w-1/3 h-5 bg-slate-200 rounded-lg"></div>
          <div className="w-3/4 h-4 bg-slate-200 rounded-lg"></div>
          <div className="w-1/2 h-4 bg-slate-200 rounded-lg"></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="h-28 bg-white border border-slate-100 rounded-3xl p-4 space-y-3">
            <div className="w-1/2 h-4 bg-slate-200 rounded-lg"></div>
            <div className="w-1/3 h-3 bg-slate-200 rounded-lg"></div>
          </div>
          <div className="h-28 bg-white border border-slate-100 rounded-3xl p-4 space-y-3">
            <div className="w-1/2 h-4 bg-slate-200 rounded-lg"></div>
            <div className="w-1/3 h-3 bg-slate-200 rounded-lg"></div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function ContentSkeleton() {
  return (
    <div className="space-y-6 animate-pulse w-full">
      <div className="bg-white border border-slate-200/60 rounded-3xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-200 rounded-lg w-1/3"></div>
            <div className="h-3 bg-slate-200 rounded-lg w-1/4"></div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-200 rounded-lg w-full"></div>
          <div className="h-3 bg-slate-200 rounded-lg w-5/6"></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-3xl p-5 space-y-4 shadow-xs">
        <div className="h-4 bg-slate-200 rounded-lg w-1/4"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 border border-slate-100 rounded-2xl space-y-2 flex flex-col items-center">
              <div className="w-8 h-8 bg-slate-200 rounded-full"></div>
              <div className="h-3 bg-slate-200 rounded-lg w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LoadingSpinner({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
      <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      <span className="text-xs text-slate-500 font-medium font-arabic">{message}</span>
    </div>
  );
}
