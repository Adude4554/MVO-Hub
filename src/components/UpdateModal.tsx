import { useEffect } from 'react';
import { X, Download, CheckCircle, AlertTriangle, Loader2, Zap } from 'lucide-react';
import type { UpdateInfo, UpdateProgress } from '../hooks/useUpdater';

interface UpdateModalProps {
  update: UpdateInfo;
  progress: UpdateProgress | null;
  downloading: boolean;
  error: string | null;
  onUpdate: () => void;
  onClose: () => void;
}

export function UpdateModal({ update, progress, downloading, error, onUpdate, onClose }: UpdateModalProps) {
  const force = update.force;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={force ? undefined : onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-mvo-panel/95 backdrop-blur-xl border border-mvo-border/50 rounded-2xl shadow-2xl shadow-cyan-400/10 animate-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-mvo-border/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-mvo-text">New Version Available</h2>
              <p className="text-xs text-mvo-textDim">A new update is ready to install</p>
            </div>
          </div>
          {!force && (
            <button onClick={onClose} className="p-2 text-mvo-textMuted hover:text-white rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Version info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-mvo-bg/50 border border-mvo-border/30">
              <p className="text-[10px] text-mvo-textMuted uppercase tracking-wider mb-1">Current</p>
              <p className="font-mono text-sm text-mvo-text">{update.local || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-cyan-400/5 border border-cyan-400/20">
              <p className="text-[10px] text-cyan-400/70 uppercase tracking-wider mb-1">Latest</p>
              <p className="font-mono text-sm text-cyan-400">{update.version}</p>
            </div>
          </div>

          {/* Release date */}
          {update.pub_date && (
            <div className="text-xs text-mvo-textDim">
              Released: <span className="text-mvo-text">{update.pub_date}</span>
            </div>
          )}

          {/* File size */}
          {update.file_size && update.file_size > 0 && (
            <div className="text-xs text-mvo-textDim">
              Size: <span className="text-mvo-text">{(update.file_size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          )}

          {/* Release notes */}
          {update.notes && (
            <div className="p-3 rounded-xl bg-mvo-bg/50 border border-mvo-border/30">
              <p className="text-[10px] text-mvo-textMuted uppercase tracking-wider mb-2">Release Notes</p>
              <p className="text-sm text-mvo-textDim whitespace-pre-line leading-relaxed">{update.notes}</p>
            </div>
          )}

          {/* Force update notice */}
          {force && (
            <div className="p-3 rounded-xl bg-red-400/5 border border-red-400/30">
              <p className="text-sm text-red-400 font-medium">
                This version is no longer supported. Please update to continue using MVO Hub.
              </p>
            </div>
          )}

          {/* Download progress */}
          {downloading && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-mvo-textDim">
                  {progress.status === 'downloading' ? 'Downloading...' : progress.status === 'installing' ? 'Installing...' : 'Done'}
                </span>
                <span className="text-cyan-400 font-mono">{progress.percent || 0}%</span>
              </div>
              <div className="h-2 bg-mvo-bg/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent || 0}%` }}
                />
              </div>
              {progress.total && progress.total > 0 && (
                <div className="flex justify-between text-[10px] text-mvo-textMuted">
                  <span>{((progress.downloaded || 0) / 1024 / 1024).toFixed(1)} MB / {(progress.total / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-400/5 border border-red-400/30 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-mvo-border/30">
          {!force && (
            <button
              onClick={onClose}
              disabled={downloading}
              className="px-4 py-2 text-sm text-mvo-textDim hover:text-white border border-mvo-border/50 rounded-xl transition-colors disabled:opacity-50"
            >
              Later
            </button>
          )}
          <button
            onClick={onUpdate}
            disabled={downloading}
            className="px-5 py-2 text-sm font-medium bg-cyan-400 text-black rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {progress?.status === 'installing' ? 'Installing...' : 'Downloading...'}
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                {force ? 'Update Now' : 'Download & Install'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
