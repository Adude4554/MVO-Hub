import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DownloadIcon, Loader2, CheckCircleIcon, AlertTriangle } from 'lucide-react';

interface UpdateLockScreenProps {
  version: string;
  notes: string;
}

export function UpdateLockScreen({ version, notes }: UpdateLockScreenProps) {
  const [status, setStatus] = useState<'downloading' | 'installing' | 'done' | 'error'>('downloading');
  const [progress, setProgress] = useState('Preparing download...');
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const run = async () => {
      try {
        setProgress('Downloading update...');
        setStatus('downloading');
        await invoke('download_and_install_update');
        setStatus('done');
        setProgress('Update installed. Restarting...');
      } catch (e) {
        setError(String(e));
        setStatus('error');
      }
    };
    run();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-mvo-bg flex items-center justify-center select-none" style={{ pointerEvents: 'all' }}>
      <div className="w-full max-w-lg p-8 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center mb-6">
          {status === 'done' ? (
            <CheckCircleIcon className="w-10 h-10 text-white" />
          ) : status === 'error' ? (
            <AlertTriangle className="w-10 h-10 text-white" />
          ) : (
            <DownloadIcon className="w-10 h-10 text-white" />
          )}
        </div>

        <h1 className="font-display text-2xl font-bold text-mvo-text mb-2">
          {status === 'error' ? 'Update Failed' : 'Update Required'}
        </h1>
        <p className="text-mvo-textDim mb-1">
          {status === 'error'
            ? 'Something went wrong during the update'
            : 'A new version of MVO Hub is available'}
        </p>
        <p className="text-cyan-400 font-semibold text-lg mb-4">v{version}</p>

        {notes && (
          <div className="bg-mvo-panel/50 border border-mvo-border/30 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs text-mvo-textMuted mb-2 font-semibold uppercase">What's New</p>
            <p className="text-sm text-mvo-textDim whitespace-pre-line">{notes}</p>
          </div>
        )}

        {status === 'error' && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 py-3">
          {status === 'downloading' || status === 'installing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              <span className="text-mvo-text text-sm font-medium">{progress}</span>
            </>
          ) : status === 'done' ? (
            <>
              <CheckCircleIcon className="w-5 h-5 text-green-400" />
              <span className="text-green-400 text-sm font-medium">{progress}</span>
            </>
          ) : (
            <button
              onClick={() => {
                setError('');
                setStatus('downloading');
                setProgress('Retrying download...');
                started.current = false;
                const run = async () => {
                  try {
                    await invoke('download_and_install_update');
                    setStatus('done');
                    setProgress('Update installed. Restarting...');
                  } catch (e) {
                    setError(String(e));
                    setStatus('error');
                  }
                };
                run();
              }}
              className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center gap-2"
            >
              <DownloadIcon className="w-4 h-4" />
              Retry
            </button>
          )}
        </div>

        <p className="text-xs text-mvo-textMuted mt-6">The app will restart automatically after installation</p>
      </div>
    </div>
  );
}
