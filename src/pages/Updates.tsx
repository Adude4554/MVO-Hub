import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DownloadIcon, CheckCircleIcon, Loader2, RefreshCwIcon, InfoIcon } from 'lucide-react';
import { GlassCard } from '../components/ui';

export function Updates() {
  const [currentVersion] = useState('0.1.0');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState('');

  const checkForUpdates = async () => {
    setChecking(true);
    setStatus('');
    try {
      const result = await invoke<string>('check_for_updates');
      const info = JSON.parse(result);
      if (info.available) {
        setUpdateAvailable(true);
        setUpdateVersion(info.version);
        setUpdateNotes(info.notes || '');
        setStatus(`Update v${info.version} is available`);
      } else {
        setUpdateAvailable(false);
        setStatus('App is up to date');
      }
    } catch (e) {
      setStatus('Failed to check for updates: ' + String(e));
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    setDownloading(true);
    try {
      await invoke('download_and_install_update');
    } catch (e) {
      setStatus('Update failed: ' + String(e));
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">Updates</h1>
        <p className="text-mvo-textDim mt-1">Manage app updates and version info</p>
      </div>

      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-mvo-text">Current Version</h3>
            <p className="text-mvo-textDim text-sm">v{currentVersion}-beta</p>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-green-400" />
            <span className="text-green-400 text-sm font-medium">Installed</span>
          </div>
        </div>
        <div className="border-t border-mvo-border/30 pt-4">
          <button onClick={checkForUpdates} disabled={checking} className="btn-secondary flex items-center gap-2">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
            {checking ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>
        {status && <p className="mt-3 text-sm text-mvo-textDim">{status}</p>}
      </GlassCard>

      {updateAvailable && (
        <GlassCard className="p-6 border-cyan-400/30">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-cyan-400 mb-1">Update Available: v{updateVersion}</h3>
              {updateNotes && <p className="text-sm text-mvo-textDim whitespace-pre-line">{updateNotes}</p>}
            </div>
            <button onClick={installUpdate} disabled={downloading} className="btn-primary flex items-center gap-2 shrink-0">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
              {downloading ? 'Installing...' : 'Install'}
            </button>
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><InfoIcon className="w-5 h-5 text-cyan-400" /> About Updates</h3>
        <div className="space-y-2 text-sm text-mvo-textDim">
          <p>MVO Hub checks for updates automatically on startup.</p>
          <p>When an update is available, you'll see a notification banner at the top of the app.</p>
          <p>Updates are downloaded and installed automatically. The app will restart after installation.</p>
          <p className="text-mvo-textMuted text-xs mt-3">Update server: GitHub Releases</p>
        </div>
      </GlassCard>
    </div>
  );
}
