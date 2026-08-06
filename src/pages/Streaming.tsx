import { useState } from 'react';
import { GlassCard } from '../components/ui';
import { Tv, Mic, Settings, FolderOpen, Wifi, Mic2, Camera as CameraIcon, Monitor, Globe, Volume2, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function Streaming({ streaming }: any) {
  useLocale();
  const tools = streaming?.snapshot?.tools || [];
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const run = async (id: string, cmd: string, args?: Record<string, any>) => {
    setLoading(id);
    setToast(null);
    try {
      const res = await invoke<string>(cmd, args);
      setToast({ msg: res, ok: true });
    } catch (e: any) {
      setToast({ msg: String(e), ok: false });
    }
    setLoading(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">{t('stream.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('stream.subtitle')}</p>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${toast.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400"><Tv className="w-6 h-6" /></div>
            <div>
              <h3 className="font-semibold">OBS Studio</h3>
              <span className="text-xs text-mvo-textDim">{tools.find((t: any) => t.id === 'obs')?.status || t('stream.notDetected')}</span>
            </div>
          </div>
          <div className="space-y-2">
            <button onClick={() => run('obs-launch', 'launch_exe', { path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' })} disabled={loading !== null} className="w-full btn-primary py-2 text-sm flex items-center justify-center gap-2">
              {loading === 'obs-launch' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('stream.launchObs')}
            </button>
            <button onClick={() => run('obs-admin', 'launch_exe_admin', { path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' })} disabled={loading !== null} className="w-full btn-secondary py-2 text-sm flex items-center justify-center gap-2">
              {loading === 'obs-admin' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('stream.launchAdmin')}
            </button>
            <button onClick={() => run('obs-folder', 'open_url', { url: 'C:\\Program Files\\obs-studio' })} disabled={loading !== null} className="w-full btn-ghost py-2 text-sm flex items-center justify-center gap-2">
              <FolderOpen className="w-4 h-4" /> {t('library.openFolder')}
            </button>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-pink-500/20 text-pink-400"><Mic className="w-6 h-6" /></div>
            <div>
              <h3 className="font-semibold">{t('stream.audio')}</h3>
              <span className="text-xs text-mvo-textDim">{t('stream.audioDesc')}</span>
            </div>
          </div>
          <div className="space-y-2">
            <button onClick={() => run('mic-privacy', 'open_url', { url: 'ms-settings:privacy-microphone' })} disabled={loading !== null} className="w-full btn-secondary py-2 text-sm flex items-center gap-2 justify-center">
              {loading === 'mic-privacy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mic2 className="w-4 h-4" /> {t('stream.micPrivacy')}</>}
            </button>
            <button onClick={() => run('sound-settings', 'open_url', { url: 'ms-settings:sound' })} disabled={loading !== null} className="w-full btn-secondary py-2 text-sm flex items-center gap-2 justify-center">
              {loading === 'sound-settings' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Volume2 className="w-4 h-4" /> {t('stream.soundSettings')}</>}
            </button>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400"><CameraIcon className="w-6 h-6" /></div>
            <div>
              <h3 className="font-semibold">{t('stream.video')}</h3>
              <span className="text-xs text-mvo-textDim">{t('stream.videoDesc')}</span>
            </div>
          </div>
          <div className="space-y-2">
            <button onClick={() => run('cam-privacy', 'open_url', { url: 'ms-settings:privacy-webcam' })} disabled={loading !== null} className="w-full btn-secondary py-2 text-sm flex items-center gap-2 justify-center">
              {loading === 'cam-privacy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CameraIcon className="w-4 h-4" /> {t('stream.camPrivacy')}</>}
            </button>
            <button onClick={() => run('capture', 'open_url', { url: 'ms-settings:windowscapture' })} disabled={loading !== null} className="w-full btn-secondary py-2 text-sm flex items-center gap-2 justify-center">
              {loading === 'capture' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Monitor className="w-4 h-4" /> {t('stream.windowsCapture')}</>}
            </button>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard>
          <h3 className="font-semibold p-4 border-b border-mvo-border/30">{t('stream.quickSettings')}</h3>
          <div className="p-4 space-y-3">
            <button onClick={() => run('obs-settings', 'open_url', { url: 'obs://settings' })} disabled={loading !== null} className="w-full flex items-center gap-3 p-2 glass rounded-lg hover:bg-mvo-panelHover/50 transition-colors text-left">
              <Settings className="w-5 h-5 text-mvo-textDim" />
              <div className="flex-1">
                <p className="font-medium text-sm">{t('stream.obsSettings')}</p>
                <p className="text-xs text-mvo-textDim">{t('stream.obsSettingsDesc')}</p>
              </div>
            </button>
            <button onClick={() => run('stream-health', 'open_url', { url: 'ms-settings:network-status' })} disabled={loading !== null} className="w-full flex items-center gap-3 p-2 glass rounded-lg hover:bg-mvo-panelHover/50 transition-colors text-left">
              <Globe className="w-5 h-5 text-mvo-textDim" />
              <div className="flex-1">
                <p className="font-medium text-sm">{t('stream.streamHealth')}</p>
                <p className="text-xs text-mvo-textDim">{t('stream.streamHealthDesc')}</p>
              </div>
            </button>
            <button onClick={() => run('net-opt', 'flush_dns')} disabled={loading !== null} className="w-full flex items-center gap-3 p-2 glass rounded-lg hover:bg-mvo-panelHover/50 transition-colors text-left">
              <Wifi className="w-5 h-5 text-mvo-textDim" />
              <div className="flex-1">
                <p className="font-medium text-sm">{t('stream.networkOptimizer')}</p>
                <p className="text-xs text-mvo-textDim">{t('stream.networkOptimizerDesc')}</p>
              </div>
            </button>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="font-semibold p-4 border-b border-mvo-border/30">{t('stream.healthMetrics')}</h3>
          <div className="p-4 space-y-3">
            {[
              { label: t('stream.bitrate'), value: '6000 kbps' },
              { label: t('stream.droppedFrames'), value: '0.1%' },
              { label: t('dashboard.cpuUsage'), value: '12%' },
              { label: t('stream.fps'), value: '60' },
              { label: t('stream.network'), value: t('stream.stable') },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-mvo-textDim">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{item.value}</span>
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
