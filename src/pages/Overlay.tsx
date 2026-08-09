import { useState } from 'react';
import { GlassCard } from '../components/ui';
import { Monitor, FolderOpen, Loader2, TrendingUp, CheckCircle, AlertTriangle, Cpu, Thermometer, Gauge, Activity } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function Overlay({ overlay, hardwareSensors }: any) {
  useLocale();
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const hs = hardwareSensors;

  const run = async (id: string, cmd: string) => {
    setLoading(id);
    setToast(null);
    try {
      const res = await invoke<string>(cmd);
      setToast({ msg: res, ok: true });
    } catch (e: any) {
      setToast({ msg: String(e), ok: false });
    }
    setLoading(null);
  };

  const tools = [
    { id: 'rtss', name: 'RTSS', status: overlay?.tools?.find((t: any) => t.id === 'rtss')?.status || 'missing', path: overlay?.tools?.find((t: any) => t.id === 'rtss')?.path, desc: t('overlay.rtssDesc') },
    { id: 'afterburner', name: 'MSI Afterburner', status: overlay?.tools?.find((t: any) => t.id === 'afterburner')?.status || 'missing', path: overlay?.tools?.find((t: any) => t.id === 'afterburner')?.path, desc: t('overlay.afterburnerDesc') },
    { id: 'hwinfo', name: 'HWiNFO64', status: overlay?.tools?.find((t: any) => t.id === 'hwinfo')?.status || 'missing', path: overlay?.tools?.find((t: any) => t.id === 'hwinfo')?.path, desc: t('overlay.hwinfoDesc') },
    { id: 'xbox', name: 'Xbox Game Bar', status: overlay?.tools?.find((t: any) => t.id === 'xbox')?.status || 'missing', path: null, desc: t('overlay.xboxDesc') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">{t('overlay.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('overlay.subtitle')}</p>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${toast.ok ? 'bg-green-400/10 text-green-400 border border-green-400/30' : 'bg-red-400/10 text-red-400 border border-red-400/30'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {hs && (
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-400" /> Live Hardware Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-strong rounded-lg p-4 text-center">
              <Cpu className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-mvo-text">{hs.cpuUsage?.toFixed(1) || '0'}%</div>
              <div className="text-xs text-mvo-textDim mt-1">CPU Usage</div>
              <div className="text-xs text-mvo-textMuted">{hs.cpuDevice?.name || 'Unknown'}</div>
            </div>
            <div className="glass-strong rounded-lg p-4 text-center">
              <Thermometer className="w-5 h-5 text-red-400 mx-auto mb-2" />
              <div className={`text-2xl font-bold ${hs.gpuTemperature > 80 ? 'text-red-400' : 'text-mvo-text'}`}>{hs.gpuTemperature?.toFixed(0) || '--'}°C</div>
              <div className="text-xs text-mvo-textDim mt-1">GPU Temp</div>
              <div className="text-xs text-mvo-textMuted">{hs.gpuDevice?.name || 'No GPU'}</div>
            </div>
            <div className="glass-strong rounded-lg p-4 text-center">
              <Gauge className="w-5 h-5 text-green-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-mvo-text">{hs.gpuUsage?.toFixed(1) || '0'}%</div>
              <div className="text-xs text-mvo-textDim mt-1">GPU Usage</div>
              <div className="text-xs text-mvo-textMuted">{hs.gpuPower ? `${hs.gpuPower.toFixed(0)}W` : 'N/A'}</div>
            </div>
            <div className="glass-strong rounded-lg p-4 text-center">
              <Monitor className="w-5 h-5 text-purple-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-mvo-text">{hs.gpuVramTotal ? `${(hs.gpuVramTotal / 1e9).toFixed(1)}` : '0'} GB</div>
              <div className="text-xs text-mvo-textDim mt-1">VRAM Total</div>
              <div className="text-xs text-mvo-textMuted">{hs.gpuVramUsed ? `${(hs.gpuVramUsed / 1e9).toFixed(1)} GB used` : 'N/A'}</div>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tools.map(tool => (
          <GlassCard key={tool.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${tool.status === 'detected' ? 'bg-green-500/20 text-green-400' : 'bg-mvo-border/20 text-mvo-textDim'}`}>
                  <Monitor className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-mvo-text">{tool.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${tool.status === 'detected' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {tool.status}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm text-mvo-textDim mb-4">{tool.desc}</p>
            {tool.path && (
              <div className="text-xs text-mvo-textMuted font-mono mb-4 truncate">{tool.path}</div>
            )}
            <div className="flex gap-2">
              <button onClick={() => run(`${tool.id}-launch`, 'launch_overlay_app')} disabled={loading !== null} className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-1">
                {loading === `${tool.id}-launch` ? <Loader2 className="w-4 h-4 animate-spin" /> : t('overlay.launch')}
              </button>
              <button onClick={() => run(`${tool.id}-admin`, 'launch_overlay_app_admin')} disabled={loading !== null} className="btn-secondary py-2 text-sm flex items-center justify-center">
                {loading === `${tool.id}-admin` ? <Loader2 className="w-4 h-4 animate-spin" /> : t('overlay.admin')}
              </button>
              {tool.path && (
                <button onClick={() => run(`${tool.id}-folder`, 'open_overlay_settings_folder')} disabled={loading !== null} className="btn-ghost py-2 text-sm">
                  <FolderOpen className="w-4 h-4" />
                </button>
              )}
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-cyan-400" /> {t('overlay.recommendedSetup')}</h3>
        <div className="space-y-3 text-sm">
          <div className="p-3 glass rounded-xl">{t('overlay.setupStep1')}</div>
          <div className="p-3 glass rounded-xl">{t('overlay.setupStep2')}</div>
          <div className="p-3 glass rounded-xl">{t('overlay.setupStep3')}</div>
          <div className="p-3 glass rounded-xl">{t('overlay.setupStep4')}</div>
          <div className="p-3 glass rounded-xl">{t('overlay.setupStep5')}</div>
        </div>
      </GlassCard>
    </div>
  );
}
