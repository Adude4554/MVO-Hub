import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DownloadIcon, CheckCircleIcon, Loader2, RefreshCwIcon, InfoIcon, ArrowUpCircle, Shield } from 'lucide-react';
import { GlassCard } from '../components/ui';
import { useToast } from '../components/Toast';

interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  pub_date?: string;
  force?: boolean;
  local?: string;
}

export function Updates() {
  const [currentVersion, setCurrentVersion] = useState('');
  const [remoteVersion, setRemoteVersion] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [lastChecked, setLastChecked] = useState('');
  const toast = useToast();

  const check = useCallback(async () => {
    setChecking(true);
    setStatus('');
    try {
      const result = await invoke<string>('check_for_updates');
      const info: UpdateInfo = JSON.parse(result);
      setCurrentVersion(info.local || '');
      setRemoteVersion(info.version || '');
      setUpdateNotes(info.notes || '');
      setLastChecked(new Date().toLocaleString());
      if (info.available) {
        setUpdateAvailable(true);
        setStatus(`Update v${info.version} is available!`);
      } else {
        setUpdateAvailable(false);
        setStatus('You have the latest version!');
        toast.success('You have the latest version!');
      }
    } catch (e) {
      setStatus('Failed to check for updates: ' + String(e));
      toast.error('Update check failed');
    } finally {
      setChecking(false);
    }
  }, []);

  const installUpdate = async () => {
    setDownloading(true);
    try {
      await invoke('download_and_install_update');
    } catch (e) {
      setStatus('Update failed: ' + String(e));
      setDownloading(false);
      toast.error('Update installation failed');
    }
  };

  useEffect(() => { check(); }, []);

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
            <p className="text-mvo-textDim text-sm">{currentVersion ? `v${currentVersion}` : 'Loading...'}</p>
          </div>
          <div className="flex items-center gap-2">
            {updateAvailable ? (
              <>
                <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
                <span className="text-cyan-400 text-sm font-medium">Update Available</span>
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
                <span className="text-green-400 text-sm font-medium">Up to Date</span>
              </>
            )}
          </div>
        </div>
        <div className="border-t border-mvo-border/30 pt-4 flex items-center gap-3">
          <button onClick={check} disabled={checking} className="btn-secondary flex items-center gap-2">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
            {checking ? 'Checking...' : 'Check for Updates'}
          </button>
          {lastChecked && <span className="text-xs text-mvo-textMuted">Last checked: {lastChecked}</span>}
        </div>
        {status && (
          <p className={`mt-3 text-sm font-medium ${updateAvailable ? 'text-cyan-400' : 'text-green-400'}`}>
            {status}
          </p>
        )}
      </GlassCard>

      {updateAvailable && (
        <GlassCard className="p-6 border-cyan-400/30">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-cyan-400 mb-1">Update Available: v{remoteVersion}</h3>
              {updateNotes && <p className="text-sm text-mvo-textDim whitespace-pre-line mt-2">{updateNotes}</p>}
            </div>
            <button onClick={installUpdate} disabled={downloading} className="btn-primary flex items-center gap-2 shrink-0">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
              {downloading ? 'Installing...' : 'Install Update'}
            </button>
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Shield className="w-5 h-5 text-cyan-400" /> About Updates</h3>
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
