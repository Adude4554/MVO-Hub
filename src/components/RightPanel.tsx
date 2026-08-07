import { XIcon, Cpu, HardDrive, MemoryStick, Wifi, Info as InfoIcon, Gamepad2 as Gamepad2Icon, Monitor as MonitorIcon, Bot as BotIcon } from 'lucide-react';

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  performance: any;
  hardware: any;
  games: any;
  overlay: any;
  streaming: any;
}

const metricCards = [
  { label: 'CPU Usage', icon: Cpu, color: 'text-cyan-400', getValue: (p: any) => p?.snapshot?.cpu_usage?.toFixed(1) + '%' || '--' },
  { label: 'Memory', icon: MemoryStick, color: 'text-purple-400', getValue: (p: any) => p?.snapshot && p.snapshot.total_memory > 0 ? ((p.snapshot.used_memory / p.snapshot.total_memory) * 100).toFixed(1) + '%' : '--' },
  { label: 'Storage', icon: HardDrive, color: 'text-amber-400', getValue: (p: any) => p?.snapshot && p.snapshot.total_storage > 0 ? ((p.snapshot.used_storage / p.snapshot.total_storage) * 100).toFixed(1) + '%' : '--' },
  { label: 'Network', icon: Wifi, color: 'text-green-400', getValue: () => 'Online' },
];

export function RightPanel({ isOpen, onClose, performance, hardware, games, overlay, streaming }: RightPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-12 bottom-10 z-40 w-full md:w-80 bg-mvo-panel/95 backdrop-blur-xl border-l border-mvo-border/50 flex flex-col animate-slide-in">
      <div className="flex items-center justify-between p-4 border-b border-mvo-border/50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎮</span>
          <div>
            <p className="font-semibold text-mvo-text">Quick Panel</p>
            <p className="text-xs text-mvo-textMuted">System overview</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover transition-colors">
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="glass rounded-xl p-4">
          <h3 className="font-semibold text-mvo-text mb-3 flex items-center gap-2"><InfoIcon className="w-5 h-5 text-cyan-400" /> Quick Status</h3>
          <div className="grid grid-cols-2 gap-3">
            {metricCards.map((metric, i) => (
              <div key={i} className="glass-strong rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`${metric.color}`}><metric.icon className="w-4 h-4" /></span>
                  <span className="text-xs text-mvo-textMuted">{metric.label}</span>
                </div>
                <div className="font-mono font-semibold text-mvo-text">{metric.getValue(performance)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <h3 className="font-semibold text-mvo-text mb-3 flex items-center gap-2"><Gamepad2Icon className="w-5 h-5 text-purple-400" /> Games</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-mvo-textDim">Total Games</span>
              <span className="font-mono font-semibold text-mvo-text">{games?.allGames?.length || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-mvo-textDim">Steam Games</span>
              <span className="font-mono font-semibold text-mvo-text">{games?.games?.filter((g: any) => g.source === 'Steam').length || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-mvo-textDim">Favorites</span>
              <span className="font-mono font-semibold text-mvo-text">{games?.games?.filter((g: any) => g.is_favorite).length || 0}</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <h3 className="font-semibold text-mvo-text mb-3 flex items-center gap-2"><MonitorIcon className="w-5 h-5 text-orange-400" /> Overlay Tools</h3>
          <div className="space-y-2">
            {overlay?.tools?.map((tool: any) => (
              <div key={tool.id} className="flex items-center justify-between text-sm">
                <span className="text-mvo-textDim">{tool.name}</span>
                <span className={`text-xs font-medium ${tool.status === 'detected' ? 'text-green-400' : 'text-mvo-textDim'}`}>{tool.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <h3 className="font-semibold text-mvo-text mb-3 flex items-center gap-2"><BotIcon className="w-5 h-5 text-pink-400" /> AI Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-mvo-textDim">Provider</span>
              <span className="font-mono font-semibold text-mvo-text">Ollama</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-mvo-textDim">Model</span>
              <span className="font-mono font-semibold text-mvo-text">llama3.1</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-mvo-border/50">
        <div className="flex items-center gap-2 text-xs text-mvo-textMuted">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span>System Healthy</span>
        </div>
      </div>
    </div>
  );
}
