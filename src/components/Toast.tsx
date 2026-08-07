import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { CheckCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react';
import { sounds } from '../hooks/useSounds';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'loading';
  duration?: number;
}

interface ToastContextType {
  toast: (message: string, type?: Toast['type'], duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  loading: (message: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const noop = () => {};
const noopId = '';

const defaultCtx: ToastContextType = {
  toast: () => noopId,
  success: noop,
  error: noop,
  info: noop,
  loading: () => noopId,
  dismiss: noop,
};

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx || defaultCtx;
}

let toastCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const toast = useCallback((message: string, type: Toast['type'] = 'info', duration = 4000) => {
    const id = `toast-${++toastCounter}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);

    if (type === 'success') sounds.success();
    else if (type === 'error') sounds.error();
    else if (type === 'info') sounds.notification();

    if (type !== 'loading' && duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  const success = useCallback((msg: string) => toast(msg, 'success'), [toast]);
  const error = useCallback((msg: string) => toast(msg, 'error', 6000), [toast]);
  const info = useCallback((msg: string) => toast(msg, 'info'), [toast]);
  const loading = useCallback((msg: string) => toast(msg, 'loading', 0), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, loading, dismiss }}>
      {children}
      <div className="fixed top-16 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg shadow-black/20 animate-in slide-in-from-right backdrop-blur-xl transition-all ${
              t.type === 'success' ? 'bg-green-400/10 border-green-400/30 text-green-400' :
              t.type === 'error' ? 'bg-red-400/10 border-red-400/30 text-red-400' :
              t.type === 'loading' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' :
              'bg-mvo-panel border-mvo-border text-mvo-text'
            }`}
          >
            {t.type === 'success' && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'error' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'info' && <Info className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'loading' && <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />}
            <span className="text-sm flex-1">{t.message}</span>
            {t.type !== 'loading' && (
              <button onClick={() => dismiss(t.id)} className="text-mvo-textDim hover:text-mvo-text p-0.5">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
