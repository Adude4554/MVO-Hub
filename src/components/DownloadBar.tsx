import { useState, useEffect } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Loader2, X, CheckCircle, AlertTriangle, ArrowDownToLine, Package } from 'lucide-react';

interface DownloadState {
  id: string;
  name: string;
  progress: number;
  speedBytes: number;
  downloadedBytes: number;
  totalBytes: number;
  status: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatSize(bytesPerSec)}/s`;
}

export function DownloadBar() {
  const [active, setActive] = useState<DownloadState | null>(null);
  const [completed, setCompleted] = useState<{ id: string; name: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    const unsubs: Promise<UnlistenFn>[] = [];

    unsubs.push(
      listen('gv-download-progress', (event: any) => {
        const d: DownloadState = event.payload;
        if (d.status === 'complete' || d.status === 'error') {
          setTimeout(() => setActive(null), 2000);
        }
        setActive(prev => prev ? { ...prev, ...d } : d);
        setCompleted(null);
      })
    );

    unsubs.push(
      listen('gv-extract-progress', (event: any) => {
        const d = event.payload;
        setActive(prev => prev ? {
          ...prev,
          status: 'extracting',
          progress: d.progress || 0,
        } : null);
      })
    );

    unsubs.push(
      listen('gv-install-complete', (event: any) => {
        const { id, success, message } = event.payload;
        setCompleted({ id, name: '', success, message });
        setTimeout(() => {
          setActive(null);
          setCompleted(null);
        }, 5000);
      })
    );

    return () => {
      unsubs.forEach(p => p.then((fn: UnlistenFn) => fn()));
    };
  }, []);

  if (!active && !completed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom">
      <div className="mx-4 mb-4">
        <div className="glass-strong rounded-xl border border-mvo-border/50 p-3 shadow-lg shadow-black/30">
          {active && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {active.status === 'extracting' ? (
                  <Package className="w-4 h-4 text-green-400 flex-shrink-0 animate-pulse" />
                ) : active.status === 'error' ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                ) : active.status === 'complete' ? (
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                ) : (
                  <ArrowDownToLine className="w-4 h-4 text-cyan-400 flex-shrink-0 animate-pulse" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-mvo-text truncate">
                      {active.name || 'Downloading...'}
                    </span>
                    <span className="text-[10px] text-mvo-textDim flex-shrink-0">
                      {active.status === 'extracting' ? 'Extracting...' :
                       active.status === 'complete' ? 'Complete' :
                       active.status === 'error' ? 'Error' :
                       active.totalBytes > 0
                         ? `${formatSize(active.downloadedBytes)} / ${formatSize(active.totalBytes)}`
                         : `${formatSize(active.downloadedBytes)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-mvo-panel/50 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          active.status === 'extracting' ? 'bg-green-400' :
                          active.status === 'error' ? 'bg-red-400' :
                          'bg-cyan-400'
                        }`}
                        style={{ width: `${active.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-mvo-textDim flex-shrink-0 w-12 text-right">
                      {active.totalBytes > 0 && active.status === 'downloading'
                        ? `${Math.round(active.progress)}%`
                        : active.status === 'extracting' ? '...' :
                          active.status === 'complete' ? '100%' : ''}
                    </span>
                  </div>
                  {active.status === 'downloading' && active.speedBytes > 0 && (
                    <div className="text-[10px] text-mvo-textDim mt-0.5">
                      {formatSpeed(active.speedBytes)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {completed && !active && (
            <div className="flex items-center gap-2">
              {completed.success ? (
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span className="text-xs text-mvo-text truncate flex-1">{completed.message}</span>
              <button onClick={() => setCompleted(null)} className="text-mvo-textDim hover:text-mvo-text p-1">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
