import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { Cpu, HardDrive, MemoryStick, Wifi, ArrowDown, ArrowUp, Info as InfoIcon, AlertTriangle as AlertTriangleIcon, CheckCircle as CheckCircleIcon } from 'lucide-react';

interface BottomBarProps {
  performance: any;
  hardwareSensors: any;
  windowState: string;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function BottomBar({ performance, hardwareSensors, windowState }: BottomBarProps) {
  const [version, setVersion] = useState('...');
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  const hs = hardwareSensors;
  const cpuPercent = hs?.cpuUsage?.toFixed(1) || performance?.snapshot?.cpu_usage?.toFixed(1) || '0';
  const memPercent = hs?.memTotal > 0 ? ((hs.memUsed / hs.memTotal) * 100).toFixed(1) : performance?.snapshot && performance.snapshot.total_memory > 0 ? ((performance.snapshot.used_memory / performance.snapshot.total_memory) * 100).toFixed(1) : '0';
  const diskPercent = performance?.snapshot && performance.snapshot.total_storage > 0 ? ((performance.snapshot.used_storage / performance.snapshot.total_storage) * 100).toFixed(1) : '0';

  const totalRx = hs?.networkSpeeds?.reduce((sum: number, n: any) => sum + (n.receivedRate || 0), 0) || 0;
  const totalTx = hs?.networkSpeeds?.reduce((sum: number, n: any) => sum + (n.transmittedRate || 0), 0) || 0;

  const statusItems = [
    { label: 'CPU', value: `${cpuPercent}%`, icon: <Cpu className="w-4 h-4" />, color: 'text-cyan-400' },
    { label: 'RAM', value: `${memPercent}%`, icon: <MemoryStick className="w-4 h-4" />, color: 'text-purple-400' },
    { label: 'Disk', value: `${diskPercent}%`, icon: <HardDrive className="w-4 h-4" />, color: 'text-amber-400' },
    { label: 'GPU', value: hs?.gpuUsage ? `${hs.gpuUsage.toFixed(0)}%` : '--', icon: <Cpu className="w-4 h-4" />, color: 'text-green-400' },
    { label: 'NET', value: `${formatSpeed(totalRx)} / ${formatSpeed(totalTx)}`, icon: <Wifi className="w-4 h-4" />, color: 'text-blue-400' },
  ];

  return (
    <footer className="h-10 bg-mvo-panel/80 backdrop-blur-xl border-t border-mvo-border/50 flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-4 text-xs">
        <span className="px-2 py-0.5 bg-cyan-400/20 text-cyan-400 rounded-full font-mono text-[10px] uppercase tracking-wider">
          MVO Hub
        </span>
        <span className="text-mvo-textMuted font-mono">|</span>
        <span className="text-mvo-textDim font-mono">
          {windowState === 'maximized' ? 'MAXIMIZED' : windowState === 'fullscreen' ? 'FULLSCREEN' : 'WINDOWED'}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center gap-6">
        {statusItems.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className={`${item.color}`}>{item.icon}</span>
            <span className="text-mvo-textDim font-medium">{item.label}</span>
            <span className="font-mono text-mvo-text tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="text-mvo-textMuted font-mono">v{version}</span>
        <span className="text-mvo-textDim font-mono">|</span>
        <button className="flex items-center gap-1 text-mvo-textDim hover:text-cyan-400 transition-colors p-1 rounded" title="Diagnostics">
          <InfoIcon className="w-3.5 h-3.5" />
        </button>
        <button className="flex items-center gap-1 text-mvo-textDim hover:text-amber-400 transition-colors p-1 rounded" title="Notifications">
          <AlertTriangleIcon className="w-3.5 h-3.5" />
        </button>
        <button className="flex items-center gap-1 text-mvo-textDim hover:text-green-400 transition-colors p-1 rounded" title="System OK">
          <CheckCircleIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </footer>
  );
}
