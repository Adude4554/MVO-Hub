import { X as XIcon, Cpu, HardDrive, MemoryStick, Thermometer, Wifi, ArrowDown, ArrowUp, Info as InfoIcon, Gamepad2 as Gamepad2Icon, Monitor as MonitorIcon, Bot as BotIcon } from 'lucide-react';

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  performance: any;
  hardwareSensors: any;
  games: any;
  overlay: any;
  streaming: any;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function RightPanel({ isOpen, onClose, performance, hardwareSensors, games, overlay, streaming }: RightPanelProps) {
  if (!isOpen) return null;

  const hs = hardwareSensors;
  const cpuPercent = hs?.cpuUsage?.toFixed(1) || performance?.snapshot?.cpu_usage?.toFixed(1) || '--';
  const memPercent = hs?.memTotal > 0 ? ((hs.memUsed / hs.memTotal) * 100).toFixed(1) : performance?.snapshot && performance.snapshot.total_memory > 0 ? ((performance.snapshot.used_memory / performance.snapshot.total_memory) * 100).toFixed(1) : '--';
  const diskPercent = performance?.snapshot && performance.snapshot.total_storage > 0 ? ((performance.snapshot.used_storage / performance.snapshot.total_storage) * 100).toFixed(1) : '--';
  const gpuTemp = hs?.gpuTemperature ? `${hs.gpuTemperature.toFixed(0)}°C` : '--';

  const totalRx = hs?.networkSpeeds?.reduce((sum: number, n: any) => sum + (n.receivedRate || 0), 0) || 0;
  const totalTx = hs?.networkSpeeds?.reduce((sum: number, n: any) => sum + (n.transmittedRate || 0), 0) || 0;

  const metricCards = [
    { label: 'CPU Usage', icon: Cpu, color: 'text-cyan-400', value: `${cpuPercent}%` },
    { label: 'Memory', icon: MemoryStick, color: 'text-purple-400', value: `${memPercent}%` },
    { label: 'Storage', icon: HardDrive, color: 'text-amber-400', value: `${diskPercent}%` },
    { label: 'GPU Temp', icon: Thermometer, color: 'text-green-400', value: gpuTemp },
  ];

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
                <div className="font-mono font-semibold text-mvo-text">{metric.value}</div>
              </div>
            ))}
          </div>
        </div>

        {hs?.gpuDevice && (
          <div className="glass rounded-xl p-4">
            <h3 className="font-semibold text-mvo-text mb-3 flex items-center gap-2"><MonitorIcon className="w-5 h-5 text-green-400" /> GPU</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-mvo-textDim">Model</span>
                <span className="font-mono text-mvo-text truncate max-w-[140px]">{hs.gpuDevice.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-mvo-textDim">Usage</span>
                <span className="font-mono text-green-400">{hs.gpuUsage?.toFixed(0) || '--'}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-mvo-textDim">VRAM</span>
                <span className="font-mono text-mvo-text">{hs.gpuVramTotal ? `${(hs.gpuVramTotal / 1e9).toFixed(1)} GB` : '--'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-mvo-textDim">Power</span>
                <span className="font-mono text-mvo-text">{hs.gpuPower ? `${hs.gpuPower.toFixed(0)}W` : '--'}</span>
              </div>
            </div>
          </div>
        )}

        {totalRx > 0 || totalTx > 0 ? (
          <div className="glass rounded-xl p-4">
            <h3 className="font-semibold text-mvo-text mb-3 flex items-center gap-2"><Wifi className="w-5 h-5 text-blue-400" /> Network</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-mvo-textDim flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Download</span>
                <span className="font-mono text-blue-400">{formatSpeed(totalRx)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-mvo-textDim flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Upload</span>
                <span className="font-mono text-blue-400">{formatSpeed(totalTx)}</span>
              </div>
              {hs?.networkSpeeds?.slice(0, 2).map((iface: any) => (
                <div key={iface.deviceId} className="flex items-center justify-between text-xs">
                  <span className="text-mvo-textDim truncate max-w-[120px]">{iface.name}</span>
                  <span className="font-mono text-mvo-text">{formatSpeed(iface.receivedRate)} / {formatSpeed(iface.transmittedRate)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
