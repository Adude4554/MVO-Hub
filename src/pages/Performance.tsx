import { GlassCard, MetricCard } from '../components/ui';
import { Cpu as CpuIcon, MemoryStick, HardDrive, Activity, Thermometer, Database, Server, Gauge } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function Performance({ performance, hardware }: any) {
  useLocale();
  const snap = performance?.snapshot;
  const hw = hardware?.snapshot;

  const memPercent = snap ? ((snap.used_memory / snap.total_memory) * 100).toFixed(1) : '0';
  const cpuPercent = snap?.cpu_usage?.toFixed(1) || '0';
  const diskPercent = snap ? ((snap.used_storage / snap.total_storage) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">{t('perf.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('perf.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label={t('dashboard.cpuUsage')} value={`${cpuPercent}%`} icon={<CpuIcon className="w-6 h-6" />} color="cyan" progress={parseFloat(cpuPercent) / 100} subtitle={`${hw?.cpu_cores || '?'} cores • ${hw?.cpu_name || 'Unknown'}`} />
        <MetricCard label={t('dashboard.memory')} value={`${memPercent}%`} icon={<MemoryStick className="w-6 h-6" />} color="purple" progress={parseFloat(memPercent) / 100} subtitle={`${(snap?.used_memory || 0) / 1e9} / ${(snap?.total_memory || 0) / 1e9} GB`} />
        <MetricCard label={t('dashboard.storage')} value={`${diskPercent}%`} icon={<HardDrive className="w-6 h-6" />} color="amber" progress={parseFloat(diskPercent) / 100} subtitle={`${formatBytes(snap?.used_storage || 0)} / ${formatBytes(snap?.total_storage || 0)}`} />
        <MetricCard label={t('perf.uptime')} value={`${Math.floor((snap?.uptime || 0) / 3600)}h ${Math.floor(((snap?.uptime || 0) % 3600) / 60)}m`} icon={<Activity className="w-6 h-6" />} color="green" progress={0} subtitle={t('perf.systemUptime')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Gauge className="w-5 h-5 text-cyan-400" /> {t('dashboard.cpuHistory')}</h3>
          <div className="h-48 flex items-end gap-1">
            {performance?.history?.slice(-60).map((h: any, i: number) => (
              <div key={i} className="flex-1 bg-cyan-400/20 rounded-t transition-all duration-200 hover:bg-cyan-400" style={{ height: `${Math.max(h.cpu_usage, 1)}%` }} title={`${h.cpu_usage.toFixed(1)}%`} />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-purple-400" /> {t('dashboard.memoryHistory')}</h3>
          <div className="h-48 flex items-end gap-1">
            {performance?.history?.slice(-60).map((h: any, i: number) => (
              <div key={i} className="flex-1 bg-purple-400/20 rounded-t transition-all duration-200 hover:bg-purple-400" style={{ height: `${Math.max(((h.used_memory / h.total_memory) * 100), 1)}%` }} title={`${((h.used_memory / h.total_memory) * 100).toFixed(1)}%`} />
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-cyan-400" /> {t('dashboard.cpuDetails')}</h3>
          <div className="space-y-3 text-sm">
            <DetailRow label={t('dashboard.name')} value={hw?.cpu_name || 'Unknown'} />
            <DetailRow label={t('dashboard.cores')} value={`${hw?.cpu_cores || '?'} / ${hw?.cpu_threads || '?'}`} />
            <DetailRow label={t('dashboard.currentUsage')} value={`${cpuPercent}%`} />
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Thermometer className="w-5 h-5 text-red-400" /> {t('dashboard.gpuDetails')}</h3>
          <div className="space-y-3 text-sm">
            <DetailRow label={t('dashboard.name')} value={hw?.gpu?.name || 'Not detected'} />
            <DetailRow label={t('dashboard.vram')} value={hw?.gpu?.memory_total ? `${(hw.gpu.memory_total / 1e9).toFixed(1)} GB` : 'N/A'} />
            <DetailRow label={t('dashboard.driver')} value={hw?.gpu?.driver_version || 'N/A'} />
            <DetailRow label={t('dashboard.temp')} value={hw?.gpu?.temperature ? `${hw.gpu.temperature}°C` : 'N/A'} />
            <DetailRow label={t('perf.usage')} value={hw?.gpu?.usage ? `${hw.gpu.usage.toFixed(1)}%` : 'N/A'} />
            <DetailRow label={t('perf.power')} value={hw?.gpu?.power ? `${hw.gpu.power.toFixed(0)}W` : 'N/A'} />
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-green-400" /> {t('dashboard.disks')}</h3>
          <div className="space-y-3 text-sm max-h-64 overflow-y-auto">
            {hw?.disks?.map((d: any, i: number) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-mvo-textDim">{d.name}</span>
                  <span className="font-mono">{d.mount_point}</span>
                </div>
                <div className="h-2 bg-mvo-bg rounded-full overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full" style={{ width: `${d.total_bytes > 0 ? (d.used_bytes / d.total_bytes) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-xs text-mvo-textDim">
                  <span>{formatBytes(d.used_bytes)} {t('dashboard.used')}</span>
                  <span>{formatBytes(d.total_bytes)} {t('dashboard.total')}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

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