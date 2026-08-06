import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DownloadIcon, Loader2, RefreshCwIcon } from 'lucide-react';

interface UpdateLockScreenProps {
  version: string;
  notes: string;
  onUpdateComplete: () => void;
}

export function UpdateLockScreen({ version, notes, onUpdateComplete }: UpdateLockScreenProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const installUpdate = async () => {
    setDownloading(true);
    setError('');
    setProgress('Downloading update...');
    try {
      await invoke('download_and_install_update');
    } catch (e) {
      setError(String(e));
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-mvo-bg flex items-center justify-center">
      <div className="w-full max-w-lg p-8 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center mb-6">
          <DownloadIcon className="w-10 h-10 text-white" />
        </div>

        <h1 className="font-display text-2xl font-bold text-mvo-text mb-2">Update Required</h1>
        <p className="text-mvo-textDim mb-1">A new version of MVO Hub is available</p>
        <p className="text-cyan-400 font-semibold text-lg mb-4">v{version}</p>

        {notes && (
          <div className="bg-mvo-panel/50 border border-mvo-border/30 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs text-mvo-textMuted mb-2 font-semibold uppercase">What's New</p>
            <p className="text-sm text-mvo-textDim whitespace-pre-line">{notes}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={installUpdate}
          disabled={downloading}
          className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {downloading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {progress || 'Installing...'}
            </>
          ) : (
            <>
              <DownloadIcon className="w-5 h-5" />
              Download & Install Update
            </>
          )}
        </button>

        <p className="text-xs text-mvo-textMuted mt-4">You must install this update to continue using MVO Hub</p>
      </div>
    </div>
  );
}
