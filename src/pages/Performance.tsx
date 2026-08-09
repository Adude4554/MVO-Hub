import React, { useMemo } from 'react';
import { GlassCard, MetricCard } from '../components/ui';
import { Cpu as CpuIcon, MemoryStick, HardDrive, Activity, Thermometer, Database, Server, Gauge } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export const Performance = React.memo(function Performance({ performance, hardwareSensors }: any) {
  useLocale();
  const snap = performance?.snapshot;
  const hs = hardwareSensors;

  const memPercent = hs?.memTotal > 0 ? ((hs.memUsed / hs.memTotal) * 100).toFixed(1) : snap && snap.total_memory > 0 ? ((snap.used_memory / snap.total_memory) * 100).toFixed(1) : '0';
  const cpuPercent = hs?.cpuUsage?.toFixed(1) || snap?.cpu_usage?.toFixed(1) || '0';
  const diskPercent = snap && snap.total_storage > 0 ? ((snap.used_storage / snap.total_storage) * 100).toFixed(1) : '0';

  const cpuHistory = useMemo(() => performance?.history?.slice(-60) || [], [performance?.history]);
  const memHistory = useMemo(() => performance?.history?.slice(-60) || [], [performance?.history]);

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">{t('perf.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('perf.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label={t('dashboard.cpuUsage')} value={`${cpuPercent}%`} icon={<CpuIcon className="w-6 h-6" />} color="cyan" progress={parseFloat(cpuPercent) / 100} subtitle={`${hs?.cpuCoresPhysical || '?'} physical / ${hs?.cpuCoresLogical || '?'} logical`} />
        <MetricCard label={t('dashboard.memory')} value={`${memPercent}%`} icon={<MemoryStick className="w-6 h-6" />} color="purple" progress={parseFloat(memPercent) / 100} subtitle={hs?.memTotal > 0 ? `${(hs.memUsed / 1e9).toFixed(1)} / ${(hs.memTotal / 1e9).toFixed(1)} GB` : `${(snap?.used_memory || 0) / 1e9} / ${(snap?.total_memory || 0) / 1e9} GB`} />
        <MetricCard label={t('dashboard.storage')} value={`${diskPercent}%`} icon={<HardDrive className="w-6 h-6" />} color="amber" progress={parseFloat(diskPercent) / 100} subtitle={`${formatBytes(snap?.used_storage || 0)} / ${formatBytes(snap?.total_storage || 0)}`} />
        <MetricCard label={t('perf.uptime')} value={`${Math.floor((snap?.uptime_seconds || hs?.snapshot?.uptimeSeconds || 0) / 3600)}h ${Math.floor(((snap?.uptime_seconds || hs?.snapshot?.uptimeSeconds || 0) % 3600) / 60)}m`} icon={<Activity className="w-6 h-6" />} color="green" progress={0} subtitle={t('perf.systemUptime')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Gauge className="w-5 h-5 text-cyan-400" /> {t('dashboard.cpuHistory')}</h3>
          <div className="h-48 flex items-end gap-1">
            {cpuHistory.map((h: any, i: number) => (
              <div key={i} className="flex-1 bg-cyan-400/20 rounded-t transition-all duration-200 hover:bg-cyan-400" style={{ height: `${Math.max(h.cpu_usage || 0, 1)}%` }} title={`${(h.cpu_usage || 0).toFixed(1)}%`} />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-purple-400" /> {t('dashboard.memoryHistory')}</h3>
          <div className="h-48 flex items-end gap-1">
            {memHistory.map((h: any, i: number) => (
              <div key={i} className="flex-1 bg-purple-400/20 rounded-t transition-all duration-200 hover:bg-purple-400" style={{ height: `${Math.max((h.total_memory > 0 ? (h.used_memory / h.total_memory) * 100 : 0), 1)}%` }} title={`${(h.total_memory > 0 ? (h.used_memory / h.total_memory) * 100 : 0).toFixed(1)}%`} />
            ))}
          </div>
        </GlassCard>
      </div>

      {hs?.cpuCores && hs.cpuCores.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><CpuIcon className="w-5 h-5 text-cyan-400" /> Per-Core Usage</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {hs.cpuCores.map((core: any) => (
              <div key={core.index} className="glass-strong rounded-lg p-2 text-center">
                <div className="text-[10px] text-mvo-textDim mb-1">Core {core.index}</div>
                <div className="h-16 bg-mvo-bg rounded overflow-hidden relative">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-500 to-cyan-400 rounded transition-all duration-300"
                    style={{ height: `${Math.min(core.usage, 100)}%` }}
                  />
                </div>
                <div className="text-xs font-mono text-mvo-text mt-1">{core.usage.toFixed(0)}%</div>
                {core.frequency > 0 && <div className="text-[10px] text-mvo-textDim">{core.frequency.toFixed(0)} MHz</div>}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-cyan-400" /> {t('dashboard.cpuDetails')}</h3>
          <div className="space-y-3 text-sm">
            <DetailRow label={t('dashboard.name')} value={hs?.cpuDevice?.name || 'Unknown'} />
            <DetailRow label={t('dashboard.cores')} value={`${hs?.cpuCoresPhysical || '?'} / ${hs?.cpuCoresLogical || '?'}`} />
            <DetailRow label={t('dashboard.currentUsage')} value={`${cpuPercent}%`} />
            <DetailRow label="Frequency" value={hs?.cpuFrequency ? `${hs.cpuFrequency.toFixed(0)} MHz` : 'N/A'} />
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Thermometer className="w-5 h-5 text-red-400" /> {t('dashboard.gpuDetails')}</h3>
          <div className="space-y-3 text-sm">
            <DetailRow label={t('dashboard.name')} value={hs?.gpuDevice?.name || 'Not detected'} />
            <DetailRow label={t('dashboard.vram')} value={hs?.gpuVramTotal ? `${(hs.gpuVramTotal / 1e9).toFixed(1)} GB` : 'N/A'} />
            <DetailRow label={t('dashboard.driver')} value={hs?.gpuDevice?.driverVersion || 'N/A'} />
            <DetailRow label={t('dashboard.temp')} value={hs?.gpuTemperature ? `${hs.gpuTemperature.toFixed(0)}°C` : 'N/A'} />
            <DetailRow label={t('perf.usage')} value={hs?.gpuUsage ? `${hs.gpuUsage.toFixed(1)}%` : 'N/A'} />
            <DetailRow label={t('perf.power')} value={hs?.gpuPower ? `${hs.gpuPower.toFixed(0)}W` : 'N/A'} />
            {hs?.gpuFan > 0 && <DetailRow label="Fan Speed" value={`${hs.gpuFan.toFixed(0)}%`} />}
            {hs?.gpuClockGraphics > 0 && <DetailRow label="GPU Clock" value={`${hs.gpuClockGraphics.toFixed(0)} MHz`} />}
            {hs?.gpuClockMemory > 0 && <DetailRow label="Memory Clock" value={`${hs.gpuClockMemory.toFixed(0)} MHz`} />}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-green-400" /> {t('dashboard.disks')}</h3>
          <div className="space-y-3 text-sm max-h-64 overflow-y-auto">
            {hs?.storageDevices?.map((d: any, i: number) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-mvo-textDim">{d.name}</span>
                  <span className="font-mono text-xs">{d.model || d.id}</span>
                </div>
                <div className="flex justify-between text-xs text-mvo-textDim">
                  <span>{d.source}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
});

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-mvo-border/30">
      <span className="text-mvo-textDim">{label}</span>
      <span className="font-mono text-mvo-text">{value}</span>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}