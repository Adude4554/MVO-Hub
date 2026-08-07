import { useState, useEffect } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Loader2, X, CheckCircle, AlertTriangle, ArrowDownToLine, Package, RotateCcw } from 'lucide-react';
import { sounds } from '../hooks/useSounds';

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

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function DownloadBar() {
  const [downloads, setDownloads] = useState<Map<string, DownloadState>>(new Map());
  const [completed, setCompleted] = useState<{ id: string; name: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    const unsubs: Promise<UnlistenFn>[] = [];

    unsubs.push(
      listen('gv-download-progress', (event: any) => {
        const d: DownloadState = event.payload;
        setDownloads(prev => {
          const next = new Map(prev);
          if (d.status === 'complete' || d.status === 'error') {
            setTimeout(() => {
              setDownloads(current => {
                const n = new Map(current);
                n.delete(d.id);
                return n;
              });
            }, 2000);
          }
          next.set(d.id, { ...prev.get(d.id), ...d } as DownloadState);
          return next;
        });
        setCompleted(null);
      })
    );

    unsubs.push(
      listen('gv-extract-progress', (event: any) => {
        const d = event.payload;
        setDownloads(prev => {
          const next = new Map(prev);
          const existing = next.get(d.id);
          if (existing) {
            next.set(d.id, { ...existing, status: 'extracting', progress: d.progress || 0 });
          }
          return next;
        });
      })
    );

    unsubs.push(
      listen('gv-install-complete', (event: any) => {
        const { id, success, message } = event.payload;
        if (success) sounds.downloadComplete();
        setCompleted({ id, name: '', success, message });
        setTimeout(() => {
          setDownloads(current => {
            const n = new Map(current);
            n.delete(id);
            return n;
          });
          setCompleted(null);
        }, 5000);
      })
    );

    return () => {
      unsubs.forEach(p => p.then((fn: UnlistenFn) => fn()));
    };
  }, []);

  if (downloads.size === 0 && !completed) return null;

  const downloadList = Array.from(downloads.values());

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom">
      <div className="mx-4 mb-4">
        <div className="glass-strong rounded-xl border border-mvo-border/50 p-3 shadow-lg shadow-black/30 max-h-48 overflow-y-auto">
          {downloadList.map(d => (
            <div key={d.id} className="flex items-center gap-3 py-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {d.status === 'extracting' ? (
                  <Package className="w-4 h-4 text-green-400 flex-shrink-0 animate-pulse" />
                ) : d.status === 'error' ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                ) : d.status === 'complete' ? (
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                ) : (
                  <ArrowDownToLine className="w-4 h-4 text-cyan-400 flex-shrink-0 animate-pulse" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-mvo-text truncate">
                      {d.name || 'Downloading...'}
                    </span>
                    <span className="text-[10px] text-mvo-textDim flex-shrink-0">
                      {d.status === 'extracting' ? 'Extracting...' :
                       d.status === 'complete' ? 'Complete' :
                       d.status === 'error' ? 'Error' :
                       d.totalBytes > 0
                         ? `${formatSize(d.downloadedBytes)} / ${formatSize(d.totalBytes)}`
                         : `${formatSize(d.downloadedBytes)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-mvo-panel/50 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          d.status === 'extracting' ? 'bg-green-400' :
                          d.status === 'error' ? 'bg-red-400' :
                          'bg-cyan-400'
                        }`}
                        style={{ width: `${d.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-mvo-textDim flex-shrink-0 w-12 text-right">
                      {d.totalBytes > 0 && d.status === 'downloading'
                        ? `${Math.round(d.progress)}%`
                        : d.status === 'extracting' ? '...' :
                          d.status === 'complete' ? '100%' : ''}
                    </span>
                  </div>
                  {d.status === 'downloading' && d.speedBytes > 0 && d.totalBytes > 0 && (
                    <div className="text-[10px] text-mvo-textDim mt-0.5">
                      {formatSpeed(d.speedBytes)} · ETA {formatEta((d.totalBytes - d.downloadedBytes) / d.speedBytes)}
                    </div>
                  )}
                  {d.status === 'downloading' && d.speedBytes > 0 && d.totalBytes === 0 && (
                    <div className="text-[10px] text-mvo-textDim mt-0.5">
                      {formatSpeed(d.speedBytes)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {completed && downloads.size === 0 && (
            <div className="flex items-center gap-2 py-2">
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
