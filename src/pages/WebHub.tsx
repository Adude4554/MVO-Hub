import { ExternalLinkIcon, Globe, Book, Puzzle, Zap, Wifi, Monitor, Camera, Shield, Cpu, Database, Brain } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

const webShortcuts = [
  { id: 'steamdb', name: 'SteamDB', url: 'https://steamdb.info', icon: Globe, category: 'Gaming', desc: 'Steam database & prices' },
  { id: 'pcgamingwiki', name: 'PCGamingWiki', url: 'https://pcgamingwiki.com', icon: Book, category: 'Gaming', desc: 'Game fixes & tweaks' },
  { id: 'nexusmods', name: 'Nexus Mods', url: 'https://nexusmods.com', icon: Puzzle, category: 'Gaming', desc: 'Game mods' },
  { id: 'speedtest', name: 'Speedtest', url: 'https://speedtest.net', icon: Zap, category: 'Network', desc: 'Internet speed test' },
  { id: 'downdetector', name: 'Downdetector', url: 'https://downdetector.com', icon: Wifi, category: 'Network', desc: 'Service outage reports' },
  { id: 'fpsmonitor', name: 'FPS Monitor', url: 'https://fpsmonitor.com', icon: Monitor, category: 'Tools', desc: 'Hardware monitoring overlay' },
  { id: 'obs', name: 'OBS Studio', url: 'https://obsproject.com', icon: Camera, category: 'Streaming', desc: 'Streaming/recording software' },
  { id: 'nvidia', name: 'NVIDIA Drivers', url: 'https://nvidia.com/Download', icon: Shield, category: 'Drivers', desc: 'GPU drivers' },
  { id: 'amd', name: 'AMD Drivers', url: 'https://amd.com/en/support', icon: Shield, category: 'Drivers', desc: 'GPU drivers' },
  { id: 'intel', name: 'Intel Drivers', url: 'https://intel.com/content/www/us/en/download-center.html', icon: Cpu, category: 'Drivers', desc: 'GPU/CPU drivers' },
  { id: 'hwinfo', name: 'HWiNFO64', url: 'https://hwinfo.com/download', icon: Database, category: 'Tools', desc: 'Hardware monitoring' },
  { id: 'ollama', name: 'Ollama', url: 'https://ollama.com/download', icon: Brain, category: 'AI', desc: 'Local AI models' },
  { id: 'ai_studio', name: 'Google AI Studio', url: 'https://aistudio.google.com', icon: Brain, category: 'AI', desc: 'Gemini API playground' },
];

export function WebHub() {
  useLocale();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">{t('web.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('web.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {webShortcuts.map(item => (
          <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="glass p-4 rounded-xl hover:border-mvo-borderBright/5 hover:bg-mvo-panelHover/30 transition-all group">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400">
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-mvo-text group-hover:text-cyan-400 transition-colors">{item.name}</h3>
                <p className="text-xs text-mvo-textDim truncate">{item.desc}</p>
              </div>
              <ExternalLinkIcon className="w-5 h-5 text-mvo-textDim group-hover:text-mvo-text transition-colors" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs bg-mvo-bg rounded text-mvo-textDim">{item.category}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
