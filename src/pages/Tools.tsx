import { useState } from 'react';
import { ExternalLinkIcon, DatabaseIcon, MonitorIcon, Gamepad2Icon, CameraIcon, BrainIcon, ShieldIcon, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function Tools() {
  useLocale();
  const [loading, setLoading] = useState<string | null>(null);

  const tools = [
    { id: 'hwinfo', name: 'HWiNFO64', icon: DatabaseIcon, desc: t('tools.hwinfoDesc'), url: 'https://hwinfo.com/download', status: 'detected', category: 'Monitoring' },
    { id: 'afterburner', name: 'MSI Afterburner', icon: MonitorIcon, desc: t('tools.afterburnerDesc'), url: 'https://guru3d.com/download-msi-afterburner', status: 'detected', category: 'GPU' },
    { id: 'rtss', name: 'RTSS', icon: MonitorIcon, desc: t('tools.rtssDesc'), url: 'https://guru3d.com/download-rivatuner-statistics-server', status: 'detected', category: 'Overlay' },
    { id: 'fpsmonitor', name: 'FPS Monitor', icon: Gamepad2Icon, desc: t('tools.fpsMonitorDesc'), url: 'https://fpsmonitor.net', status: 'missing', category: 'Overlay' },
    { id: 'obs', name: 'OBS Studio', icon: CameraIcon, desc: t('tools.obsDesc'), url: 'https://obsproject.com', status: 'detected', category: 'Streaming' },
    { id: 'steam', name: 'Steam', icon: Gamepad2Icon, desc: t('tools.steamDesc'), url: 'https://store.steampowered.com/about/', status: 'detected', category: 'Gaming' },
    { id: 'ollama', name: 'Ollama', icon: BrainIcon, desc: t('tools.ollamaDesc'), url: 'https://ollama.com/download', status: 'missing', category: 'AI' },
    { id: 'nvidia', name: 'NVIDIA Drivers', icon: ShieldIcon, desc: t('tools.nvidiaDesc'), url: 'https://nvidia.com/Download', status: 'detected', category: 'Drivers' },
    { id: 'amd', name: 'AMD Drivers', icon: ShieldIcon, desc: t('tools.amdDesc'), url: 'https://amd.com/en/support', status: 'detected', category: 'Drivers' },
  ];

  const openLink = async (id: string, url: string) => {
    setLoading(id);
    try {
      await invoke<string>('open_url', { url });
    } catch (e) {
      console.error(e);
    }
    setLoading(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">{t('tools.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('tools.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map(tool => (
          <button key={tool.id} onClick={() => openLink(tool.id, tool.url)} disabled={loading !== null} className="glass p-4 rounded-xl flex items-start gap-4 hover:border-mvo-borderBright/50 hover:bg-mvo-panelHover/30 transition-all text-left disabled:opacity-50">
            <div className={`p-3 rounded-xl ${tool.status === 'detected' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
              {loading === tool.id ? <Loader2 className="w-6 h-6 animate-spin" /> : <tool.icon className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-mvo-text">{tool.name}</h3>
              <p className="text-xs text-mvo-textDim truncate">{tool.desc}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded ${tool.status === 'detected' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {tool.status === 'detected' ? t('tools.detected') : t('tools.notDetected')}
              </span>
              <ExternalLinkIcon className="w-5 h-5 text-mvo-textDim hover:text-mvo-text transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
